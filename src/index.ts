/**
 * frameit/cli
 * ─────────────────────────────────────────────────────────────────────────────
 * Interactive CLI entry point. Collects library name, target frameworks,
 * naming convention, TypeScript preference, and starter template from the user,
 * then delegates file generation to the generator module.
 *
 * @author  Olawale Balo — Product Designer + Design Engineer
 * @license MIT
 */

import * as p from '@clack/prompts'
import chalk from 'chalk'
import { generateProject } from './generator.js'
import type { Framework, NamingConvention, OutputFormat, Template } from './types.js'

async function main() {
  const nameArg = process.argv[2]

  console.log()
  console.log(chalk.hex('#20C55C').bold([
    '  ██████╗██████╗  █████╗ ███╗   ███╗██╗████████╗ ██████╗ ',
    '  ██╔════╝██╔══██╗██╔══██╗████╗ ████║██║╚══██╔══╝██╔═══██╗',
    '  █████╗  ██████╔╝███████║██╔████╔██║██║   ██║   ██║   ██║',
    '  ██╔══╝  ██╔══██╗██╔══██║██║╚██╔╝██║██║   ██║   ██║   ██║',
    '  ██║     ██║  ██║██║  ██║██║ ╚═╝ ██║██║   ██║   ╚██████╔╝',
    '  ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝   ╚═╝    ╚═════╝ ',
  ].join('\n')))
  console.log()
  console.log(chalk.hex('#888888')('  The scaffold that thinks in frameworks.'))
  console.log(chalk.hex('#888888')('  Build your library once, ship it everywhere.'))
  console.log()
  p.intro(chalk.hex('#888888')('framito — ready'))

  const libraryName = await p.text({
    message: 'Library name?',
    placeholder: 'my-library',
    initialValue: nameArg || '',
    validate: (v) => {
      if (!v || v.trim().length === 0) return 'Library name is required'
      // Disallow leading slash and path separators to prevent directory traversal.
      // Scoped names like @scope/name are valid but must start with @.
      if (!/^(@[a-z0-9-]+\/)?[a-z0-9-]+$/.test(v)) {
        return 'Use lowercase letters, numbers, and hyphens (e.g. frameit or @scope/frameit)'
      }
    },
  })
  if (p.isCancel(libraryName)) { p.cancel('Cancelled'); process.exit(0) }

  const libName = libraryName as string

  // Swap clack's square checkboxes ◻/◼ with circles ○/● for visual consistency,
  // and suppress the built-in "Press space to select" hint since we show it in the message.
  const originalWrite = process.stdout.write.bind(process.stdout)
  ;(process.stdout as NodeJS.WriteStream).write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
    if (typeof chunk === 'string') {
      chunk = chunk.replace(/◼/g, '●').replace(/◻/g, '○')
      chunk = chunk.replace(/.*Press\s.*space\s.*to select.*\n?/g, '')
    }
    return (originalWrite as (...args: unknown[]) => boolean)(chunk, ...rest)
  }) as typeof originalWrite

  const frameworksResult = await p.multiselect<Framework>({
    message: `Which frameworks? ${chalk.hex('#888888')('(space to select, enter to confirm)')}`,
    options: [
      { value: 'vanilla', label: 'Vanilla JS' },
      { value: 'react',   label: 'React' },
      { value: 'vue',     label: 'Vue' },
      { value: 'svelte',  label: 'Svelte' },
      { value: 'solid',   label: 'Solid' },
    ],
  })

  process.stdout.write = originalWrite

  if (p.isCancel(frameworksResult)) { p.cancel('Cancelled'); process.exit(0) }

  const frameworks = frameworksResult as Framework[]

  if (frameworks.length === 0) {
    p.cancel('Select at least one framework.')
    process.exit(1)
  }

  const naming = await p.select({
    message: 'Package naming convention?',
    options: [
      {
        value: 'subpath',
        label: 'Subpath exports — single core',
        hint: `e.g. ${libName}, ${libName}/react, ${libName}/vue`,
      },
      {
        value: 'scoped',
        label: 'Scoped packages — monorepo',
        hint: `e.g. @${libName}/core, @${libName}/react`,
      },
    ],
    initialValue: 'subpath',
  })
  if (p.isCancel(naming)) { p.cancel('Cancelled'); process.exit(0) }

  const typescript = await p.confirm({
    message: 'Use TypeScript?',
    initialValue: true,
  })
  if (p.isCancel(typescript)) { p.cancel('Cancelled'); process.exit(0) }

  const outputFormat = await p.select({
    message: 'Output format?',
    options: [
      { value: 'dual', label: 'ESM + CJS', hint: 'broadest compatibility (recommended)' },
      { value: 'esm',  label: 'ESM only',  hint: 'modern bundlers (Vite, Next.js, etc.)' },
    ],
    initialValue: 'dual',
  })
  if (p.isCancel(outputFormat)) { p.cancel('Cancelled'); process.exit(0) }

  const prettier = await p.confirm({
    message: 'Add Prettier config?',
    initialValue: true,
  })
  if (p.isCancel(prettier)) { p.cancel('Cancelled'); process.exit(0) }

  const ci = await p.confirm({
    message: 'Add GitHub Actions CI?',
    initialValue: true,
  })
  if (p.isCancel(ci)) { p.cancel('Cancelled'); process.exit(0) }

  const template = await p.select({
    message: 'Pick a starter template:',
    options: [
      {
        value: 'blank',
        label: 'Blank',
        hint: 'infrastructure only, empty core',
      },
      {
        value: 'ui-component',
        label: 'UI Component',
        hint: 'props, state, event handlers (button and input)',
      },
      {
        value: 'form-element',
        label: 'Form Element',
        hint: 'value, validation, error state',
      },
      {
        value: 'data-hook',
        label: 'Data Hook',
        hint: 'loading, data, error, refetch (API wrapper)',
      },
      {
        value: 'utility',
        label: 'Utility',
        hint: 'pure functions, no state (formatters, validators)',
      },
    ],
    initialValue: 'blank',
  })
  if (p.isCancel(template)) { p.cancel('Cancelled'); process.exit(0) }

  p.note(
    [
      `Library:      ${chalk.hex('#20C55C')(libName)}`,
      `Frameworks:   ${chalk.hex('#20C55C')(frameworks.join(', '))}`,
      `Naming:       ${chalk.hex('#20C55C')(naming as string)}`,
      `TypeScript:   ${chalk.hex('#20C55C')(typescript ? 'yes' : 'no')}`,
      `Output:       ${chalk.hex('#20C55C')(outputFormat as string)}`,
      `Prettier:     ${chalk.hex('#20C55C')((prettier as boolean) ? 'yes' : 'no')}`,
      `CI:           ${chalk.hex('#20C55C')((ci as boolean) ? 'yes' : 'no')}`,
      `Template:     ${chalk.hex('#20C55C')(template as string)}`,
    ].join('\n'),
    'Summary'
  )

  const confirmed = await p.confirm({
    message: 'Create project?',
    initialValue: true,
  })
  if (p.isCancel(confirmed) || !confirmed) { p.cancel('Cancelled'); process.exit(0) }

  const spinner = p.spinner()
  spinner.start('Creating project files...')

  try {
    await generateProject({
      name: libName,
      frameworks,
      naming: naming as NamingConvention,
      typescript: typescript as boolean,
      outputFormat: outputFormat as OutputFormat,
      prettier: prettier as boolean,
      ci: ci as boolean,
      template: template as Template,
    })
    spinner.stop('Project files created')
  } catch (err) {
    spinner.stop('Failed')
    p.cancel(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  p.outro('')
  console.log(chalk.hex('#20C55C')(`  ${libName} created successfully`))

  printSuccess(libName, frameworks)
}

function toPascal(name: string): string {
  const base = name.startsWith('@') ? name.split('/')[1] : name
  return base.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')
}

function printSuccess(name: string, frameworks: Framework[]) {
  const pascal  = toPascal(name)
  const hook    = `use${pascal}`
  const factory = `create${pascal}`

  console.log()
  console.log(chalk.bold('Next steps:'))
  console.log()
  console.log(`  cd ${name}`)
  console.log('  npm install')
  console.log('  npm run dev')
  console.log()
  console.log(chalk.bold('Where to put your logic:'))
  console.log()
  console.log(`  ${chalk.hex('#888888')('→')} src/core/machine.ts     ${chalk.hex('#888888')('your state and logic')}`)
  console.log(`  ${chalk.hex('#888888')('→')} src/core/types.ts       ${chalk.hex('#888888')('your TypeScript types')}`)
  console.log(`  ${chalk.hex('#888888')('→')} src/core/utils.ts       ${chalk.hex('#888888')('your helper functions')}`)
  console.log()
  console.log(chalk.bold('How developers import your library:'))
  console.log()
  if (frameworks.includes('vanilla')) console.log(`  import { ${factory} } from '${name}'          ${chalk.hex('#888888')('vanilla')}`)
  if (frameworks.includes('react'))   console.log(`  import { ${hook} }    from '${name}/react'    ${chalk.hex('#888888')('react')}`)
  if (frameworks.includes('vue'))     console.log(`  import { ${hook} }    from '${name}/vue'      ${chalk.hex('#888888')('vue')}`)
  if (frameworks.includes('svelte'))  console.log(`  import { ${factory} } from '${name}/svelte'   ${chalk.hex('#888888')('svelte')}`)
  if (frameworks.includes('solid'))   console.log(`  import { ${factory} } from '${name}/solid'    ${chalk.hex('#888888')('solid')}`)
  console.log()
}

main()
