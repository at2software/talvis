# Capturing a TALVIS memory leak in Edge

For a tab that climbs into the GBs and pins a CPU core after being left open. Not reproduced on
demand here — 12 navigation cycles between the dashboard and the project list held flat at
50–67 MB with stable DOM and canvas counts — so the evidence has to come from a machine where it
actually happens.

## Root cause found (2026-07-30, Andre's second capture)

Not a leak in the classic sense: heap and DOM stayed bounded for the entire 140-minute session
that ended in a crash. The real signal was `wsMsgs`, silent for 88 minutes then climbing on a
compounding curve (13 → 20 → 43 → 100 → 200 → 373), and `companies/:id`/`projects/:id` requests
going from normal to **14–40 seconds each**.

Traced to `Company`/`Project`'s `timeline_chart` accessor (`FociTimelineQuery`): it ran one
aggregate SQL query *per distinct user* who had ever logged time against that entity - for an
old, active company, that's dozens of queries just for this one chart. Profiled on production:
company 950's full detail response issued **899 queries total**, with this one accessor alone
responsible for ~2 of the ~2.9 seconds. Fixed in `backend` `d974375` by batching it into one
grouped query - verified against 8 real production records with values matching to 4 decimal
places, query count for this piece down from up-to-89 to exactly 1.

Why that surfaces as a client-side crash: LiveSync refetches the full detail payload for any
company/project on screen every time a related row changes anywhere in the system. Andre had the
dashboard open, which renders `[nx]`-bound rows for most active projects and companies - each one
registers in `LiveModelRegistry` the moment it deserializes, regardless of whether the dashboard
needs anything beyond a name and an icon for it. Anyone logging time or updating a quote anywhere
touches some project/company that's almost certainly one of those rows, and each touch pulled the
*full* ~900-query detail payload for a row that only ever needed to show a badge.

Fixed at the source in `frontend` `a611f4f7`: `LiveSyncService` now only does the refetch when at
least one registered instance for that class:id has opted in (`liveSyncEnabled`, default false).
`DetailGuard` opts in the object it holds - the one place actually confirmed to depend on the
in-place update (its `updated$` subscriber was the only consumer). Everything else, including
every dashboard/list row, now goes back to non-live until something explicitly asks for it.

Both fixes reduce the same load from different ends - `d974375` makes each refetch cheap,
`a611f4f7` stops the refetches nobody needed happening at all. **Needs reverification after the
next deploy of both** - the crash hasn't been confirmed to actually stop, only the individual
mechanisms have been.

## What the first capture (Andre, 2026-07-30) showed

The probe ran ~38 minutes before the tab hard-crashed with `Error code: Out of Memory`. Reading it:

- `heapMB` stayed at **38–65 MB** the whole time, and `domNodes` stayed flat around 2680–2692.
  Whatever this is, it is not visible as retained DOM or as retained JS in a once-a-minute
  sample — either it lives outside the JS heap, or it balloons faster than 60 seconds.
- `ws=0` for the full 38 minutes. Read this as **inconclusive, not as a clean bill of health**:
  the probe only wraps `WebSocket` for connections opened *after* it's pasted, and the tab had
  presumably been open and already connected before Andre pasted it. v2 below fixes this by also
  tracking `fetch`/XHR, which nothing can dodge by having started earlier.
- `longtasks` climbed from **8 (1s total) to 11 (5s total)** across the last few sampled
  minutes — both the count *and* the average length were still growing right up to the crash.
  That's the CPU: something on the main thread is doing more work per pass over time, not a
  fixed periodic cost. It's consistent with a computation over a collection that keeps growing.
- The Network panel (separately, not from the probe) showed `stats/team-status` firing several
  times in quick succession, interleaved with large (30–35 kB), increasingly slow (1.96 s → 6.86 s)
  XHRs to numeric-ID paths Chrome's Name column truncated to `950`, `1679`, `1359`. The growing
  duration on repeated calls to what looks like the same resource is the signature of a backlog,
  not of one slow query - `950` was refetched three times, each slower than the last, which reads
  as requests queueing up behind each other on the server rather than three independent one-off
  calls.

### Ruled out by reading the actual source, not by guessing

- **`*ngComponentOutlet` is not recreating dashboard widgets on every change-detection pass.**
  Read `NgComponentOutlet.ngOnChanges` in `@angular/common`: it only tears down and rebuilds the
  component when `ngComponentOutlet` (the component *type*), `ngComponentOutletContent`, or an
  injector input changes. The `inputs` object literal in `dashboard.component.html` is a new
  object every template evaluation, but that only flows through `ngDoCheck` → `setInput()` on the
  *existing* instance - never a rebuild. `componentFor()` also returns a stable class reference
  from a static registry, so the `ngComponentOutlet` input itself never changes identity either.
- **Not the HTTP layer retrying.** No `retry`/`retryWhen` anywhere in `http.wrapper.ts` or the
  interceptor - a failing request just fails once.
- **`GlobalService.dashboards` is assigned once from the `/environment` payload**, not recomputed
  in a `computed()` (which per this repo's own `CLAUDE.md` would break `@for` object identity and
  force teardown/rebuild on every recompute). It only changes reference on a full re-login.
- **Only one interval-based auto-refresh exists anywhere in the frontend**:
  `widget-hr-team.component.ts`'s `timer(60000, 60000)`, which happens to poll `team-status` -
  the same endpoint seen firing repeatedly. It's cleaned up correctly via `takeUntilDestroyed()`,
  so it isn't a leak by itself, but if **more than one browser tab/window has TALVIS open**, each
  runs its own independent 60 s timer against the same endpoint, and their firings drift into
  sync often enough to look bursty - worth ruling out by just asking.

None of that explains the growing long tasks or the backend backlog on its own. The most likely
remaining shape: something is fetching (or processing) a working set that grows across
iterations instead of staying bounded - each pass costs more than the last, which matches both
the long-task trend and the escalating response times. v2 below is built to catch exactly that:
it names every URL, not just one Chrome truncates to `950`.

---

## 1. Leave the probe running (do this first)

**v2** - adds `fetch`/XHR tracking by URL (grouped, e.g. `companies/950/full` →
`companies/:id/full`, so repeats of the same endpoint count together instead of scattering across
Chrome's truncated Name column), and autosaves every sample to `localStorage` so a hard crash
doesn't lose the run - `localStorage` is written by the browser process, not the tab, so it
survives a renderer OOM. Verified standalone (fetch/XHR/WebSocket stubbed, no real browser) before
handing it over: it groups requests correctly, counts a wrapped `WebSocket`'s messages, and writes
to `localStorage` without throwing even when `PerformanceObserver` has no `longtask` support.

Pasting into an already-open, already-connected tab misses whatever the WebSocket already
received before the paste - almost certainly why `ws` read 0 for the full 38 minutes in the first
capture. **Do not "fix" this with an F5 after pasting** - a refresh reloads the whole page, which
throws away everything the pasted script just wrapped and hands the fresh `main.js` an
unmodified `fetch`/`XHR`/`WebSocket` again. The probe only exists in that page instance's JS,
never across a navigation.

To catch the WebSocket from its first message: **close every other TALVIS tab/window**, open one
fresh tab, **F12 → Console first**, *then* navigate to `nexus.at2.me` and paste the moment the
console becomes usable - before login/dashboard finishes loading, if you can. Angular's own
bootstrap takes a network round-trip before it opens the socket, so there's a real window, not a
guaranteed race.

If that window is missed, it's fine - paste anyway. `fetch`/XHR tracking is unaffected either
way (every future request gets caught, mid-session or not) and is the more informative half of
v2. Only the WebSocket tally stays an undercount, and it self-corrects the next time the socket
reconnects (network hiccup, laptop sleep, etc. - pusher-js opens a fresh `WebSocket` each time).

```js
(() => {
  const started = Date.now();
  const STORE_KEY = '__talvis_probe_v2';
  const rows = [];
  const sockets = { messages: 0, bytes: 0, byEvent: {} };
  const requests = new Map();

  const trackRequest = (url, ms) => {
    const key = String(url).replace(location.origin, '').split('?')[0].replace(/\/\d+(?=\/|$)/g, '/:id');
    const e = requests.get(key) || { count: 0, totalMs: 0, maxMs: 0, sample: url };
    e.count++;
    e.totalMs += ms;
    e.maxMs = Math.max(e.maxMs, ms);
    requests.set(key, e);
  };

  const OriginalWS = window.WebSocket;
  function PatchedWS(...args) {
    const ws = new OriginalWS(...args);
    ws.addEventListener('message', (e) => {
      sockets.messages++;
      const size = typeof e.data === 'string' ? e.data.length : (e.data?.byteLength || 0);
      sockets.bytes += size;
      let name = 'other';
      try { name = (JSON.parse(e.data).event || 'other').slice(0, 40); } catch {}
      sockets.byEvent[name] = (sockets.byEvent[name] || 0) + 1;
    });
    return ws;
  }
  PatchedWS.prototype = OriginalWS.prototype;
  Object.assign(PatchedWS, OriginalWS);
  window.WebSocket = PatchedWS;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
    const t0 = performance.now();
    try { return await originalFetch(...args); }
    finally { trackRequest(url, performance.now() - t0); }
  };

  const OriginalXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    const xhr = new OriginalXHR();
    let url, t0;
    const originalOpen = xhr.open.bind(xhr);
    xhr.open = (method, u, ...rest) => { url = u; return originalOpen(method, u, ...rest); };
    const originalSend = xhr.send.bind(xhr);
    xhr.send = (...args) => {
      t0 = performance.now();
      xhr.addEventListener('loadend', () => trackRequest(url, performance.now() - t0), { once: true });
      return originalSend(...args);
    };
    return xhr;
  }
  window.XMLHttpRequest = PatchedXHR;

  let longTasks = 0, longTaskMs = 0;
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { longTasks++; longTaskMs += e.duration; }))
      .observe({ type: 'longtask', buffered: true });
  } catch {}

  const topRequests = (n = 5) =>
    [...requests.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, n)
      .map(([k, v]) => `${k} x${v.count} avg=${Math.round(v.totalMs / v.count)}ms max=${Math.round(v.maxMs)}ms`);

  const sample = () => {
    const row = {
      min: Math.round((Date.now() - started) / 60000),
      heapMB: Math.round(performance.memory.usedJSHeapSize / 1048576),
      limitMB: Math.round(performance.memory.jsHeapSizeLimit / 1048576),
      domNodes: document.getElementsByTagName('*').length,
      canvases: document.querySelectorAll('canvas').length,
      wsMsgs: sockets.messages,
      httpReqs: [...requests.values()].reduce((s, v) => s + v.count, 0),
      longTasks,
      longTaskSec: Math.round(longTaskMs / 1000),
      topRequests: topRequests(),
    };
    rows.push(row);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ rows: rows.slice(-120), wsByEvent: sockets.byEvent, ua: navigator.userAgent, savedAt: new Date().toISOString() }));
    } catch {}
    console.log(`[talvis-probe] ${row.min}min heap=${row.heapMB}MB dom=${row.domNodes} ws=${row.wsMsgs} http=${row.httpReqs} longtasks=${row.longTasks}(${row.longTaskSec}s) top=${row.topRequests[0] || '-'}`);
  };

  sample();
  const id = setInterval(sample, 60000);

  window.__talvisProbe = {
    report: () => { sample(); return JSON.stringify({ rows, wsByEvent: sockets.byEvent, topRequests: topRequests(15), ua: navigator.userAgent }, null, 1); },
    stop: () => clearInterval(id),
  };
  console.log('[talvis-probe v2] running - autosaves every minute, so it survives a crash. Call __talvisProbe.report() any time.');
})();
```

Then **use TALVIS normally and leave the tab open**. It prints one line a minute. When memory has
climbed noticeably, run `__talvisProbe.report()` and send the output.

### Reading the log after a crash

`localStorage` survived the crash even though the JS state didn't - it's written by the browser
process on every `setItem`, not held in the tab that died. It's scoped to the origin
(`https://nexus.at2.me`), not to that specific tab, so clicking **Refresh** on the crash page, or
opening TALVIS in any new tab, gets you back to the same data. No need to reinstall the probe.

**Easiest hand-off** - open the console and run this, which puts the raw JSON straight on the
clipboard, ready to paste into Slack or a text file:

```js
copy(localStorage.getItem('__talvis_probe_v2'))
```

**To read it inline instead**, expand it directly in the console:

```js
JSON.parse(localStorage.getItem('__talvis_probe_v2'))
```

**Without touching the console at all** - **F12** → **Application** tab → **Storage → Local
Storage → https://nexus.at2.me** → click the `__talvis_probe_v2` row, and the value shows in the
preview pane at the bottom.

The very last save is at most 60 seconds old at the moment of the crash, so the final minute
right before it can be missing - everything up to that point is intact.

### Reading it

- **One name in `topRequests` dominates the count**, or its `avg`/`max` climb across samples —
  that endpoint is the backlog. Send the full `topRequests` list from `report()`.
- **`wsMsgs` climbing fast**, or one `wsByEvent` name dominating — a broadcast storm; every event
  runs a refetch and a change-detection pass. Send the `wsByEvent` breakdown.
- **`domNodes` climbing and never coming back down** — a DOM/component leak. Go to part 2.
- **`heapMB` climbing while everything else stays flat** — a pure JS retention. Go to part 3.
- **`longTasks` climbing in count or average length** — that's where the CPU is going, and part
  3's Performance recording will name the function. This is what the first capture showed.

Keep the tab in the foreground while sampling. Edge throttles timers in background tabs, so a
backgrounded tab under-reports.

---

## 2. Detached elements (Edge has a dedicated tool for this)

Best first stop for a DOM leak, and easier to read than a heap snapshot.

1. **F12** → **More tools (+)** → **Detached Elements**
2. Use the app the way that grows memory — open a few detail routes, switch tabs in the activity
   sidebar, open and close a modal
3. Click **Get detached elements**
4. Click **Collect garbage** (the bin icon), then **Get detached elements** again

Anything still listed after a collection is genuinely retained. Expand a node and click
**Analyze** — Edge shows what is holding it. Screenshot that.

---

## 3. Heap snapshot comparison

1. **F12** → **Memory** → **Heap snapshot** → **Take snapshot**
2. Use the app for 10–15 minutes
3. Take a second snapshot
4. Set the dropdown from **Summary** to **Comparison**, and compare against snapshot 1
5. Sort by **Size Delta**

Send a screenshot of the top ~15 rows. What matters is the **Retainers** panel at the bottom for
the biggest row — that names the object holding everything alive.

Two things to note if you see them, because they are known and expected:

- `nexus_loading.webp` is a 239-frame animated image, roughly **9 MB decoded per instance on
  screen**. A handful is fine; a screen rendering dozens of spinners at once is not.
- The app preloads every lazy route chunk after startup (`PreloadAllModules`), so a few MB of
  compiled JS is normal and stops growing once it finishes.

### For the CPU specifically

**F12** → **Performance** → record ~20 seconds while the CPU is pegged → stop. Open **Bottom-Up**
and sort by **Self Time**. The top entry names the function that is spinning. Screenshot it.

---

## Two quick questions, answerable right now from the first capture

Don't need a new repro for these:

1. **Was more than one TALVIS tab or window open?** `team-status` has exactly one auto-poller in
   the whole codebase, and it's per-tab. Multiple tabs means multiple independent 60 s timers
   against the same endpoint, which can drift into sync often enough to look bursty.
2. **What were the full URLs behind `950`, `1679`, `1359`?** If that browser session is still
   open, right-click the Network panel's column header row → enable **Path**, or click one of
   those rows → **Headers** tab → **Request URL**. Chrome's Name column only shows the last path
   segment, so `950` could be almost anything ending in that number.

## What to send back

Whichever of these you have:

- The `__talvisProbe.report()` output, or the crash-recovery `localStorage` read
- The detached-elements screenshot after a garbage collection
- The heap-comparison top rows, with the Retainers panel open on the largest
- The Performance Bottom-Up screenshot
- The two answers above

Also useful: roughly how long the tab had been open, whether live sharing was on, and whether
anyone else was working in TALVIS at the time.
