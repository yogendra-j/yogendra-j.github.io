---
title: "TypeScript Discriminated Unions: Make Invalid States Impossible"
date: 2024-05-25 00:00:00 +0530
categories: [typescript, union-types]
tags: [typescript, discriminated-unions, type-narrowing, react]
description: >-
  Replace loose union fields with a discriminated union: one literal tag picks the shape, TypeScript narrows the rest, and never or satisfies flags missed cases.
image:
  path: /assets/img/og/posts/discriminated-unions.jpg
  alt: "TypeScript Discriminated Unions: Make Invalid States Impossible"
---

A union on each field lets a type describe states that should never exist. A **discriminated union** describes each valid state as its own object shape, tagged by a literal field. TypeScript then narrows the whole object when you check that field.

## The problem: independent unions

```ts
type SelectProps = {
  multiple: boolean;
  value: string | string[];
  onChange: (value: string | string[]) => void;
};
```

This type accepts `multiple: false` with `value: ['a', 'b']`. Every consumer has to check `Array.isArray(value)` or cast, and nothing ties `onChange` to the mode in use.

## The fix: one tag decides the shape

```ts
type SelectProps =
  | {
      multiple: true;
      value: string[];
      onChange: (value: string[]) => void;
    }
  | {
      multiple?: false;
      value: string;
      onChange: (value: string) => void;
    };
```

`multiple` is the discriminant. Its literal type (`true` or `false | undefined`) selects which object you have, and the other fields follow. The mismatched combination is now a compile error:

```tsx
// Error: Type 'string[]' is not assignable to type 'string'.
<Select value={['a']} onChange={() => {}} />
```

## Narrowing in a React component

```tsx
function Select(props: SelectProps) {
  if (props.multiple) {
    // props.value: string[], props.onChange: (value: string[]) => void
    return <p>{props.value.join(', ')}</p>;
  }
  // props.value: string
  return <p>{props.value}</p>;
}

export function Demo() {
  return (
    <div>
      <Select value="a" onChange={(v) => console.log(v.toUpperCase())} />
      <Select multiple value={['a', 'b']} onChange={(v) => console.log(v.length)} />
    </div>
  );
}
```

At the call site, `v` is inferred as `string` or `string[]` from the props you pass. No annotations, no casts.

> Destructuring keeps narrowing (TypeScript 4.6+) when you destructure the discriminant and the fields together: `({ multiple, value }: SelectProps)` works. A rest spread does not: in `({ multiple, ...rest })`, checking `multiple` leaves `rest.value` as `string | string[]`.
{: .prompt-warning }

## Exhaustiveness with `never`

When a union grows a variant, you want every `switch` that handles it to fail compilation until it is updated:

```ts
type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'rect'; width: number; height: number };

function area(shape: Shape): number {
  switch (shape.kind) {
    case 'circle':
      return Math.PI * shape.radius ** 2;
    case 'rect':
      return shape.width * shape.height;
    default:
      return assertNever(shape);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(value)}`);
}
```

After the handled cases, `shape` is narrowed to `never`. Add `{ kind: 'triangle'; base: number; height: number }` to `Shape` and the `default` branch fails with "Argument of type `{ kind: "triangle"; ... }` is not assignable to parameter of type `never`". The runtime `throw` covers data that bypassed the types, such as an unvalidated API response.

## Exhaustiveness for lookup tables with `satisfies`

For maps keyed by the tag, `satisfies` checks that every key exists while keeping the literal type of the object:

```ts
type RequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: string[] }
  | { status: 'error'; error: Error };

const statusLabel = {
  idle: 'Not started',
  loading: 'Loading',
  success: 'Done',
  error: 'Failed',
} satisfies Record<RequestState['status'], string>;

function describe(state: RequestState): string {
  if (state.status === 'success') return `${state.data.length} items`;
  if (state.status === 'error') return state.error.message;
  return statusLabel[state.status];
}
```

Remove the `loading` key and the compiler reports `Property 'loading' is missing`. Add a `'cancelled'` status and `statusLabel` fails until you label it.

## When not to use one

- **The fields really are independent.** If any combination is valid, a union of shapes just multiplies cases.
- **The variants differ by one optional field.** `{ id: string; deletedAt?: Date }` reads better than two shapes.
- **The data comes from outside your code.** A discriminated union describes what you expect, not what arrives. Parse at the boundary (for example, with a Zod `discriminatedUnion`) and use the type after validation.
- **The variant count keeps growing across modules.** Every `switch` becomes an edit site. If new kinds are added often by different teams, an interface with per-kind implementations may age better.

## Rule of thumb

If you find yourself writing `Array.isArray`, `in`, or `as` to recover which state you are in, the type has lost information you had when you created the value. Put it back as a tag.
