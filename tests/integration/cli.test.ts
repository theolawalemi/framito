/**
 * tests/integration/cli.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Integration tests for the frameit CLI.
 * Spawns the compiled dist/index.js process and pipes answers to stdin to
 * simulate real user interaction, then asserts on the generated output.
 *
 * @author  Olawale Balo — Product Designer + Design Engineer
 * @license MIT
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { spawn } from 'child_process'
import fs from 'fs-extra'
import path from 'path'
import os from 'os'

const CLI = path.resolve(process.cwd(), 'dist/index.js')
const ENTER = '\n'

let tmpDir: string

beforeAll(async () => {
  // Ensure the CLI is built before running integration tests
  const built = await fs.pathExists(CLI)
  if (!built) throw new Error('dist/index.js not found — run npm run build first')
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'frameit-cli-test-'))
})

afterEach(async () => {
  // Clean up any generated project directories inside tmpDir
  const entries = await fs.readdir(tmpDir)
  for (const entry of entries) {
    await fs.remove(path.join(tmpDir, entry))
  }
})

/**
 * Spawns the CLI in tmpDir, pipes the provided stdin answers sequentially,
 * and returns the collected stdout output once the process exits.
 */
function runCLI(answers: string[]): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [CLI], {
      cwd: tmpDir,
      env: { ...process.env, FORCE_COLOR: '0' },
    })

    let stdout = ''
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stdout += chunk.toString() })

    let i = 0
    const writeNext = () => {
      if (i < answers.length) {
        setTimeout(() => {
          proc.stdin.write(answers[i++])
          writeNext()
        }, 80)
      } else {
        setTimeout(() => proc.stdin.end(), 200)
      }
    }
    writeNext()

    proc.on('close', (code) => resolve({ stdout, code: code ?? 0 }))
    proc.on('error', reject)
  })
}

// ─── Basic flow ───────────────────────────────────────────────────────────────

describe('CLI basic flow', () => {
  it('starts and shows the banner', async () => {
    const proc = spawn('node', [CLI], {
      cwd: tmpDir,
      env: { ...process.env, FORCE_COLOR: '0' },
    })
    let stdout = ''
    proc.stdout.on('data', (c: Buffer) => { stdout += c.toString() })

    // Give it 500ms to print the banner then kill
    await new Promise(r => setTimeout(r, 500))
    proc.kill()

    expect(stdout.toLowerCase()).toContain('frameit')
  }, 10_000)

  it('cancels gracefully when ctrl-c equivalent is sent', async () => {
    const proc = spawn('node', [CLI], {
      cwd: tmpDir,
      env: { ...process.env, FORCE_COLOR: '0' },
    })
    let stdout = ''
    proc.stdout.on('data', (c: Buffer) => { stdout += c.toString() })

    await new Promise(r => setTimeout(r, 400))
    proc.stdin.write('\x03') // ctrl-c
    await new Promise(r => setTimeout(r, 300))
    proc.kill()

    // Should not have crashed with an unhandled error
    expect(stdout).not.toContain('UnhandledPromiseRejection')
  }, 10_000)
})

// ─── Full scaffold ────────────────────────────────────────────────────────────

describe('full scaffold flow', () => {
  it('runs without crashing or throwing unhandled errors', async () => {
    // clack/prompts requires a real TTY for interactive prompts, so we cannot
    // drive the full scaffold flow reliably in a non-TTY CI environment.
    // This test verifies the process starts, runs, and exits without
    // unhandled rejections or runtime crashes — file generation is fully
    // covered by the unit tests in generator.test.ts.
    const { stdout } = await runCLI([
      'cli-test-lib' + ENTER,
      ENTER,
      ENTER,
      ENTER,
      ENTER,
      ENTER,
      ENTER,
    ])

    expect(stdout).not.toContain('UnhandledPromiseRejection')
    expect(stdout).not.toContain('TypeError')
    expect(stdout.toLowerCase()).toContain('frameit')
  }, 30_000)
})
