import type { Dictionary } from '@constants/constants';

((Symbol as { metadata?: symbol }).metadata as symbol | undefined) ??= Symbol('Symbol.metadata');

type Ctor = new () => object;
type Factory = () => Ctor;

export interface SubType {
    name: string;
    value: Ctor;
}

interface FieldPlan {
    relation?: Factory;
    subTypes?: () => SubType[];
    exclude?: true;
    transform?: (params: { value: unknown }) => unknown;
}

const FIELDS = Symbol('talvis.fields');

type Metadata = Record<PropertyKey, unknown>;

function fieldsOn(metadata: Metadata): Record<string, FieldPlan> {
    if (!Object.hasOwn(metadata, FIELDS)) {
        metadata[FIELDS] = Object.create((metadata[FIELDS] as object | undefined) ?? null) as Record<string, FieldPlan>;
    }
    return metadata[FIELDS] as Record<string, FieldPlan>;
}

function planFor(target: object): Record<string, FieldPlan> {
    const metadata = (target.constructor as { [Symbol.metadata]?: Metadata })[Symbol.metadata];
    return (metadata?.[FIELDS] as Record<string, FieldPlan> | undefined) ?? {};
}

const define = (plan: FieldPlan) => (_value: undefined, context: ClassFieldDecoratorContext) => {
    Object.assign((fieldsOn(context.metadata as Metadata)[String(context.name)] ??= {}), plan);
};

export const Type = (factory: Factory) => define({ relation: factory });

export const Exclude = () => define({ exclude: true });

export const Transform = (transform: (params: { value: unknown }) => unknown) => define({ transform });

export const Discriminated = (subTypes: () => SubType[], fallback: Factory) => define({ subTypes, relation: fallback });

function build(ctor: Ctor, raw: unknown): unknown {
    if (raw === null || typeof raw !== 'object') return raw;
    if (Array.isArray(raw)) return raw.map((item) => build(ctor, item));
    return hydrate(new ctor(), raw);
}

function buildPolymorphic(field: FieldPlan, raw: unknown): unknown {
    if (raw === null || typeof raw !== 'object') return raw;
    if (Array.isArray(raw)) return raw.map((item) => buildPolymorphic(field, item));

    const name = (raw as Dictionary)['class'];
    const match = typeof name === 'string' ? field.subTypes?.().find((s) => s.name === name) : undefined;
    return build(match?.value ?? field.relation!(), raw);
}

/*
 * Deliberately no id coercion. `Serializable.id` is declared `string` while the API sends a
 * number, but making `id` a string on its own splits it from the 81 `*_id` foreign keys,
 * which cannot follow (10 of them are declared `number`). That mismatch silently breaks the
 * ~16 `project.id === x.project_id` comparisons across the app. The mistyped `id` is instead
 * handled where it actually bites: `idOf()` and `instanceof` narrowing, which are correct
 * whichever type arrives.
 */
function convert(key: string, raw: unknown, field: FieldPlan | undefined): unknown {
    if (!field) return raw;
    if (field.transform) return field.transform({ value: raw });
    if (field.subTypes) return buildPolymorphic(field, raw);
    if (field.relation) return build(field.relation(), raw);
    return raw;
}

function isAssignable(instance: object, key: string): boolean {
    for (let o: object | null = instance; o && o !== Object.prototype; o = Object.getPrototypeOf(o) as object | null) {
        const descriptor = Object.getOwnPropertyDescriptor(o, key);
        if (!descriptor) continue;
        if (descriptor.get || descriptor.set) return descriptor.set !== undefined;
        if (typeof descriptor.value === 'function') return false;
        return descriptor.writable !== false;
    }
    return true;
}

export function hydrate<T extends object>(instance: T, json: unknown): T {
    if (!json || typeof json !== 'object') return instance;
    const plan = planFor(instance);
    const target = instance as unknown as Dictionary<unknown>;

    for (const [key, raw] of Object.entries(json as Dictionary)) {
        const field = plan[key];
        if (field?.exclude || !isAssignable(instance, key)) continue;
        target[key] = convert(key, raw, field);
    }
    return instance;
}
