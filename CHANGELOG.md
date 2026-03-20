# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] — 2026-03-20

### Added

- Interactive CLI with welcome banner, framework multi-select, naming
  convention picker, TypeScript toggle, starter template picker,
  summary confirmation, and a success block with next steps
- Library name pre-filled from CLI argument — `npx framito my-library`
  falls back to interactive prompt when omitted
- Five starter templates: Blank, UI Component, Form Element,
  Data Hook, and Utility
- Framework adapters for Vanilla JS, React, Vue 3, Svelte, and Solid —
  only selected frameworks are scaffolded, no dead code for unselected targets
- Core-adapter pattern enforced by structure — `src/core/` has zero
  framework deps, `src/adapters/` has zero business logic
- Single npm package with full subpath exports map — one install,
  one publish, every framework
- ESM + CJS output via tsup with full TypeScript declarations
- Optional peer dependencies — installing the package never forces
  a framework on the end user
- Vitest test file scaffolded with an initial smoke test for core logic
- Per-framework examples scaffolded only for selected targets — including
  Svelte and Solid alongside vanilla, React, and Vue
- Scoped packages naming convention generates a proper npm workspace monorepo
  with `packages/core/` and `packages/[framework]/` directories, each with
  their own `package.json`, `tsconfig.json`, and `tsup.config.ts`
- Output format prompt — choose ESM + CJS dual output (default) or ESM only
- Prettier config prompt — opt in to generate a `.prettierrc`
- GitHub Actions CI prompt — opt in to generate `.github/workflows/ci.yml`
  that installs, builds, and tests on every push and pull request to `main`