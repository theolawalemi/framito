/**
 * frameit/types
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared type definitions used across the CLI and generator.
 * All prompts, configs, and file generation functions reference these types —
 * nothing else is duplicated between modules.
 *
 * @author  Olawale Balo — Product Designer + Design Engineer
 * @license MIT
 */

/** Supported target frameworks. */
export type Framework = 'vanilla' | 'react' | 'vue' | 'svelte' | 'solid'

/** Package naming strategy chosen by the user. */
export type NamingConvention = 'subpath' | 'scoped'

/** Starter template selected by the user. */
export type Template = 'blank' | 'ui-component' | 'form-element' | 'data-hook' | 'utility'

/** Output format for the built package. */
export type OutputFormat = 'dual' | 'esm'

/** Full configuration collected from CLI prompts. */
export interface ProjectConfig {
  name: string
  frameworks: Framework[]
  naming: NamingConvention
  typescript: boolean
  outputFormat: OutputFormat
  prettier: boolean
  ci: boolean
  template: Template
}
