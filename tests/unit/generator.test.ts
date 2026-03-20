/**
 * tests/unit/generator.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the project generator.
 * Each test scaffolds a project into a temporary directory, then asserts that
 * the correct files exist and contain the expected content.
 *
 * @author  Olawale Balo — Product Designer + Design Engineer
 * @license MIT
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import { generateProject } from '../../src/generator.js'
import type { ProjectConfig } from '../../src/types.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'frameit-test-'))
})

afterEach(async () => {
  await fs.remove(tmpDir)
})

function config(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    name: 'my-test-lib',
    frameworks: ['vanilla', 'react'],
    naming: 'subpath',
    typescript: true,
    template: 'blank',
    ...overrides,
  }
}

async function scaffold(overrides: Partial<ProjectConfig> = {}) {
  const cfg = config(overrides)
  // generateProject writes relative to cwd — run from tmpDir
  const originalCwd = process.cwd()
  process.chdir(tmpDir)
  await generateProject(cfg)
  process.chdir(originalCwd)
  return path.join(tmpDir, cfg.name)
}

function read(dir: string, ...segments: string[]) {
  return fs.readFile(path.join(dir, ...segments), 'utf-8')
}

function exists(dir: string, ...segments: string[]) {
  return fs.pathExists(path.join(dir, ...segments))
}

// ─── Core file generation ─────────────────────────────────────────────────────

describe('core files', () => {
  it('creates src/core/index.ts', async () => {
    const dir = await scaffold()
    expect(await exists(dir, 'src/core/index.ts')).toBe(true)
  })

  it('creates src/core/machine.ts', async () => {
    const dir = await scaffold()
    expect(await exists(dir, 'src/core/machine.ts')).toBe(true)
  })

  it('creates src/core/types.ts', async () => {
    const dir = await scaffold()
    expect(await exists(dir, 'src/core/types.ts')).toBe(true)
  })

  it('creates src/core/utils.ts', async () => {
    const dir = await scaffold()
    expect(await exists(dir, 'src/core/utils.ts')).toBe(true)
  })

  it('core/index.ts exports from all core modules', async () => {
    const dir = await scaffold()
    const content = await read(dir, 'src/core/index.ts')
    expect(content).toContain("export * from './machine'")
    expect(content).toContain("export * from './types'")
    expect(content).toContain("export * from './utils'")
  })

  it('core files have no framework imports', async () => {
    const dir = await scaffold()
    for (const file of ['machine.ts', 'types.ts', 'utils.ts', 'index.ts']) {
      const content = await read(dir, 'src/core', file)
      expect(content).not.toMatch(/from ['"]react['"]/)
      expect(content).not.toMatch(/from ['"]vue['"]/)
      expect(content).not.toMatch(/from ['"]svelte['"]/)
      expect(content).not.toMatch(/from ['"]solid-js['"]/)
    }
  })
})

// ─── Adapter generation ───────────────────────────────────────────────────────

describe('adapter generation', () => {
  it('generates only selected framework adapters', async () => {
    const dir = await scaffold({ frameworks: ['vanilla', 'react'] })
    expect(await exists(dir, 'src/adapters/vanilla.ts')).toBe(true)
    expect(await exists(dir, 'src/adapters/react.tsx')).toBe(true)
    expect(await exists(dir, 'src/adapters/vue.ts')).toBe(false)
    expect(await exists(dir, 'src/adapters/svelte.ts')).toBe(false)
    expect(await exists(dir, 'src/adapters/solid.ts')).toBe(false)
  })

  it('generates all adapters when all frameworks selected', async () => {
    const dir = await scaffold({ frameworks: ['vanilla', 'react', 'vue', 'svelte', 'solid'] })
    expect(await exists(dir, 'src/adapters/vanilla.ts')).toBe(true)
    expect(await exists(dir, 'src/adapters/react.tsx')).toBe(true)
    expect(await exists(dir, 'src/adapters/vue.ts')).toBe(true)
    expect(await exists(dir, 'src/adapters/svelte.ts')).toBe(true)
    expect(await exists(dir, 'src/adapters/solid.ts')).toBe(true)
  })

  it('vanilla adapter exports createMyTestLib()', async () => {
    const dir = await scaffold({ frameworks: ['vanilla'] })
    const content = await read(dir, 'src/adapters/vanilla.ts')
    expect(content).toContain('export function createMyTestLib')
    expect(content).toContain("from '../core'")
  })

  it('react adapter exports useMyTestLib()', async () => {
    const dir = await scaffold({ frameworks: ['react'] })
    const content = await read(dir, 'src/adapters/react.tsx')
    expect(content).toContain('export function useMyTestLib')
    expect(content).toContain("from 'react'")
    expect(content).toContain("from '../core'")
  })

  it('vue adapter exports useMyTestLib()', async () => {
    const dir = await scaffold({ frameworks: ['vue'] })
    const content = await read(dir, 'src/adapters/vue.ts')
    expect(content).toContain('export function useMyTestLib')
    expect(content).toContain("from 'vue'")
    expect(content).toContain("from '../core'")
  })

  it('svelte adapter exports createMyTestLib()', async () => {
    const dir = await scaffold({ frameworks: ['svelte'] })
    const content = await read(dir, 'src/adapters/svelte.ts')
    expect(content).toContain('export function createMyTestLib')
    expect(content).toContain("from 'svelte/store'")
    expect(content).toContain("from '../core'")
  })

  it('solid adapter exports createMyTestLib()', async () => {
    const dir = await scaffold({ frameworks: ['solid'] })
    const content = await read(dir, 'src/adapters/solid.ts')
    expect(content).toContain('export function createMyTestLib')
    expect(content).toContain("from 'solid-js'")
    expect(content).toContain("from '../core'")
  })

  it('utility template adapters re-export core directly', async () => {
    const dir = await scaffold({ frameworks: ['vanilla', 'react'], template: 'utility' })
    for (const file of ['src/adapters/vanilla.ts', 'src/adapters/react.tsx']) {
      const content = await read(dir, file)
      expect(content).toContain("export * from '../core'")
    }
  })
})

// ─── package.json ─────────────────────────────────────────────────────────────

describe('generated package.json', () => {
  it('sets the correct library name', async () => {
    const dir = await scaffold({ name: 'my-test-lib' })
    const pkg = await fs.readJson(path.join(dir, 'package.json'))
    expect(pkg.name).toBe('my-test-lib')
  })

  it('version is 1.0.0', async () => {
    const dir = await scaffold()
    const pkg = await fs.readJson(path.join(dir, 'package.json'))
    expect(pkg.version).toBe('1.0.0')
  })

  it('includes subpath export for default entry', async () => {
    const dir = await scaffold()
    const pkg = await fs.readJson(path.join(dir, 'package.json'))
    expect(pkg.exports['.']).toBeDefined()
    expect(pkg.exports['.'].import).toBe('./dist/index.js')
  })

  it('includes subpath export for core', async () => {
    const dir = await scaffold()
    const pkg = await fs.readJson(path.join(dir, 'package.json'))
    expect(pkg.exports['./core']).toBeDefined()
  })

  it('includes exports only for selected frameworks', async () => {
    const dir = await scaffold({ frameworks: ['vanilla', 'react'] })
    const pkg = await fs.readJson(path.join(dir, 'package.json'))
    expect(pkg.exports['./react']).toBeDefined()
    expect(pkg.exports['./vue']).toBeUndefined()
    expect(pkg.exports['./svelte']).toBeUndefined()
    expect(pkg.exports['./solid']).toBeUndefined()
  })

  it('includes peer deps only for selected frameworks', async () => {
    const dir = await scaffold({ frameworks: ['vanilla', 'react', 'vue'] })
    const pkg = await fs.readJson(path.join(dir, 'package.json'))
    expect(pkg.peerDependencies?.react).toBeDefined()
    expect(pkg.peerDependencies?.vue).toBeDefined()
    expect(pkg.peerDependencies?.svelte).toBeUndefined()
    expect(pkg.peerDependencies?.['solid-js']).toBeUndefined()
  })

  it('marks all peer deps as optional', async () => {
    const dir = await scaffold({ frameworks: ['react'] })
    const pkg = await fs.readJson(path.join(dir, 'package.json'))
    expect(pkg.peerDependenciesMeta?.react?.optional).toBe(true)
  })

  it('vanilla has no peer dependency entry', async () => {
    const dir = await scaffold({ frameworks: ['vanilla'] })
    const pkg = await fs.readJson(path.join(dir, 'package.json'))
    expect(pkg.peerDependencies).toBeUndefined()
  })

  it('includes required dev dependencies', async () => {
    const dir = await scaffold()
    const pkg = await fs.readJson(path.join(dir, 'package.json'))
    expect(pkg.devDependencies.tsup).toBeDefined()
    expect(pkg.devDependencies.typescript).toBeDefined()
    expect(pkg.devDependencies.vitest).toBeDefined()
  })
})

// ─── tsup.config.ts ───────────────────────────────────────────────────────────

describe('tsup.config.ts', () => {
  it('is created', async () => {
    const dir = await scaffold()
    expect(await exists(dir, 'tsup.config.ts')).toBe(true)
  })

  it('includes entries only for selected frameworks', async () => {
    const dir = await scaffold({ frameworks: ['vanilla', 'react'] })
    const content = await read(dir, 'tsup.config.ts')
    expect(content).toContain("adapters/vanilla")
    expect(content).toContain("adapters/react")
    expect(content).not.toContain("adapters/vue")
    expect(content).not.toContain("adapters/svelte")
    expect(content).not.toContain("adapters/solid")
  })

  it('uses tsx extension for react adapter entry', async () => {
    const dir = await scaffold({ frameworks: ['react'] })
    const content = await read(dir, 'tsup.config.ts')
    expect(content).toContain('react.tsx')
  })

  it('externals include selected non-vanilla frameworks', async () => {
    const dir = await scaffold({ frameworks: ['vanilla', 'react', 'solid'] })
    const content = await read(dir, 'tsup.config.ts')
    expect(content).toContain("'react'")
    expect(content).toContain("'solid-js'")
    expect(content).not.toContain("'vue'")
  })
})

// ─── Starter templates ────────────────────────────────────────────────────────

describe('starter templates — machine.ts', () => {
  it('blank: exports createCore with subscribe', async () => {
    const dir = await scaffold({ template: 'blank' })
    const content = await read(dir, 'src/core/machine.ts')
    expect(content).toContain('export function createCore')
    expect(content).toContain('subscribe')
  })

  it('ui-component: includes disabled, loading, variant state', async () => {
    const dir = await scaffold({ template: 'ui-component' })
    const content = await read(dir, 'src/core/machine.ts')
    expect(content).toContain('disabled')
    expect(content).toContain('loading')
    expect(content).toContain('variant')
    expect(content).toContain('setDisabled')
    expect(content).toContain('setLoading')
    expect(content).toContain('setVariant')
  })

  it('form-element: includes value, error, touched, valid state', async () => {
    const dir = await scaffold({ template: 'form-element' })
    const content = await read(dir, 'src/core/machine.ts')
    expect(content).toContain('value')
    expect(content).toContain('error')
    expect(content).toContain('touched')
    expect(content).toContain('valid')
    expect(content).toContain('setValue')
    expect(content).toContain('reset')
  })

  it('data-hook: includes data, loading, error state and fetch/reset', async () => {
    const dir = await scaffold({ template: 'data-hook' })
    const content = await read(dir, 'src/core/machine.ts')
    expect(content).toContain('data')
    expect(content).toContain('loading')
    expect(content).toContain('error')
    expect(content).toContain('async')
    expect(content).toContain('reset')
  })

  it('utility: exports pure functions, no subscribe', async () => {
    const dir = await scaffold({ template: 'utility' })
    const content = await read(dir, 'src/core/machine.ts')
    expect(content).toContain('export function formatValue')
    expect(content).toContain('export function validateValue')
    expect(content).not.toContain('subscribe')
  })
})

// ─── Ancillary files ──────────────────────────────────────────────────────────

describe('ancillary files', () => {
  it('creates .gitignore', async () => {
    const dir = await scaffold()
    const content = await read(dir, '.gitignore')
    expect(content).toContain('node_modules/')
    expect(content).toContain('dist/')
  })

  it('creates tsconfig.json with strict mode', async () => {
    const dir = await scaffold()
    const tsconfig = await fs.readJson(path.join(dir, 'tsconfig.json'))
    expect(tsconfig.compilerOptions.strict).toBe(true)
  })

  it('creates tests/core.test.ts', async () => {
    const dir = await scaffold()
    expect(await exists(dir, 'tests/core.test.ts')).toBe(true)
  })

  it('creates README.md with library name', async () => {
    const dir = await scaffold({ name: 'my-test-lib' })
    const content = await read(dir, 'README.md')
    expect(content).toContain('my-test-lib')
  })

  it('README contains architecture section', async () => {
    const dir = await scaffold()
    const content = await read(dir, 'README.md')
    expect(content).toContain('core-adapter')
  })
})

// ─── Examples ─────────────────────────────────────────────────────────────────

describe('examples', () => {
  it('generates vanilla example only when vanilla is selected', async () => {
    const dir = await scaffold({ frameworks: ['vanilla'] })
    expect(await exists(dir, 'examples/vanilla/index.html')).toBe(true)
    expect(await exists(dir, 'examples/react')).toBe(false)
  })

  it('generates react example only when react is selected', async () => {
    const dir = await scaffold({ frameworks: ['react'] })
    expect(await exists(dir, 'examples/react/App.tsx')).toBe(true)
    expect(await exists(dir, 'examples/react/package.json')).toBe(true)
    expect(await exists(dir, 'examples/vanilla')).toBe(false)
  })

  it('generates vue example only when vue is selected', async () => {
    const dir = await scaffold({ frameworks: ['vue'] })
    expect(await exists(dir, 'examples/vue/App.vue')).toBe(true)
    expect(await exists(dir, 'examples/vue/package.json')).toBe(true)
  })

  it('vanilla example references createMyTestLib', async () => {
    const dir = await scaffold({ frameworks: ['vanilla'] })
    const content = await read(dir, 'examples/vanilla/index.html')
    expect(content).toContain('createMyTestLib')
  })

  it('react example references useMyTestLib', async () => {
    const dir = await scaffold({ frameworks: ['react'] })
    const content = await read(dir, 'examples/react/App.tsx')
    expect(content).toContain('useMyTestLib')
  })

  it('vue example references useMyTestLib', async () => {
    const dir = await scaffold({ frameworks: ['vue'] })
    const content = await read(dir, 'examples/vue/App.vue')
    expect(content).toContain('useMyTestLib')
  })
})

// ─── src/index.ts (generated) ─────────────────────────────────────────────────

describe('generated src/index.ts', () => {
  it('contains the actual library name in comments', async () => {
    const dir = await scaffold({ name: 'my-cool-lib' })
    const content = await read(dir, 'src/index.ts')
    expect(content).toContain("'my-cool-lib'")
  })

  it('re-exports vanilla adapter', async () => {
    const dir = await scaffold({ frameworks: ['vanilla'] })
    const content = await read(dir, 'src/index.ts')
    expect(content).toContain("export * from './adapters/vanilla'")
    expect(content).toContain("export * from './core'")
  })
})
