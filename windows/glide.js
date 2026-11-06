// Henrik's skating, ported from the Mac app's Wander.swift (glide style): he pushes off, carves wide
// turns, coasts to a stop instead of halting, rests now and then, and bounces off the screen edges like a
// puck off the boards. Pure logic (no Electron), so it can be tested on any OS.
//
// Coordinates are screen pixels with y pointing DOWN (Windows/Electron). The pet is told its velocity with
// y pointing UP, matching the Mac app, so `onVelocity` flips it.

const SPEED = 120          // px per second at full glide
const DT = 1 / 60

function rand(a, b) { return a + Math.random() * (b - a) }

class Glide {
  constructor({ onVelocity = () => {} } = {}) {
    this.onVelocity = onVelocity
    this.heading = rand(0, Math.PI * 2)
    this.turnRate = 0
    this.vel = [0, 0]
    this.pos = null
    this.lastSent = [0, 0]
    const now = Date.now()
    this.restUntil = now + 3000
    this.cruiseUntil = this.restUntil + rand(12, 30) * 1000
    this.pausedUntil = 0
  }

  pause(seconds) { this.pausedUntil = Date.now() + seconds * 1000; this.stop() }

  stop() { this.vel = [0, 0]; this.pos = null; this.emit(0, 0) }

  emit(x, y) {
    if (Math.abs(x - this.lastSent[0]) <= 0.01 && Math.abs(y - this.lastSent[1]) <= 0.01) return
    this.lastSent = [x, y]
    this.onVelocity(x, -y)   // the pet expects y up
  }

  /**
   * One 60 Hz step. `win` = {x, y, width, height} of the pet window, `area` = the screen's work area.
   * Returns the new window position {x, y}, or null if the window should not move this tick.
   */
  tick(win, area, { enabled = true, busy = false, now = Date.now() } = {}) {
    if (!enabled || busy || now < this.pausedUntil) { this.stop(); return null }
    // the user dragged the window: pick up from where it is now
    if (this.pos && (Math.abs(this.pos[0] - win.x) > 1.5 || Math.abs(this.pos[1] - win.y) > 1.5)) this.pos = null
    const cur = this.pos || [win.x, win.y]
    const f = { minX: area.x + 4, minY: area.y + 4, maxX: area.x + area.width - 4, maxY: area.y + area.height - 4 }

    if (now > this.cruiseUntil) {          // a short rest, then a new heading
      this.restUntil = now + rand(2, 6) * 1000
      this.cruiseUntil = this.restUntil + rand(12, 30) * 1000
      this.heading = rand(0, Math.PI * 2)
    }
    const resting = now < this.restUntil
    let target = [0, 0]
    if (!resting) {
      // wander: the heading drifts; near the edges it steers back toward the middle
      this.turnRate += (rand(-1, 1) * 0.8 - this.turnRate * 0.9) * DT
      this.heading += this.turnRate * DT
      const cx = (f.minX + f.maxX) / 2 - win.width / 2, cy = (f.minY + f.maxY) / 2 - win.height / 2
      const ex = (cur[0] - cx) / Math.max(1, (f.maxX - f.minX) / 2 - win.width / 2)
      const ey = (cur[1] - cy) / Math.max(1, (f.maxY - f.minY) / 2 - win.height / 2)
      const edge = Math.max(Math.abs(ex), Math.abs(ey))
      if (edge > 0.8) {
        let d = Math.atan2(-ey, -ex) - this.heading
        while (d > Math.PI) d -= 2 * Math.PI
        while (d < -Math.PI) d += 2 * Math.PI
        this.heading += d * Math.min(1, (edge - 0.8) * 0.15)
      }
      target = [Math.cos(this.heading) * SPEED, Math.sin(this.heading) * SPEED * 0.7]
    }
    // momentum: push off quickly, coast down slowly on the ice
    const k = resting ? 0.9 : 1.6
    this.vel[0] += (target[0] - this.vel[0]) * Math.min(1, k * DT)
    this.vel[1] += (target[1] - this.vel[1]) * Math.min(1, k * DT)

    let nx = cur[0] + this.vel[0] * DT, ny = cur[1] + this.vel[1] * DT
    const minX = f.minX, maxX = f.maxX - win.width, minY = f.minY, maxY = f.maxY - win.height
    // bounce off the boards
    if (nx < minX) { nx = minX; this.vel[0] = Math.abs(this.vel[0]) * 0.8; this.heading = Math.atan2(this.vel[1], this.vel[0]) }
    if (nx > maxX) { nx = maxX; this.vel[0] = -Math.abs(this.vel[0]) * 0.8; this.heading = Math.atan2(this.vel[1], this.vel[0]) }
    if (ny < minY) { ny = minY; this.vel[1] = Math.abs(this.vel[1]) * 0.8; this.heading = Math.atan2(this.vel[1], this.vel[0]) }
    if (ny > maxY) { ny = maxY; this.vel[1] = -Math.abs(this.vel[1]) * 0.8; this.heading = Math.atan2(this.vel[1], this.vel[0]) }
    this.pos = [nx, ny]

    const vx = this.vel[0] / SPEED, vy = this.vel[1] / SPEED
    this.emit(Math.abs(vx) < 0.02 ? 0 : vx, Math.abs(vy) < 0.02 ? 0 : vy)
    if (Math.abs(this.vel[0]) + Math.abs(this.vel[1]) <= 0.5) return null
    return { x: Math.round(nx), y: Math.round(ny) }
  }
}

module.exports = { Glide, SPEED }
