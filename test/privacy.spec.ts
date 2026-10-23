import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]))

it('privacy.html names every localStorage key the app uses', () => {
  const src = files(join(__dirname, '..', 'src')).map((f) => readFileSync(f, 'utf8')).join('\n')
  const keys = new Set([...src.matchAll(/'(reface-dx-editor\.[a-zA-Z.-]+)'/g)].map((m) => m[1]))
  expect(keys.size).toBeGreaterThan(0)
  const privacy = readFileSync(join(__dirname, '..', 'public', 'privacy.html'), 'utf8')
  for (const k of keys) expect(privacy, k).toContain(k)
  // the probe's keys all start with refacedx-probe
  expect([...src.matchAll(/localStorage\.\w+\(`?'?(refacedx-[^`'$]*)/g)].every((m) => m[1].startsWith('refacedx-probe'))).toBe(true)
  expect(privacy).toContain('refacedx-probe')
})
