// Checks every avatar in src/avatars/ is wired up: the configured one exists, sprite images exist,
// each avatar's name has a brain persona and a supported motion style, and (in a headless browser)
// each one installs the window.pet contract and survives every state without errors.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import config from '../avatar.config.js'

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const avatarsDir = path.join(webDir, 'src/avatars')
const swiftDir = path.resolve(webDir, '../Sources/HockeyTime')
const avatars = readdirSync(avatarsDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
const source = name => readFileSync(path.join(avatarsDir, name, 'index.js'), 'utf8')
const STATES = ['idle', 'listening', 'thinking', 'done', 'noting', 'confused', 'loading', 'sleeping']

test('the configured avatar exists', () => {
  assert.ok(avatars.includes(config.avatar), `avatar.config.js names "${config.avatar}", found: ${avatars.join(', ')}`)
})

test('henrik is the default and the frog is still available', () => {
  assert.equal(config.avatar, 'henrik')
  assert.ok(avatars.includes('frog'))
})

for (const name of avatars) {
  test(`${name}: has index.js, a brain persona and a supported motion`, () => {
    assert.ok(existsSync(path.join(avatarsDir, name, 'index.js')))
    const src = source(name)
    const petName = src.match(/name:\s*'([^']+)'/)?.[1]
    assert.ok(petName, 'index.js sets a name')
    const brain = readFileSync(path.join(swiftDir, 'Brain.swift'), 'utf8')
    assert.ok(brain.includes(`"${petName}":`), `Brain.swift has a persona for "${petName}"`)
    const motion = src.match(/motion:\s*'([^']+)'/)?.[1]
    assert.ok(['walk', 'glide'].includes(motion), `motion "${motion}" is walk or glide`)
    const wander = readFileSync(path.join(swiftDir, 'Wander.swift'), 'utf8')
    assert.match(wander, new RegExp(`case[^\\n]*\\b${motion}\\b`))
  })

  test(`${name}: every imported asset exists`, () => {
    for (const [, file] of source(name).matchAll(/import\s+\w+\s+from\s+'(\.\/[^']+)'/g)) {
      assert.ok(existsSync(path.join(avatarsDir, name, file)), `${name}/${file} exists`)
    }
  })
}

test('every avatar installs the window.pet contract in a browser', { timeout: 120_000 }, async t => {
  const { build } = await import('vite')
  const { launchBrowser } = await import('./browser.js')
  const outDir = await mkdtemp(path.join(os.tmpdir(), 'avatar-test-'))
  let browser
  try {
    await build({ root: webDir, logLevel: 'silent', build: { outDir, emptyOutDir: true } })
    try {
      browser = await launchBrowser({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
    } catch (error) {
      t.skip(`no browser available (${error.message.split('\n')[0]}); run npm run playwright:install`)
      return
    }
    const page = await browser.newPage({ viewport: { width: 320, height: 320 } })
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    for (const name of avatars) {
      errors.length = 0
      await page.goto(`file://${path.join(outDir, 'index.html')}?avatar=${name}`)
      await page.waitForFunction(() => window.pet && typeof window.pet.setState === 'function', null, { timeout: 15_000 })
      const result = await page.evaluate(async states => {
        const seen = []
        for (const s of states) {
          window.pet.setState(s)
          if (s === 'listening') window.pet.setLevel(0.8)
          window.pet.lookAt(0.5, -0.3)
          window.pet.setVelocity?.(0.7, 0.2)
          await new Promise(r => setTimeout(r, 120))
          seen.push(window.pet.state())
        }
        return { name: window.pet.name, motion: window.pet.motion, seen, hasCore: ['setLevel', 'lookAt', 'setSounds', 'boop'].every(k => typeof window.pet[k] === 'function') }
      }, STATES)
      assert.deepEqual(errors, [], `${name}: no page errors`)
      assert.ok(result.hasCore, `${name}: has setLevel/lookAt/setSounds/boop`)
      assert.ok(['walk', 'glide'].includes(result.motion), `${name}: pet.motion`)
      assert.equal(result.seen[0], 'idle')
      if (name === 'henrik') {
        assert.equal(result.name, 'henrik')
        assert.equal(result.motion, 'glide')
        // talking, a full puck shot (wind-up, flight, cracked glass) and pixel rendering run without errors
        const extras = await page.evaluate(async () => {
          window.pet.setState('idle')
          window.pet.setTalking(true)
          await new Promise(r => setTimeout(r, 300))
          window.pet.setTalking(false)
          const fired = window.pet.shoot()
          const again = window.pet.shoot()        // one shot at a time
          await new Promise(r => setTimeout(r, 2800))
          const c = document.getElementById('c')
          return { fired, again, drawn: c.width > 0 && c.toDataURL().length > 2000 }
        })
        assert.deepEqual(errors, [], 'henrik extras: no page errors')
        assert.equal(extras.fired, true, 'pet.shoot() starts a shot')
        assert.equal(extras.again, false, 'a second shot waits for the first')
        assert.ok(extras.drawn, 'the canvas has content')
      }
    }
  } finally {
    await browser?.close()
    await rm(outDir, { recursive: true, force: true })
  }
})
