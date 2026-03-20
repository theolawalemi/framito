<h1 align="center">framito</h1>

<h3 align="center">
  The scaffold that thinks in frameworks. Build your library once, ship it everywhere.
</h3>

<p align="center">
  By <a href="https://x.com/theolawalemi">@Olawale Balo</a> — Product Designer + Design Engineer
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/framito"><img src="https://img.shields.io/npm/v/framito?color=20C55C&label=framito" alt="npm version" /></a>&nbsp;
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/framito?color=20C55C" alt="License" /></a>&nbsp;
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-strict-20C55C" alt="TypeScript" /></a>&nbsp;
  <a href="./package.json"><img src="https://img.shields.io/badge/Dependencies-3-20C55C" alt="Zero dependencies" /></a>
</p>

---

## What is framito?

framito is a CLI that scaffolds a production-ready npm package, letting you ship your library to **Vanilla JS, React, Vue, Svelte, and Solid** simultaneously from a single codebase, with just one `npm publish`.

It is built for library authors who are tired of the same problem: you write something useful, but you have to choose a framework to target, or maintain five separate packages forever.

framito solves this with the **core-adapter pattern.** Your logic lives in a pure, framework-agnostic core, while thin adapters connect it to each framework’s reactivity system. One core. Any framework. Zero duplication.

---

## Quick Start

```sh
npx framito my-library
```

framito will walk you through a short interactive setup:

```
◆  framito  —  Scaffold once, ship to every framework.

◆  Library name?
│  my-library

◆  Which frameworks? (space to select, enter to confirm)
│  ○  Vanilla JS
│  ○  React
│  ○  Vue
│  ○  Svelte
│  ○  Solid

◆  Package naming convention?
│  ● Subpath exports — single core   e.g. my-library, my-library/react
│  ○ Scoped packages — monorepo      e.g. @my-library/core, @my-library/react

◆  Use TypeScript?
│  ● Yes  /  ○ No

◆  Output format?
│  ● ESM + CJS   broadest compatibility (recommended)
│  ○ ESM only    modern bundlers (Vite, Next.js, etc.)

◆  Add Prettier config?
│  ● Yes  /  ○ No

◆  Add GitHub Actions CI?
│  ● Yes  /  ○ No

◆  Pick a starter template:
│  ● Blank            infrastructure only, empty core
│  ○ UI Component     props, state, event handlers (button and input)
│  ○ Form Element     value, validation, error state
│  ○ Data Hook        loading, data, error, refetch (API wrapper)
│  ○ Utility          pure functions, no state (formatters, validators)

◆  Summary
│  Library:    my-library
│  Frameworks: vanilla, react, vue
│  Naming:     subpath
│  TypeScript: yes
│  Output:     dual
│  Prettier:   yes
│  CI:         yes
│  Template:   blank

◆  Create project?
│  ● Yes  /  ○ No
```

Then framito generates your project, installs nothing, and prints your next steps.

---

## What Gets Generated

### Subpath exports (single package)

```
my-library/
├── src/
│   ├── core/
│   │   ├── index.ts         exports everything from core
│   │   ├── machine.ts       pure state logic — zero DOM, zero framework deps
│   │   ├── types.ts         shared TypeScript interfaces
│   │   └── utils.ts         pure helper functions
│   ├── adapters/
│   │   ├── vanilla.ts       createFrame() — wraps core directly
│   │   ├── react.tsx        useFrame()    — useState + useEffect binding
│   │   ├── vue.ts           useFrame()    — Vue ref composable
│   │   ├── svelte.ts        createFrame() — Svelte writable store
│   │   └── solid.ts         createFrame() — Solid signal primitive
│   └── index.ts             re-exports vanilla adapter as the default entry
├── examples/
│   ├── vanilla/             plain HTML file importing the vanilla adapter
│   ├── react/               minimal Vite + React app
│   ├── vue/                 minimal Vite + Vue app
│   ├── svelte/              minimal Vite + Svelte app
│   └── solid/               minimal Vite + Solid app
├── tests/
│   └── core.test.ts         vitest tests for core logic
├── .github/
│   └── workflows/
│       └── ci.yml           GitHub Actions CI (if selected)
├── package.json             subpath exports map, peer deps, scripts
├── tsconfig.json
├── tsup.config.ts           builds all adapters to dist/
├── .prettierrc              Prettier config (if selected)
└── README.md
```

Only the adapters and examples for frameworks you selected are generated.

### Scoped packages (monorepo)

When you choose **Scoped packages**, framito generates a workspace monorepo instead:

```
my-library/
├── package.json             workspace root (private)
├── tsconfig.json
├── packages/
│   ├── core/                @my-library/core
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts
│   │   └── src/
│   │       ├── machine.ts
│   │       ├── types.ts
│   │       ├── utils.ts
│   │       └── index.ts
│   ├── react/               @my-library/react
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts
│   │   └── src/index.tsx
│   └── vue/                 @my-library/vue  (and so on per framework)
├── examples/
├── tests/
│   └── core.test.ts
├── .github/workflows/ci.yml (if selected)
├── .prettierrc              (if selected)
└── README.md
```

Each adapter package declares `@my-library/core` as a workspace dependency and its framework as a peer dependency.

---

## Core-Adapter Pattern

This is the architecture framito enforces. It is the same pattern used in [digitojs](https://www.npmjs.com/package/digitojs) to ship one library to six frameworks without duplicating a single line of business logic.

### The rule

`src/core/` has **zero framework imports**. It never touches React, Vue, Svelte, or the DOM. It only manages state, exposes methods, and notifies subscribers when something changes.

`src/adapters/` has **zero business logic**. Each adapter imports from `../core`, subscribes to state changes, and surfaces them using the framework's own reactivity primitives.

```
┌──────────────────────────────────────────────┐
│                   src/core/                  │
│   Pure state machine. No framework deps.     │
│   createCore() → { getState, subscribe, ... }│
└──────────┬───────────────────────────────────┘
           │ imported by
    ┌──────┴──────┬──────────┬──────────┬──────────┐
    ▼             ▼          ▼          ▼          ▼
 vanilla.ts    react.tsx   vue.ts   svelte.ts  solid.ts
 createFrame() useFrame()  useFrame() createFrame() createFrame()
```

### The core machine

This is the only file you edit. Write your state logic here once and it works in every framework automatically.

```ts
// src/core/machine.ts
export type CoreState = {
  count: number
}

export function createCore() {
  let state: CoreState = { count: 0 }
  const listeners: Array<(s: CoreState) => void> = []
  const notify = () => listeners.forEach(l => l({ ...state }))

  return {
    getState: () => ({ ...state }),
    increment: () => { state.count++; notify() },
    decrement: () => { state.count--; notify() },
    subscribe: (fn: (s: CoreState) => void) => {
      listeners.push(fn)
      return () => listeners.splice(listeners.indexOf(fn), 1)
    },
  }
}
```

### How adapters bind to it

Each adapter is a thin wrapper. Here is what the React adapter looks like:

```ts
// src/adapters/react.tsx — generated, do not edit
import { useState, useEffect } from 'react'
import { createCore } from '../core'

export function useFrame(options?: Parameters<typeof createCore>[0]) {
  const [core]            = useState(() => createCore(options))
  const [state, setState] = useState(() => core.getState())
  useEffect(() => core.subscribe(setState), [core])
  return { ...state, ...core }
}
```

The Vue, Svelte, and Solid adapters follow the same pattern, subscribe to core, surface state through the framework's reactivity. You never touch them.

---

## Starter Templates

Choose a template that matches the shape of your library.

| Template | Use when | State shape |
|---|---|---|
| **Blank** | You know what you're building | Empty — you define everything |
| **UI Component** | Buttons, inputs, toggles, badges | `disabled`, `loading`, `variant` |
| **Form Element** | Text fields, selects, checkboxes | `value`, `error`, `touched`, `valid` |
| **Data Hook** | API wrappers, async resources | `data`, `loading`, `error` |
| **Utility** | Formatters, validators, parsers | No state — pure functions only |

### Blank

```ts
export type CoreState = {
  // Define your state shape here
}

export function createCore() {
  const listeners: Array<(s: CoreState) => void> = []
  const state: CoreState = {}
  const notify = () => listeners.forEach(l => l({ ...state }))
  return {
    getState:  () => ({ ...state }),
    subscribe: (fn: (s: CoreState) => void) => {
      listeners.push(fn)
      return () => listeners.splice(listeners.indexOf(fn), 1)
    },
  }
}
```

### UI Component

```ts
export type ComponentState = {
  disabled: boolean
  loading:  boolean
  variant:  'default' | 'primary' | 'danger'
}

export function createCore(initial: Partial<ComponentState> = {}) {
  // setDisabled, setLoading, setVariant, subscribe
}
```

### Form Element

```ts
export type FieldState = {
  value:   string
  error:   string | null
  touched: boolean
  valid:   boolean
}

export function createCore(validate?: (v: string) => string | null) {
  // setValue, reset, subscribe
}
```

### Data Hook

```ts
export type FetchState<T> = {
  data:    T | null
  loading: boolean
  error:   string | null
}

export function createCore<T>(fetcher: () => Promise<T>) {
  // fetch, reset, subscribe
}
```

### Utility

No state machine. Just pure functions exported directly from `src/core/machine.ts`. All adapters re-export core functions without any binding layer.

---

## Framework Usage

After running `npm run build` in your generated library, developers import like this:

### Vanilla JS

```ts
import { createFrame } from 'my-library'

const frame = createFrame()

frame.subscribe(state => {
  console.log(state)
})

frame.increment()
```

### React

```tsx
import { useFrame } from 'my-library/react'

function Counter() {
  const { count, increment, decrement } = useFrame()
  return (
    <div>
      <button onClick={decrement}>−</button>
      <span>{count}</span>
      <button onClick={increment}>+</button>
    </div>
  )
}
```

### Vue 3

```vue
<script setup lang="ts">
import { useFrame } from 'my-library/vue'
const { state, increment, decrement } = useFrame()
</script>

<template>
  <button @click="decrement">−</button>
  <span>{{ state.count }}</span>
  <button @click="increment">+</button>
</template>
```

### Svelte

```svelte
<script>
  import { createFrame } from 'my-library/svelte'
  const frame = createFrame()
</script>

<button on:click={frame.decrement}>−</button>
<span>{$frame.count}</span>
<button on:click={frame.increment}>+</button>
```

### Solid

```tsx
import { createFrame } from 'my-library/solid'

function Counter() {
  const { state, increment, decrement } = createFrame()
  return (
    <div>
      <button onClick={decrement}>−</button>
      <span>{state().count}</span>
      <button onClick={increment}>+</button>
    </div>
  )
}
```

---

## Generated Package Exports

framito generates a `package.json` with a full subpath exports map so developers get the right adapter for their framework automatically, no configuration, no bundler plugins, no runtime overhead.

With **ESM + CJS** output (the default), every export includes both `import` and `require` conditions:

```json
{
  "name": "my-library",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": {
      "import":  "./dist/index.js",
      "require": "./dist/index.cjs",
      "types":   "./dist/index.d.ts"
    },
    "./core": {
      "import":  "./dist/core/index.js",
      "require": "./dist/core/index.cjs",
      "types":   "./dist/core/index.d.ts"
    },
    "./react": {
      "import":  "./dist/adapters/react.js",
      "require": "./dist/adapters/react.cjs",
      "types":   "./dist/adapters/react.d.ts"
    },
    "./vue": {
      "import":  "./dist/adapters/vue.js",
      "require": "./dist/adapters/vue.cjs",
      "types":   "./dist/adapters/vue.d.ts"
    },
    "./svelte": {
      "import":  "./dist/adapters/svelte.js",
      "require": "./dist/adapters/svelte.cjs",
      "types":   "./dist/adapters/svelte.d.ts"
    },
    "./solid": {
      "import":  "./dist/adapters/solid.js",
      "require": "./dist/adapters/solid.cjs",
      "types":   "./dist/adapters/solid.d.ts"
    }
  }
}
```

Choose **ESM only** if you only target modern bundlers (Vite, Next.js, etc.) and want a leaner output — the `require` entries are omitted and only `.js` files are emitted.

Each framework peer dependency is marked `optional`, so installing `my-library` does not force React on a Vue user or vice versa.

---

## Scripts

Inside your generated library:

```sh
npm run build       # tsup builds all adapters to dist/ (ESM + CJS + .d.ts)
npm run dev         # tsup in watch mode — rebuilds on every save
npm run test        # vitest run — runs tests once
npm run test:watch  # vitest — runs tests in watch mode
```

---

## Why framito

| | Manual setup | Monorepo | **framito** |
|---|---|---|---|
| Time to scaffold | Hours | Hours | Seconds |
| Framework adapters | Write yourself | Write yourself | Generated |
| Single package or monorepo | Hard to set up | Manual | Both — your choice |
| Type declarations | Manual | Per package | Auto via tsup |
| ESM + CJS output | Manual | Manual | Built-in |
| Tests included | No | No | Yes |
| Prettier config | No | No | Optional |
| GitHub Actions CI | No | No | Optional |
| Consistent pattern | No | Maybe | Always |
| Maintenance surface | High | Very high | Minimal |

Monorepos make sense for large teams shipping framework-specific APIs. For most library authors — a component, a hook, a utility — they are overkill. framito gives you the same multi-framework reach from a single, simple package, with a one-prompt escape hatch to a full scoped monorepo if you need it.

---

## License

MIT © [Olawale Balo](https://x.com/theolawalemi)