---
title: Streamlining Union Types in TypeScript for Better Code Clarity
date: 2024-05-25 00:00:00 +0530
categories: [typescript, union-types]
tags: [ts, types, union, clean]     # TAG names should always be lowercase
description: Using discriminated union types in TypeScript to streamline union types for better code clarity.
---
![ai generated image](/assets/img/typescript-union.jpg)

In TypeScript, managing union types often introduces complexity, particularly with type guards, leading to verbose and less transparent code. Consider this typical scenario:
```ts
type SelectProps = {
  multiple: boolean;
  selected: string | string[];
  onChange: (selected: string | string[]) => void;
}
```
This approach has its drawbacks:
It can create invalid states, like multiple: false with selected as string[].
It necessitates excessive type checks or casts when working with the selected field.
A more efficient solution is using discriminated union types, which rely on the multiple field to control other types:
```ts
type SelectProps = {
  multiple: true;
  selected: string[];
  onChange: (selected: string[]) => void;
} | {
  multiple: false;
  selected: string;
  onChange: (selected: string) => void;
} 
```
With this structure, TypeScript automatically infers the correct type when we write an if condition on the multiple field. This makes our code not only safer but also cleaner and more focused on the core logic.
