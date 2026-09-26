# Resource API pattern (Angular 22)

How data loading is done in TALVIS now that `resource()` / `rxResource()` / `httpResource()` are stable.

## TL;DR

- **Reads** go through `modelResource()` / `modelListResource()` (`src/models/http/model-resource.ts`), thin wrappers around `rxResource`.
- **Mutations stay imperative.** `store()` / `update()` / `delete()`, uploads, downloads, AI calls and anything triggered by a click keep using `.subscribe()`.
- **Never `httpResource` for TALVIS endpoints.** It bypasses our HTTP layer and returns plain JSON.

## Why `rxResource`, not `httpResource`

Our data flow is:

```
TalvisHttpService verb  ->  HttpWrapper.request()  ->  rxjs operators  ->  component
   (apiPath, model)        If-Modified-Since            mapVar/serialize
                           error toast (notifyHttpError)
                           mutation notification (NotificationCenter)
                           deserializeBody -> Model.fromJson per item
```

`Model.fromJson` is not cosmetic: it produces real `Serializable` instances, which is what
`[nx]`, `*nxFor`, `getName()`, `frontendUrl()`, `update()`, `snapshot()` and
`LiveModelRegistry` all require. `httpResource` talks to `HttpClient` directly, so adopting it
would mean re-implementing URL/query building, the conditional-request cache, the error toast,
the mutation broadcast *and* the deserialization inside a `parse` callback — i.e. a second,
divergent HTTP layer. `rxResource` instead consumes the existing `Observable` unchanged, so:

| concern | with `rxResource` |
| --- | --- |
| model instances | preserved (`fromJson` / `serialize` still run) |
| interceptors, `If-Modified-Since`, error toasts | unchanged, they live in `HttpWrapper` |
| cancellation | Angular unsubscribes on param change/destroy → `HttpClient` aborts the request |
| refetch | `resource.reload()` instead of a hand-rolled `#update()` + `isLoading` flag |
| errors | captured into `resource.error()` / `status()` instead of an unhandled rejection |

## The helper

```ts
// no params: loads once, refetch with .reload()
readonly #groups = modelListResource(() => this.#service.index());
readonly groups = this.#groups.value;        // ProductGroup[] (never undefined)
readonly isLoading = this.#groups.isLoading;

// parameterized: reloads when the params signal changes,
// `undefined` params == nothing to load == no request
readonly #customers = modelResource(
    () => this.parent.object()?.id || undefined,
    (id) => this.#service.indexCustomers(id),
);
```

`modelResource` → `value()` is `T | undefined`. `modelListResource` → `value()` defaults to `[]`,
so templates and computeds drop their `?? []`; use `isLoading()` / `hasValue()` to tell
"loading" from "empty".

## Before / after

**Load once + manual refetch** (`product-tree.component.ts`)

```ts
// before
readonly groups = signal<ProductGroup[]>([]);
readonly isLoading = signal(false);
constructor() {
    this.#update();
    NotificationCenter.subscribe(['put','post','delete'], [/^products/], () => this.#update());
}
readonly #update = () => {
    this.isLoading.set(true);
    this.#service.index().subscribe(groups => { this.groups.set(groups); this.isLoading.set(false); });
};

// after
readonly #groups = modelListResource(() => this.#service.index());
readonly groups = this.#groups.value;
readonly isLoading = this.#groups.isLoading;
constructor() {
    NotificationCenter.subscribe(['put','post','delete'], [/^products/], () => this.#groups.reload());
}
```

**Dependent load** (`product-detail-overview.component.ts`)

```ts
// before — re-fetches on every live-sync touch, because the guard signal has `equal: () => false`
rxResource({
    params: () => this.parent.object(),
    stream: ({ params: p }) => p ? this.#service.indexCustomers(p) : of(null),
});

// after — keyed on the id, so only a real navigation refetches
modelResource(
    () => this.parent.object()?.id || undefined,
    (id) => this.#service.indexCustomers(id),
);
```

Rule: **params must be a value key (id, filter object), never a model instance.** Model signals in
this app deliberately re-emit on mutation (`tracked()`, `DetailGuard#touch`), which would turn every
keystroke into a request.

**Derived selection + derived request** (`product-statistics.component.ts`)

```ts
// before: subscribe -> set signals -> call #loadStatistics() -> subscribe -> set signal -> #updateChart()
// after:
readonly #rootGroups = modelListResource(() => this.#productService.getRootGroups());
readonly rootGroups = this.#rootGroups.value;
readonly selectedRootGroups = linkedSignal({           // resets when root groups reload, stays writable
    source: this.rootGroups,
    computation: (groups) => groups.filter(g => g.is_active),
});
readonly #statistics = modelResource(
    () => this.selectedRootGroups().length ? buildFilters() : undefined,
    (filters) => this.#productService.showStatistics(filters),
);
readonly statistics = this.#statistics.value;
readonly chartOption = computed(() => /* derive from statistics() */);
```

No `#load*()` methods, no imperative chart update: changing the period or toggling a group just
writes a signal and the resource reloads itself.

## Keep the typing pattern (CLAUDE.md)

Serialization belongs in the service, not in the resource's consumer:

```ts
showStatistics = (filters?: Dictionary): Observable<ProductStatisticsDto> =>
    this.get('products/statistics', filters ?? {}, Object).pipe(
        mapVar(['total_revenue'], 'top_products'),
        serialize('top_products', Product),
        ...
    );
```

The resource then hands the template real `Product` instances (`[nx]` works) and the
ranking-only extras live on `product.var.total_revenue`. Pass `Object` as the type argument
whenever the payload is an envelope rather than the service's own model — otherwise
`TalvisHttpService` deserializes the envelope into that model.

## Where NOT to use a resource

- **Mutations / commands:** `Serializable.store/update/delete`, `createWithParentId`, param writes,
  AI completions, `postFile`/`getFile`. Resources are re-entrant caches keyed on params; a command
  is a one-shot with a side effect. Keep `.subscribe()`.
- **Route guards / resolvers:** `DetailGuard.canActivate` must *await* one value and block
  navigation — `firstValueFrom(this.show(id))` is correct. A resource cannot block a route.
- **Fire-and-forget streams:** WebSocket/`NotificationCenter`/router-event subscriptions. Use
  `toSignal` or plain subscriptions; there is no request to key on.
- **Pagination with append semantics** (`next_page_url` accumulating into a list): a resource
  replaces its value on reload. Either key the resource on the page number and render one page,
  or keep the imperative loop.
- **Anything whose result must be read once, synchronously, outside the injection context.**
