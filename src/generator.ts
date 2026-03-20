/**
 * frameit/generator
 * ─────────────────────────────────────────────────────────────────────────────
 * File generation engine. Takes the config collected from CLI prompts and
 * writes the full project scaffold to disk — core machine, framework adapters,
 * package.json, tsup config, tests, examples, and README.
 *
 * @author  Olawale Balo — Product Designer + Design Engineer
 * @license MIT
 */

import fs from 'fs-extra'
import * as path from 'path'
import type { Framework, OutputFormat, ProjectConfig, Template } from './types.js'

// ─── name derivation ──────────────────────────────────────────────────────────

function deriveFnNames(name: string): { hook: string; factory: string } {
  const base   = name.startsWith('@') ? name.split('/')[1] : name
  const pascal = base.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')
  return { hook: `use${pascal}`, factory: `create${pascal}` }
}

export async function generateProject(config: ProjectConfig) {
  const { name, prettier, ci } = config
  const cwd = process.cwd()
  const projectDir = path.join(cwd, name)
  await fs.ensureDir(projectDir)

  if (config.naming === 'scoped') {
    await generateScopedProject(projectDir, config)
  } else {
    await generateSubpathProject(projectDir, config)
  }

  await generateGitignore(projectDir)
  await generateTests(projectDir, config)
  await generateExamples(projectDir, config)
  await generateReadme(projectDir, config)
  if (prettier) await generatePrettierConfig(projectDir)
  if (ci) await generateCIWorkflow(projectDir)
}

// ─── subpath project ──────────────────────────────────────────────────────────

async function generateSubpathProject(projectDir: string, config: ProjectConfig) {
  const { name, frameworks, template, outputFormat } = config
  const { hook, factory } = deriveFnNames(name)
  await generatePackageJson(projectDir, config)
  await generateTsConfig(projectDir, 'src')
  await generateTsupConfig(projectDir, frameworks, outputFormat)
  await generateCoreFiles(projectDir, template)
  await generateAdapters(projectDir, frameworks, template, '../core', hook, factory)
  await generateSrcIndex(projectDir, name, frameworks, hook, factory)
}

// ─── scoped (monorepo) project ────────────────────────────────────────────────

async function generateScopedProject(projectDir: string, config: ProjectConfig) {
  const { name, frameworks, template, outputFormat } = config
  const { hook, factory } = deriveFnNames(name)

  // Derive scope: if name starts with @, use the first segment, else @${name}
  const scope = name.startsWith('@') ? name.split('/')[0] : `@${name}`
  const corePkg = `${scope}/core`

  // Root package.json
  await fs.writeFile(
    path.join(projectDir, 'package.json'),
    JSON.stringify({
      name,
      version: '1.0.0',
      private: true,
      workspaces: ['packages/*'],
      scripts: {
        build: 'npm run build --workspaces',
        dev:   'npm run dev --workspaces',
        test:  'npm run test --workspaces',
      },
    }, null, 2) + '\n'
  )

  // Root tsconfig.json — no include, packages manage their own src
  await generateTsConfig(projectDir)

  // packages/core/
  const coreDir = path.join(projectDir, 'packages/core')
  await fs.ensureDir(coreDir)
  await writeScopedPackageJson(coreDir, corePkg, outputFormat)
  await generateTsConfig(coreDir, 'src')
  await writeScopedTsupConfig(coreDir, 'src/index.ts', outputFormat, [])
  await generateCoreFiles(coreDir, template)
  // core src/index.ts (barrel) — points into the nested src/core/ that generateCoreFiles creates
  await fs.writeFile(path.join(coreDir, 'src/index.ts'), `// Barrel export — export everything from core files
export * from './core/machine'
export * from './core/types'
export * from './core/utils'
`)

  // packages/[fw]/ for each non-vanilla framework
  const nonVanilla = frameworks.filter(fw => fw !== 'vanilla')
  for (const fw of nonVanilla) {
    const fwPkg = `${scope}/${fw}`
    const fwDir = path.join(projectDir, `packages/${fw}`)
    await fs.ensureDir(fwDir)

    const frameworkMeta: Partial<Record<Framework, { pkg: string; version: string }>> = {
      react:  { pkg: 'react',    version: '>=17' },
      vue:    { pkg: 'vue',      version: '>=3'  },
      svelte: { pkg: 'svelte',   version: '>=4'  },
      solid:  { pkg: 'solid-js', version: '>=1'  },
    }
    const meta = frameworkMeta[fw]
    const peerDeps  = meta ? { [meta.pkg]: meta.version } : {}
    const externals = meta ? [meta.pkg] : []

    await writeScopedPackageJson(fwDir, fwPkg, outputFormat, { [corePkg]: 'workspace:*' }, peerDeps)
    await generateTsConfig(fwDir, 'src')
    const ext = fw === 'react' ? 'tsx' : 'ts'
    await writeScopedTsupConfig(fwDir, `src/index.${ext}`, outputFormat, [corePkg, ...externals])

    // adapter source
    await fs.ensureDir(path.join(fwDir, 'src'))
    const adapterContent = getAdapterTemplate(fw, template, corePkg, hook, factory)
    await fs.writeFile(path.join(fwDir, `src/index.${ext}`), adapterContent)
  }

  // vanilla in scoped mode gets its own package too
  if (frameworks.includes('vanilla')) {
    const vanillaPkg = `${scope}/vanilla`
    const vanillaDir = path.join(projectDir, 'packages/vanilla')
    await fs.ensureDir(vanillaDir)
    await writeScopedPackageJson(vanillaDir, vanillaPkg, outputFormat, { [corePkg]: 'workspace:*' })
    await generateTsConfig(vanillaDir, 'src')
    await writeScopedTsupConfig(vanillaDir, 'src/index.ts', outputFormat, [corePkg])
    await fs.ensureDir(path.join(vanillaDir, 'src'))
    await fs.writeFile(
      path.join(vanillaDir, 'src/index.ts'),
      getAdapterTemplate('vanilla', template, corePkg, hook, factory)
    )
  }
}

// ─── helpers for scoped packages ──────────────────────────────────────────────

async function writeScopedPackageJson(
  dir: string,
  pkgName: string,
  outputFormat: OutputFormat,
  deps?: Record<string, string>,
  peerDeps?: Record<string, string>,
) {
  const hasCjs = outputFormat === 'dual'
  const mainEntry: Record<string, unknown> = {
    import: './dist/index.js',
    ...(hasCjs ? { require: './dist/index.cjs' } : {}),
    types: './dist/index.d.ts',
  }

  const pkg: Record<string, unknown> = {
    name: pkgName,
    version: '1.0.0',
    description: '',
    type: 'module',
    exports: {
      '.': mainEntry,
    },
    scripts: {
      build: 'tsup',
      dev:   'tsup --watch',
      test:  'vitest run',
    },
    ...(deps && Object.keys(deps).length > 0 ? { dependencies: deps } : {}),
    ...(peerDeps && Object.keys(peerDeps).length > 0 ? { peerDependencies: peerDeps } : {}),
    devDependencies: {
      tsup:       'latest',
      typescript: 'latest',
      vitest:     'latest',
    },
  }

  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
}

async function writeScopedTsupConfig(
  dir: string,
  entry: string,
  outputFormat: OutputFormat,
  externals: string[],
) {
  const formats = outputFormat === 'dual' ? `['esm', 'cjs']` : `['esm']`
  const extList  = externals.map(e => `'${e}'`).join(', ')
  const content = `// tsup build configuration
import { defineConfig } from 'tsup'

export default defineConfig({
  entry:     ['${entry}'],
  format:    ${formats},
  dts:       true,
  clean:     true,
  treeshake: true,
  external:  [${extList}],
})
`
  await fs.writeFile(path.join(dir, 'tsup.config.ts'), content)
}

// ─── package.json ─────────────────────────────────────────────────────────────

async function generatePackageJson(dir: string, config: ProjectConfig) {
  const { name, frameworks, outputFormat } = config
  const hasCjs = outputFormat === 'dual'

  const makeEntry = (importPath: string, typesPath: string) => ({
    import: importPath,
    ...(hasCjs ? { require: importPath.replace('.js', '.cjs') } : {}),
    types: typesPath,
  })

  const exports: Record<string, ReturnType<typeof makeEntry>> = {
    '.': makeEntry('./dist/index.js', './dist/index.d.ts'),
    './core': makeEntry('./dist/core/index.js', './dist/core/index.d.ts'),
  }

  const peerDependencies: Record<string, string> = {}
  const peerDependenciesMeta: Record<string, { optional: boolean }> = {}

  // Maps each non-vanilla framework to its npm package name and peer dep version range.
  const frameworkMeta: Partial<Record<Framework, { pkg: string; version: string }>> = {
    react:  { pkg: 'react',    version: '>=17' },
    vue:    { pkg: 'vue',      version: '>=3'  },
    svelte: { pkg: 'svelte',   version: '>=4'  },
    solid:  { pkg: 'solid-js', version: '>=1'  },
  }

  for (const fw of frameworks) {
    if (fw === 'vanilla') continue
    exports[`./${fw}`] = makeEntry(`./dist/adapters/${fw}.js`, `./dist/adapters/${fw}.d.ts`)
    const meta = frameworkMeta[fw]
    if (meta) {
      peerDependencies[meta.pkg] = meta.version
      peerDependenciesMeta[meta.pkg] = { optional: true }
    }
  }

  const pkg = {
    name,
    version: '1.0.0',
    description: '',
    type: 'module',
    exports,
    peerDependencies: Object.keys(peerDependencies).length > 0 ? peerDependencies : undefined,
    peerDependenciesMeta: Object.keys(peerDependenciesMeta).length > 0 ? peerDependenciesMeta : undefined,
    scripts: {
      build: 'tsup',
      dev: 'tsup --watch',
      test: 'vitest run',
      'test:watch': 'vitest',
    },
    devDependencies: {
      tsup: 'latest',
      typescript: 'latest',
      vitest: 'latest',
    },
  }

  // Remove undefined keys
  const cleanPkg = JSON.parse(JSON.stringify(pkg))
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify(cleanPkg, null, 2) + '\n')
}

// ─── tsconfig.json ────────────────────────────────────────────────────────────

async function generateTsConfig(dir: string, includeDir?: string) {
  const tsconfig: Record<string, unknown> = {
    compilerOptions: {
      target: 'ES2020',
      module: 'ESNext',
      moduleResolution: 'bundler',
      jsx: 'react-jsx',
      strict: true,
      declaration: true,
      esModuleInterop: true,
      skipLibCheck: true,
    },
  }
  if (includeDir !== undefined) tsconfig.include = [includeDir]
  await fs.writeFile(path.join(dir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2) + '\n')
}

// ─── tsup.config.ts ───────────────────────────────────────────────────────────

async function generateTsupConfig(dir: string, frameworks: Framework[], outputFormat: OutputFormat) {
  const entries: string[] = [
    `    'index':           'src/index.ts',`,
    `    'core/index':      'src/core/index.ts',`,
  ]

  for (const fw of frameworks) {
    const ext = fw === 'react' ? 'tsx' : 'ts'
    entries.push(`    'adapters/${fw}': 'src/adapters/${fw}.${ext}',`)
  }

  const externals = frameworks
    .filter(fw => fw !== 'vanilla')
    .map(fw => (fw === 'solid' ? 'solid-js' : fw))

  const formats = outputFormat === 'dual' ? `['esm', 'cjs']` : `['esm']`

  const content = `// tsup build configuration
// Builds all adapters to dist/ with ${outputFormat === 'dual' ? 'ESM + CJS' : 'ESM'} + type declarations
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
${entries.join('\n')}
  },
  format:    ${formats},
  dts:       true,
  clean:     true,
  treeshake: true,
  external:  [${externals.map(e => `'${e}'`).join(', ')}],
})
`
  await fs.writeFile(path.join(dir, 'tsup.config.ts'), content)
}

// ─── .gitignore ───────────────────────────────────────────────────────────────

async function generateGitignore(dir: string) {
  const content = `node_modules/
dist/
*.log
.DS_Store
`
  await fs.writeFile(path.join(dir, '.gitignore'), content)
}

// ─── src/core/ ────────────────────────────────────────────────────────────────

async function generateCoreFiles(dir: string, template: Template) {
  await fs.ensureDir(path.join(dir, 'src/core'))

  await fs.writeFile(path.join(dir, 'src/core/index.ts'), `// Barrel export — export everything from core files
export * from './machine'
export * from './types'
export * from './utils'
`)

  await fs.writeFile(path.join(dir, 'src/core/types.ts'), `// Shared TypeScript types and interfaces
// Add your custom types here and export them
export type {}
`)

  await fs.writeFile(path.join(dir, 'src/core/utils.ts'), `// Pure utility functions — no state, no side effects
// Add helpers used across your core logic here
export {}
`)

  await fs.writeFile(path.join(dir, 'src/core/machine.ts'), getMachineTemplate(template))
}

function getMachineTemplate(template: Template): string {
  switch (template) {
    case 'blank':
      return `// Core state machine — pure logic, zero framework dependencies
// Add your state shape to CoreState and implement createCore()
export type CoreState = {
  // Add your state shape here
}

export function createCore() {
  // Your logic goes here
  // Return state and methods your adapters will expose
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
`

    case 'ui-component':
      return `// Core state machine — UI component state (disabled, loading, variant)
// Extend ComponentState and add methods to createCore() as needed
export type ComponentState = {
  disabled: boolean
  loading:  boolean
  variant:  'default' | 'primary' | 'danger'
}

export function createCore(initial: Partial<ComponentState> = {}) {
  let state: ComponentState = {
    disabled: false,
    loading:  false,
    variant:  'default',
    ...initial,
  }
  const listeners: Array<(s: ComponentState) => void> = []
  const notify = () => listeners.forEach(l => l({ ...state }))
  return {
    getState:    () => ({ ...state }),
    setDisabled: (v: boolean) => { state.disabled = v; notify() },
    setLoading:  (v: boolean) => { state.loading  = v; notify() },
    setVariant:  (v: ComponentState['variant']) => { state.variant = v; notify() },
    subscribe:   (fn: (s: ComponentState) => void) => {
      listeners.push(fn)
      return () => listeners.splice(listeners.indexOf(fn), 1)
    },
  }
}
`

    case 'form-element':
      return `// Core state machine — form field state (value, validation, error)
// Pass a validate function to createCore() for custom validation logic
export type FieldState = {
  value:   string
  error:   string | null
  touched: boolean
  valid:   boolean
}

export function createCore(validate?: (v: string) => string | null) {
  let state: FieldState = { value: '', error: null, touched: false, valid: true }
  const listeners: Array<(s: FieldState) => void> = []
  const notify = () => listeners.forEach(l => l({ ...state }))
  return {
    getState: () => ({ ...state }),
    setValue: (v: string) => {
      state.value   = v
      state.touched = true
      state.error   = validate ? validate(v) : null
      state.valid   = state.error === null
      notify()
    },
    reset: () => {
      state = { value: '', error: null, touched: false, valid: true }
      notify()
    },
    subscribe: (fn: (s: FieldState) => void) => {
      listeners.push(fn)
      return () => listeners.splice(listeners.indexOf(fn), 1)
    },
  }
}
`

    case 'data-hook':
      return `// Core state machine — async data fetching (loading, data, error)
// Pass a fetcher function to createCore() — call fetch() to trigger it
export type FetchState<T> = {
  data:    T | null
  loading: boolean
  error:   string | null
}

export function createCore<T>(fetcher: () => Promise<T>) {
  let state: FetchState<T> = { data: null, loading: false, error: null }
  const listeners: Array<(s: FetchState<T>) => void> = []
  const notify = () => listeners.forEach(l => l({ ...state }))
  return {
    getState: () => ({ ...state }),
    fetch: async () => {
      state = { ...state, loading: true, error: null }
      notify()
      try {
        state.data    = await fetcher()
        state.loading = false
      } catch (e) {
        state.error   = e instanceof Error ? e.message : String(e)
        state.loading = false
      }
      notify()
    },
    reset: () => {
      state = { data: null, loading: false, error: null }
      notify()
    },
    subscribe: (fn: (s: FetchState<T>) => void) => {
      listeners.push(fn)
      return () => listeners.splice(listeners.indexOf(fn), 1)
    },
  }
}
`

    case 'utility':
      return `// Pure utility functions — no state, no subscriptions needed
// Add your utility functions here and export them from core/index.ts
export function formatValue(value: string): string {
  return value.trim()
}

export function validateValue(value: string): boolean {
  return value.length > 0
}
`
    default:
      throw new Error(`Unknown template: ${template}`)
  }
}

// ─── src/adapters/ ────────────────────────────────────────────────────────────

async function generateAdapters(dir: string, frameworks: Framework[], template: Template, corePkg: string, hook: string, factory: string) {
  await fs.ensureDir(path.join(dir, 'src/adapters'))

  for (const fw of frameworks) {
    const content = getAdapterTemplate(fw, template, corePkg, hook, factory)
    const ext = fw === 'react' ? 'tsx' : 'ts'
    await fs.writeFile(path.join(dir, `src/adapters/${fw}.${ext}`), content)
  }
}

function getAdapterTemplate(fw: Framework, template: Template, corePkg: string, hook: string, factory: string): string {
  if (template === 'utility') {
    const comments: Record<Framework, string> = {
      vanilla: '// Vanilla adapter — re-exports pure utility functions from core directly',
      react:   '// React adapter — re-exports pure utility functions from core directly',
      vue:     '// Vue adapter — re-exports pure utility functions from core directly',
      svelte:  '// Svelte adapter — re-exports pure utility functions from core directly',
      solid:   '// Solid adapter — re-exports pure utility functions from core directly',
    }
    return `${comments[fw]}
// No state binding needed for utility libraries — import functions directly
export * from '${corePkg}'
`
  }

  switch (fw) {
    case 'vanilla':
      return `// Vanilla adapter — wraps core directly, no framework binding needed
// Use ${factory}() in plain HTML/JS projects
import { createCore } from '${corePkg}'

export function ${factory}(options?: Parameters<typeof createCore>[0]) {
  return createCore(options)
}
`

    case 'react':
      return `// React adapter — binds core state to React via useState + useEffect
// Use ${hook}() inside any React component or custom hook
import { useState, useEffect } from 'react'
import { createCore } from '${corePkg}'

export function ${hook}(options?: Parameters<typeof createCore>[0]) {
  const [core]            = useState(() => createCore(options))
  const [state, setState] = useState(() => core.getState())
  useEffect(() => core.subscribe(setState), [core])
  return { ...state, ...core }
}
`

    case 'vue':
      return `// Vue adapter — binds core state to Vue 3 reactivity via ref
// Use ${hook}() inside any Vue component or composable
import { ref, onMounted, onUnmounted } from 'vue'
import { createCore } from '${corePkg}'

export function ${hook}(options?: Parameters<typeof createCore>[0]) {
  const core  = createCore(options)
  const state = ref(core.getState())
  let unsub: () => void
  onMounted(()   => { unsub = core.subscribe(s => { state.value = s }) })
  onUnmounted(() => unsub?.())
  return { state, ...core }
}
`

    case 'svelte':
      return `// Svelte adapter — binds core state to a Svelte writable store
// Use ${factory}() and spread with $ prefix in your Svelte component
import { writable } from 'svelte/store'
import { createCore } from '${corePkg}'

export function ${factory}(options?: Parameters<typeof createCore>[0]) {
  const core  = createCore(options)
  const store = writable(core.getState())
  core.subscribe(s => store.set(s))
  return { subscribe: store.subscribe, ...core }
}
`

    case 'solid':
      return `// Solid adapter — binds core state to Solid signals via createSignal
// Use ${factory}() inside any Solid component
import { createSignal, onMount, onCleanup } from 'solid-js'
import { createCore } from '${corePkg}'

export function ${factory}(options?: Parameters<typeof createCore>[0]) {
  const core = createCore(options)
  const [state, setState] = createSignal(core.getState())
  onMount(() => {
    const unsub = core.subscribe(setState)
    onCleanup(unsub)
  })
  return { state, ...core }
}
`
    default:
      throw new Error(`Unknown framework: ${fw}`)
  }
}

// ─── src/index.ts ─────────────────────────────────────────────────────────────

async function generateSrcIndex(dir: string, name: string, frameworks: Framework[], hook: string, factory: string) {
  const lines = [
    `// Default entry — exports vanilla adapter as the main package import`,
    `// import { ${factory} } from '${name}'         → vanilla`,
  ]

  if (frameworks.includes('react'))  lines.push(`// import { ${hook} }    from '${name}/react'   → react`)
  if (frameworks.includes('vue'))    lines.push(`// import { ${hook} }    from '${name}/vue'     → vue`)
  if (frameworks.includes('svelte')) lines.push(`// import { ${factory} } from '${name}/svelte'  → svelte`)
  if (frameworks.includes('solid'))  lines.push(`// import { ${factory} } from '${name}/solid'   → solid`)

  lines.push(`export * from './adapters/vanilla'`)
  lines.push(`export * from './core'`)

  await fs.writeFile(path.join(dir, 'src/index.ts'), lines.join('\n') + '\n')
}

// ─── tests/ ───────────────────────────────────────────────────────────────────

async function generateTests(dir: string, config: ProjectConfig) {
  await fs.ensureDir(path.join(dir, 'tests'))

  const coreSrcPath = config.naming === 'scoped' ? '../packages/core/src' : '../src/core'
  const content = getTestTemplate(config.template, coreSrcPath)
  await fs.writeFile(path.join(dir, 'tests/core.test.ts'), content)
}

function getTestTemplate(template: Template, coreSrcPath: string): string {
  switch (template) {
    case 'blank':
      return `// Tests for core logic — add test cases for your state and methods
import { describe, it, expect } from 'vitest'
import { createCore } from '${coreSrcPath}'

describe('createCore', () => {
  it('returns initial state', () => {
    const core = createCore()
    expect(core.getState()).toBeDefined()
  })

  it('notifies subscribers on state change', () => {
    const core = createCore()
    const calls: unknown[] = []
    core.subscribe(s => calls.push(s))
    // Trigger a state change here
    expect(calls.length).toBeGreaterThanOrEqual(0)
  })
})
`

    case 'ui-component':
      return `// Tests for UI component core logic
import { describe, it, expect, vi } from 'vitest'
import { createCore } from '${coreSrcPath}'

describe('createCore', () => {
  it('starts with default state', () => {
    const core = createCore()
    expect(core.getState()).toEqual({ disabled: false, loading: false, variant: 'default' })
  })

  it('setDisabled updates state', () => {
    const core = createCore()
    core.setDisabled(true)
    expect(core.getState().disabled).toBe(true)
  })

  it('setLoading updates state', () => {
    const core = createCore()
    core.setLoading(true)
    expect(core.getState().loading).toBe(true)
  })

  it('setVariant updates state', () => {
    const core = createCore()
    core.setVariant('primary')
    expect(core.getState().variant).toBe('primary')
  })

  it('notifies subscribers on change', () => {
    const core = createCore()
    const listener = vi.fn()
    core.subscribe(listener)
    core.setDisabled(true)
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ disabled: true }))
  })

  it('unsubscribe stops notifications', () => {
    const core = createCore()
    const listener = vi.fn()
    const unsub = core.subscribe(listener)
    unsub()
    core.setDisabled(true)
    expect(listener).not.toHaveBeenCalled()
  })
})
`

    case 'form-element':
      return `// Tests for form element core logic
import { describe, it, expect, vi } from 'vitest'
import { createCore } from '${coreSrcPath}'

describe('createCore', () => {
  it('starts with empty state', () => {
    const core = createCore()
    expect(core.getState()).toEqual({ value: '', error: null, touched: false, valid: true })
  })

  it('setValue updates value and touched', () => {
    const core = createCore()
    core.setValue('hello')
    expect(core.getState().value).toBe('hello')
    expect(core.getState().touched).toBe(true)
  })

  it('runs validation on setValue', () => {
    const validate = (v: string) => (v.length < 3 ? 'Too short' : null)
    const core = createCore(validate)
    core.setValue('hi')
    expect(core.getState().error).toBe('Too short')
    expect(core.getState().valid).toBe(false)
  })

  it('reset restores initial state', () => {
    const core = createCore()
    core.setValue('hello')
    core.reset()
    expect(core.getState()).toEqual({ value: '', error: null, touched: false, valid: true })
  })

  it('notifies subscribers on change', () => {
    const core = createCore()
    const listener = vi.fn()
    core.subscribe(listener)
    core.setValue('hello')
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ value: 'hello' }))
  })
})
`

    case 'data-hook':
      return `// Tests for data fetching core logic
import { describe, it, expect, vi } from 'vitest'
import { createCore } from '${coreSrcPath}'

describe('createCore', () => {
  it('starts with null data', () => {
    const core = createCore(async () => 'data')
    expect(core.getState()).toEqual({ data: null, loading: false, error: null })
  })

  it('fetch sets loading then resolves data', async () => {
    const core = createCore(async () => 'hello')
    await core.fetch()
    expect(core.getState().data).toBe('hello')
    expect(core.getState().loading).toBe(false)
  })

  it('fetch captures errors', async () => {
    const core = createCore(async () => { throw new Error('boom') })
    await core.fetch()
    expect(core.getState().error).toBe('boom')
    expect(core.getState().loading).toBe(false)
  })

  it('reset restores initial state', async () => {
    const core = createCore(async () => 'hello')
    await core.fetch()
    core.reset()
    expect(core.getState()).toEqual({ data: null, loading: false, error: null })
  })

  it('notifies subscribers while loading', async () => {
    const states: boolean[] = []
    const core = createCore(async () => 'hello')
    core.subscribe(s => states.push(s.loading))
    await core.fetch()
    expect(states).toContain(true)
    expect(states).toContain(false)
  })
})
`

    case 'utility':
      return `// Tests for utility functions
import { describe, it, expect } from 'vitest'
import { formatValue, validateValue } from '${coreSrcPath}'

describe('formatValue', () => {
  it('trims whitespace', () => {
    expect(formatValue('  hello  ')).toBe('hello')
  })

  it('returns empty string unchanged', () => {
    expect(formatValue('')).toBe('')
  })
})

describe('validateValue', () => {
  it('returns true for non-empty string', () => {
    expect(validateValue('hello')).toBe(true)
  })

  it('returns false for empty string', () => {
    expect(validateValue('')).toBe(false)
  })
})
`
    default:
      throw new Error(`Unknown template: ${template}`)
  }
}

// ─── examples/ ────────────────────────────────────────────────────────────────

async function generateExamples(dir: string, config: ProjectConfig) {
  const { name, frameworks, template } = config
  const { hook, factory } = deriveFnNames(name)
  await fs.ensureDir(path.join(dir, 'examples'))

  // Derive scope for scoped naming
  const scope = name.startsWith('@') ? name.split('/')[0] : `@${name}`

  for (const fw of frameworks) {
    // importPath = what end-users import from; depName = workspace dep in example package.json
    let importPath: string
    let depName: string

    if (fw === 'vanilla') {
      importPath = config.naming === 'scoped' ? `${scope}/vanilla` : name
      depName    = config.naming === 'scoped' ? `${scope}/vanilla` : name
    } else {
      importPath = config.naming === 'scoped' ? `${scope}/${fw}` : `${name}/${fw}`
      depName    = config.naming === 'scoped' ? `${scope}/${fw}` : name
    }

    switch (fw) {
      case 'vanilla': {
        await fs.ensureDir(path.join(dir, 'examples/vanilla'))
        await fs.writeFile(
          path.join(dir, 'examples/vanilla/index.html'),
          getVanillaExample(importPath, name, factory)
        )
        break
      }
      case 'react': {
        await fs.ensureDir(path.join(dir, 'examples/react'))
        await fs.writeFile(
          path.join(dir, 'examples/react/App.tsx'),
          getReactExample(importPath, name, hook)
        )
        await fs.writeFile(
          path.join(dir, 'examples/react/package.json'),
          JSON.stringify({
            name: `${name}-example-react`,
            private: true,
            scripts: { dev: 'vite', build: 'vite build' },
            dependencies: { react: '^18', 'react-dom': '^18', [depName]: 'workspace:*' },
            devDependencies: { '@vitejs/plugin-react': 'latest', vite: 'latest' },
          }, null, 2) + '\n'
        )
        break
      }
      case 'vue': {
        await fs.ensureDir(path.join(dir, 'examples/vue'))
        await fs.writeFile(
          path.join(dir, 'examples/vue/App.vue'),
          getVueExample(importPath, name, hook)
        )
        await fs.writeFile(
          path.join(dir, 'examples/vue/package.json'),
          JSON.stringify({
            name: `${name}-example-vue`,
            private: true,
            scripts: { dev: 'vite', build: 'vite build' },
            dependencies: { vue: '^3', [depName]: 'workspace:*' },
            devDependencies: { '@vitejs/plugin-vue': 'latest', vite: 'latest' },
          }, null, 2) + '\n'
        )
        break
      }
      case 'svelte': {
        await fs.ensureDir(path.join(dir, 'examples/svelte'))
        await fs.writeFile(
          path.join(dir, 'examples/svelte/App.svelte'),
          getSvelteExample(importPath, factory)
        )
        await fs.writeFile(
          path.join(dir, 'examples/svelte/package.json'),
          JSON.stringify({
            name: `${name}-example-svelte`,
            private: true,
            scripts: { dev: 'vite', build: 'vite build' },
            dependencies: { svelte: '^4', [depName]: 'workspace:*' },
            devDependencies: { '@sveltejs/vite-plugin-svelte': 'latest', vite: 'latest' },
          }, null, 2) + '\n'
        )
        break
      }
      case 'solid': {
        await fs.ensureDir(path.join(dir, 'examples/solid'))
        await fs.writeFile(
          path.join(dir, 'examples/solid/App.tsx'),
          getSolidExample(importPath, factory)
        )
        await fs.writeFile(
          path.join(dir, 'examples/solid/package.json'),
          JSON.stringify({
            name: `${name}-example-solid`,
            private: true,
            scripts: { dev: 'vite', build: 'vite build' },
            dependencies: { 'solid-js': '^1', [depName]: 'workspace:*' },
            devDependencies: { 'vite-plugin-solid': 'latest', vite: 'latest' },
          }, null, 2) + '\n'
        )
        break
      }
    }
  }

  // Suppress unused-variable warning — template is referenced in future extension
  void template
}

function getVanillaExample(importPath: string, title: string, factory: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title} — Vanilla Example</title>
</head>
<body>
  <h1>${title}</h1>
  <div id="output"></div>

  <script type="module">
    // Import directly from the built package
    // Run \`npm run build\` in the root first
    import { ${factory} } from '${importPath}'

    const frame = ${factory}()
    const output = document.getElementById('output')

    frame.subscribe(state => {
      output.textContent = JSON.stringify(state, null, 2)
    })

    console.log('Current state:', frame.getState())
  </script>
</body>
</html>
`
}

function getReactExample(importPath: string, title: string, hook: string): string {
  return `// React example — demonstrates ${hook}() hook
import { ${hook} } from '${importPath}'

export default function App() {
  const frame = ${hook}()

  return (
    <div>
      <h1>${title}</h1>
      <pre>{JSON.stringify(frame, null, 2)}</pre>
    </div>
  )
}
`
}

function getVueExample(importPath: string, title: string, hook: string): string {
  return `<!-- Vue example — demonstrates ${hook}() composable -->
<script setup lang="ts">
import { ${hook} } from '${importPath}'

const frame = ${hook}()
</script>

<template>
  <div>
    <h1>${title}</h1>
    <pre>{{ frame.state }}</pre>
  </div>
</template>
`
}

function getSvelteExample(importPath: string, factory: string): string {
  return `<!-- Svelte example — demonstrates ${factory}() store -->
<script>
  import { ${factory} } from '${importPath}'
  const frame = ${factory}()
</script>

<h1>App</h1>
<pre>{JSON.stringify($frame, null, 2)}</pre>
`
}

function getSolidExample(importPath: string, factory: string): string {
  return `// Solid example — demonstrates ${factory}() signal
import { ${factory} } from '${importPath}'

export default function App() {
  const { state } = ${factory}()
  return (
    <div>
      <h1>App</h1>
      <pre>{JSON.stringify(state(), null, 2)}</pre>
    </div>
  )
}
`
}

// ─── .prettierrc ──────────────────────────────────────────────────────────────

async function generatePrettierConfig(dir: string) {
  const config = {
    semi: false,
    singleQuote: true,
    trailingComma: 'es5',
    tabWidth: 2,
    printWidth: 100,
  }
  await fs.writeFile(path.join(dir, '.prettierrc'), JSON.stringify(config, null, 2) + '\n')
}

// ─── .github/workflows/ci.yml ─────────────────────────────────────────────────

async function generateCIWorkflow(dir: string) {
  await fs.ensureDir(path.join(dir, '.github/workflows'))
  const content = `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm install
      - run: npm run build
      - run: npm test
`
  await fs.writeFile(path.join(dir, '.github/workflows/ci.yml'), content)
}

// ─── README.md ────────────────────────────────────────────────────────────────

function numberToWord(n: number): string {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five']
  return words[n] ?? String(n)
}

async function generateReadme(dir: string, config: ProjectConfig) {
  const { name, frameworks, template, prettier, ci, naming } = config
  const isScoped = naming === 'scoped'
  const scope = name.startsWith('@') ? name.split('/')[0] : `@${name}`

  const pkgFor = (fw: Framework) => isScoped
    ? (fw === 'vanilla' ? `${scope}/vanilla` : `${scope}/${fw}`)
    : (fw === 'vanilla' ? name : `${name}/${fw}`)

  const frameworkList = frameworks
    .map((fw: Framework) => `- **${pkgFor(fw)}**`)
    .join('\n')

  const { hook, factory } = deriveFnNames(name)

  const importLines: Record<Framework, string> = {
    vanilla: `import { ${factory} } from '${pkgFor('vanilla')}'`,
    react:   `import { ${hook} }    from '${pkgFor('react')}'`,
    vue:     `import { ${hook} }    from '${pkgFor('vue')}'`,
    svelte:  `import { ${factory} } from '${pkgFor('svelte')}'`,
    solid:   `import { ${factory} } from '${pkgFor('solid')}'`,
  }
  const importExamples = frameworks.map((fw: Framework) => importLines[fw]).join('\n')

  const installCmd = isScoped
    ? frameworks.map(pkgFor).join(' ')
    : name

  const toolingLines: string[] = []
  if (prettier) toolingLines.push('- **Prettier** config included — run `npx prettier --write .` to format')
  if (ci)       toolingLines.push('- **GitHub Actions** CI workflow included — runs build and tests on push/PR')
  const toolingSection = toolingLines.length > 0
    ? `\n## Tooling\n\n${toolingLines.join('\n')}\n`
    : ''

  const architectureDiagram = isScoped
    ? `\`\`\`
packages/
├── core/
│   └── src/
│       ├── machine.ts   ← state logic lives here (no framework imports allowed)
│       ├── types.ts     ← shared TypeScript types
│       ├── utils.ts     ← pure helper functions
│       └── index.ts     ← barrel export
└── [framework]/
    └── src/
        └── index.ts     ← thin adapter, imports from ${scope}/core
\`\`\``
    : `\`\`\`
src/
├── core/
│   ├── machine.ts   ← state logic lives here (no framework imports allowed)
│   ├── types.ts     ← shared TypeScript types
│   ├── utils.ts     ← pure helper functions
│   └── index.ts     ← barrel export
└── adapters/
    ├── vanilla.ts   ← ${factory}() for plain JS
    ├── react.tsx    ← ${hook}() React hook
    ├── vue.ts       ← ${hook}() Vue composable
    ├── svelte.ts    ← ${factory}() Svelte store
    └── solid.ts     ← ${factory}() Solid signal
\`\`\``

  const count = numberToWord(frameworks.length)
  const plural = frameworks.length > 1 ? 's' : ''

  const content = `# ${name}

> Built with [frame-it](https://github.com/theolawalemi/frame-it) — scaffold once, ship to every framework.

## Frameworks

This library ships to ${count} framework${plural}:

${frameworkList}

## Installation

\`\`\`sh
npm install ${installCmd}
\`\`\`

## Usage

\`\`\`ts
${importExamples}
\`\`\`

## Architecture

This library uses the **core-adapter pattern**:

- Core contains all state logic with **zero framework dependencies**
- Adapters are thin bindings that connect core to each framework's reactivity system

This means the same business logic runs identically in every framework. Adapters are
pure wiring — they subscribe to core state changes and surface them using the framework's primitives
(React \`useState\`, Vue \`ref\`, Svelte stores, Solid signals).

${architectureDiagram}
${toolingSection}
## Development

\`\`\`sh
npm install
npm run dev      # build in watch mode
npm run build    # production build
npm test         # run tests
\`\`\`

## Template: ${template}

This project was scaffolded with the **${template}** starter template.
${getTemplateDescription(template)}
`

  await fs.writeFile(path.join(dir, 'README.md'), content)
}

function getTemplateDescription(template: Template): string {
  const descriptions: Record<Template, string> = {
    'blank':        'Start by defining your state shape in `src/core/machine.ts`.',
    'ui-component': 'The core includes `disabled`, `loading`, and `variant` state — extend it to fit your component.',
    'form-element': 'The core handles `value`, `error`, `touched`, and `valid` state with optional validation.',
    'data-hook':    'The core wraps an async fetcher with `loading`, `data`, and `error` state.',
    'utility':      'Pure functions only — no state or subscriptions. Add your functions to `src/core/machine.ts`.',
  }
  return descriptions[template]
}
