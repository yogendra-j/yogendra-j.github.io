---
title: "TypeScript Node.js Project Setup: A Minimal Modern Starter"
date: 2024-04-28 00:00:00 +0530
categories: [init, node]
tags: [typescript, nodejs, pnpm, eslint, vitest, prettier, project-setup]
description: >-
  Node 24 runs .ts files directly, so a TypeScript project needs no ts-node: tsc only type-checks, plus native --watch, ESLint flat config, Vitest, and pnpm.
redirect_from:
  - /posts/Setting-up-new-Typescipt-Node-proejct-in-2024/
image:
  path: /assets/img/og/posts/typescript-node-setup.jpg
  alt: "TypeScript Node.js Project Setup: A Minimal Modern Starter"
---

> **Updated October 2026.** The 2024 version of this post used `ts-node` and an ESM loader flag. Current Node runs TypeScript files natively, which removes most of that setup.
{: .prompt-info }

**The short version:** on Node 24 LTS, `node src/main.ts` works with no flags. Node strips the type annotations and runs the result. It does not type-check, so `tsc` becomes a checker, not a runner. Watch mode and `.env` loading are built into Node too.

| Concern | Tool |
| --- | --- |
| Run TypeScript | `node` (type stripping) |
| Reload on change | `node --watch` |
| Environment variables | `node --env-file-if-exists=.env` |
| Type checking | `tsc --noEmit` |
| Lint | ESLint flat config + `typescript-eslint` |
| Format | Prettier |
| Test | Vitest |
| Packages | pnpm |

## Node version facts

| Node version | Type stripping |
| --- | --- |
| 22.6 | Added behind `--experimental-strip-types` |
| 23.6, 22.18 | Enabled by default, no flag needed |
| 24.3, 22.18 | No more experimental warning |
| 25.2, 24.12 | Marked stable |

Use Node 24 or newer. Node 22.18+ works too. Source: the [Node.js TypeScript docs](https://nodejs.org/api/typescript.html).

Tested with Node 24.14, pnpm 10.33, TypeScript 6.0, ESLint 10.11, typescript-eslint 8.71, Vitest 5.0, and Prettier 3.9.

## 1. Create the project

```bash
mkdir my-service && cd my-service
git init
pnpm init
pnpm pkg set type=module
pnpm add -D typescript@~6.0 @types/node@24 eslint @eslint/js typescript-eslint eslint-config-prettier prettier vitest
```

`type: module` makes `.ts` files run as ES modules. Match `@types/node` to the Node major version you deploy on.

> TypeScript 7 is out, but typescript-eslint 8.71 supports only `typescript >=4.8.4 <6.1.0`. Pin TypeScript 6.0 until typescript-eslint supports 7.
{: .prompt-warning }

## 2. `tsconfig.json`

Node ignores `tsconfig.json`. This file exists for the type checker and the editor, and it is set up to reject TypeScript that Node cannot run.

```json
{
  "compilerOptions": {
    "target": "es2024",
    "module": "nodenext",
    "types": ["node"],
    "noEmit": true,

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "skipLibCheck": true,

    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "rewriteRelativeImportExtensions": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

The options that matter for type stripping:

- **`erasableSyntaxOnly`** errors on syntax that has runtime behavior: `enum`, namespaces with code, constructor parameter properties, and `import x = require()`. Node rejects all of these at runtime. Use `as const` objects instead of enums.
- **`verbatimModuleSyntax`** requires `import type` for type-only imports. Without it, `import { User } from './user.ts'` type-checks but fails in Node with "does not provide an export named 'User'".
- **`rewriteRelativeImportExtensions`** lets you write `./greet.ts` in imports, which Node requires, and rewrites them to `.js` if you ever compile.
- **`noUncheckedIndexedAccess`** types `arr[i]` as `T | undefined`. It is not part of `strict`, and it catches real bugs.

## 3. Write code with `.ts` imports

```ts
// src/greet.ts
export type Greeting = { name: string };

export function greet({ name }: Greeting): string {
  return `Hello, ${name}`;
}
```

```ts
// src/main.ts
import { greet, type Greeting } from './greet.ts';

const user: Greeting = { name: process.env.USER_NAME ?? 'world' };
console.log(greet(user));
```

```bash
node src/main.ts
```

## 4. ESLint flat config

```js
// eslint.config.js
import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/'] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  prettier,
);
```

`prettier` goes last so it turns off the formatting rules that conflict with Prettier. For rules that need type information (floating promises, unsafe `any`), switch to `tseslint.configs.recommendedTypeChecked` and enable `parserOptions.projectService`. It is slower but catches more.

## 5. Prettier

```json
{
  "singleQuote": true,
  "trailingComma": "all"
}
```

Save that as `.prettierrc`, and list generated files in `.prettierignore`:

```text
dist
pnpm-lock.yaml
```

## 6. Tests

Vitest runs TypeScript without configuration:

```ts
// src/greet.test.ts
import { describe, expect, it } from 'vitest';
import { greet } from './greet.ts';

describe('greet', () => {
  it('greets by name', () => {
    expect(greet({ name: 'Ada' })).toBe('Hello, Ada');
  });
});
```

## 7. Scripts

```json
{
  "scripts": {
    "dev": "node --watch --env-file-if-exists=.env src/main.ts",
    "start": "node src/main.ts",
    "typecheck": "tsc",
    "lint": "eslint .",
    "format": "prettier --write .",
    "test": "vitest run",
    "check": "pnpm typecheck && pnpm lint && prettier --check . && pnpm test"
  }
}
```

`tsc` emits nothing here because of `noEmit`. Run `pnpm check` in CI.

## Optional: compile to JavaScript

A service can run its `.ts` files directly in production. A **library** cannot: Node refuses to strip types from files under `node_modules`, so packages must ship JavaScript. Add a `tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "rootDir": "src",
    "outDir": "dist",
    "sourceMap": true
  },
  "exclude": ["src/**/*.test.ts"]
}
```

Then `tsc -p tsconfig.build.json` writes `dist/`, with `./greet.ts` imports rewritten to `./greet.js`.

## When to use tsx instead

Native type stripping has limits. Use [tsx](https://tsx.is/) (`pnpm add -D tsx`, then `tsx watch src/main.ts`) when you need:

- enums, decorators, or parameter properties, for example in an existing NestJS-style codebase
- `paths` aliases from `tsconfig.json`, which Node does not read
- extensionless imports
- a Node version older than 22.18

tsx is also the simpler replacement for `ts-node` in older projects. Like Node, it does not type-check, so keep `tsc` in `check`.
