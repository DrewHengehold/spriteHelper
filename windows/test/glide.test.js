// Henrik's gliding on Windows: stays on screen, bounces off edges, coasts, and respects pauses.
const test = require('node:test')
const assert = require('node:assert/strict')
const { Glide } = require('../glide.js')

const area = { x: 0, y: 0, width: 1920, height: 1040 }
const run = (g, win, seconds, start = Date.now(), opts = {}) => {
  let now = start
  for (let i = 0; i < seconds * 60; i++) {
    now += 1000 / 60
    const next = g.tick(win, area, { now, ...opts })
    if (next) { win.x = next.x; win.y = next.y }
  }
  return now
}

test('he glides around but never leaves the work area', () => {
  const g = new Glide()
  const win = { x: 800, y: 400, width: 320, height: 320 }
  const start = Date.now()
  g.restUntil = start; g.cruiseUntil = start + 600_000
  const seen = new Set()
  let now = start
  for (let i = 0; i < 60 * 120; i++) {      // two minutes
    now += 1000 / 60
    const next = g.tick(win, area, { now })
    if (next) { win.x = next.x; win.y = next.y }
    assert.ok(win.x >= area.x && win.x + win.width <= area.x + area.width, `x in bounds: ${win.x}`)
    assert.ok(win.y >= area.y && win.y + win.height <= area.y + area.height, `y in bounds: ${win.y}`)
    seen.add(`${Math.round(win.x / 200)},${Math.round(win.y / 200)}`)
  }
  assert.ok(seen.size > 3, 'he actually travels around the screen')
})

test('he reports his velocity to the pet with y pointing up', () => {
  const sent = []
  const g = new Glide({ onVelocity: (x, y) => sent.push([x, y]) })
  const win = { x: 800, y: 400, width: 320, height: 320 }
  const start = Date.now()
  g.restUntil = start; g.cruiseUntil = start + 600_000
  g.heading = Math.PI / 2                     // screen y down = moving down
  g.turnRate = 0
  run(g, win, 1, start)
  const [, vy] = sent.at(-1)
  assert.ok(vy < 0, 'moving down the screen is negative y for the pet')
})

test('he stays put while paused, disabled or busy', () => {
  const sent = []
  const g = new Glide({ onVelocity: (x, y) => sent.push([x, y]) })
  const win = { x: 800, y: 400, width: 320, height: 320 }
  const start = Date.now()
  g.restUntil = start; g.cruiseUntil = start + 600_000
  run(g, win, 1, start)
  const before = { ...win }
  g.pause(30)
  run(g, win, 5, start + 1000)
  assert.deepEqual(win, before, 'paused: no movement')
  run(g, win, 2, start + 40_000, { enabled: false })
  assert.deepEqual(win, before, 'disabled: no movement')
  run(g, win, 2, start + 50_000, { busy: true })
  assert.deepEqual(win, before, 'busy (goal show): no movement')
  assert.deepEqual(sent.at(-1), [0, -0], 'he is told he has stopped')
})
