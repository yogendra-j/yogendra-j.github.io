---
title: Setting Up New Typescript-Node Project in 2024
date: 2024-04-28 00:00:00 +0530
categories: [init, node]
tags: [typescript, init, setup, pnpm, lint, ts-node, watch, prettier]     # TAG names should always be lowercase
---


In this post, we will see how to setup a new typescript-node project in 2024. We will use `pnpm` as package manager, `ts-node` for running typescript code directly, `eslint` for linting, `prettier` for formatting and node --watch for auto-reloading the server.

## Step 1: Create a new directory and initialize a git repository

```bash
mkdir new-project
cd new-project
git init
```

## Step 2: Initialize a new node project

```bash
pnpm init
```

## Step 3: Install required dependencies

```bash
pnpm i -D typescript ts-node @types/node
```

## Step 4: Create a `tsconfig.json` file

```bash
pnpm tsc --init
```

Add the following content to the `tsconfig.json` file:

```jsonc
{
  "compilerOptions": {
     /* Common options for every project: */
    /* ******************************************************** */
    /* ******************************************************** */

    /* allows you to use common js packages from es modules */
    "esModuleInterop": true,

    /* makes ide fast and doesn't show type errors inside the npm packages you use */
    "skipLibCheck": true,

    /* can be adjusted */
    "target": "es2022",

     /* allows you to use js files in your project */
    "allowJs": true,

    /* allows you to import json files */
    "resolveJsonModule": true,

    /* makes every file a module so no 'cannot redeclare block-scoped variables` error */
    "moduleDetection": "force",

    /* warns you about code that single-file transpilers like Babel can't handle */
    /*correctly, preventing runtime issues with features like */
    /* const enums and namespaces without changing */   
    /* TypeScript's behavior. */
    "isolatedModules": true,

    /* TS drops type imports from emitted js. */
    /* So, if the import is a type/interface it'll be dropped. */
    /* But if its a class then it'll be kept. TS can make this distinction but some other transpilers can't */
    /* With this option, any import like: `import {type Card} from ./car;` will be dropped */
    /* and any import like: `import {Card} from ./car;` will be kept. You get what you see. */
    "verbatimModuleSyntax": true,


    /* strict options */

    /* enables all strict type checking options */
    "strict": true,

    /* makes it so you have to use override to override methods */
    "noImplicitOverride": true,

    /* enables strict null/undefined checks for arrays/objects */
    "noUncheckedIndexedAccess": true,

    /* ******************************************************** */
    /* ******************************************************** */


    /* transpilation options */
    /* ******************************************************** */
    /* ******************************************************** */


    "lib": ["es2022", "dom", "dom.iterable"], // omit dom* if not running in browser

    /* If using tsc */
    "module": "NodeNext", // `moduleResolution: NodeNext` is implied from this option
    "outDir": "./dist",
    "sourceMap": true,

    /* If using bundler and/or other transpilers */
    "module": "preserve", // `moduleResolution: Bundler` is implied from this option
    "noEmit": true,

    /* ******************************************************** */
    /* ******************************************************** */
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.spec.ts"]
}
```

## Step 5: Setup eslint configuration
Install eslint extension in vscode.
This will prompt you to answer few questions to setup eslint configuration. This will also install required dependencies.

```bash
pnpm create @eslint/config@latest
```
<!-- write a note that tsconfig file will show error until a ts file is added -->

> Note: `tsconfig.json` file will show error until atleast one `.ts` file is added to the project.

> Note: For making eslint.config.mjs work with eslint extension in vscode, you may need to add the following to your vscode settings.json file: `"eslint.experimental.useFlatConfig": true`

## Step 6: Setup prettier configuration
Install prettier extension in vscode.

```bash
pnpm i -D prettier eslint-config-prettier
```
Now, create a `.prettierrc` file in the root of the project and add the following content:

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "all"
}
```

Add `eslint-config-prettier` in the end of `eslint.config.mjs` file.

Then add `.prettierignore` file in the root of the project and add the following content:

```
node_modules
dist
```

## Step 7: Setup `jest` for testing

```bash
pnpm i -D jest ts-jest @types/jest
```

Add the following content to the `jest.config.ts` file:

```ts
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  moduleFileExtensions: ['ts', 'js'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
};

export default config;
```


## Step 8: Add scripts to `package.json`

```jsonc
{
  "scripts": {
    "dev": "node --env-file=.env --watch -r ts-node/register src/index.ts",
    "build": "tsc",
    "test": "jest", //or node test runner
    "lint": "eslint .",
    "format:fix": "prettier --write . --ignore-unknown",
    "format:check": "prettier --check . --ignore-unknown",
    "pre-build-ci": "pnpm lint && pnpm format:check && pnpm test",
  }
}
```
