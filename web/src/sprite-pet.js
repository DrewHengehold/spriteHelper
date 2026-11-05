// A generic 2D "sprite" pet: give it one image and it implements the whole `window.pet`
// contract (states, mic level, gaze, velocity) with procedural animation on a transparent canvas.
//
//   import { createSpritePet } from '../../sprite-pet.js'
//   import image from './my-character.png'
//   createSpritePet({ name: 'my character', image })
//
// Options (all but `image` optional):
//   name        string   what the pet is called (the brain uses it)
//   image       url      the sprite; any format the browser can draw (png, svg, webp, gif first frame)
//   facing      1 | -1   which way the art faces: 1 = right, -1 = left
//   height      0..1     sprite height as a fraction of the canvas
//   ground      0..1     where the feet touch, as a fraction of the canvas height from the top
//   motion      'glide' | 'walk'   how the Swift app moves the window around the screen
//   trail       bool     ice spray + speed streaks while moving
//   accent      css color  sparks, rings, text
//   doneText    string   pops up on the 'done' state
//   doneSound   'horn' | 'ding'

export function createSpritePet(opts) {
  const o = {
    name: 'pet', facing: 1, height: 0.66, ground: 0.88, motion: 'glide', trail: true,
    accent: '#d6283a', doneText: 'NICE!', doneSound: 'ding', ...opts,
  }

  // ---------- canvas ----------
  const params = new URLSearchParams(location.search)
  const VSIZE = parseInt(params.get('size') || '0', 10)
  const VW = parseInt(params.get('w') || '0', 10) || VSIZE, VH = parseInt(params.get('h') || '0', 10) || VSIZE
  const W = VW || 320, H = VH || 320
  if (params.get('bg')) document.body.classList.add('bg')
  if (params.get('white')) document.body.classList.add('white')
  const canvas = document.getElementById('c')
  if (VW) { canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; document.body.style.width = W + 'px'; document.body.style.height = H + 'px' }
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = W * dpr; canvas.height = H * dpr
  const ctx = canvas.getContext('2d')   // transparent by default

  const img = new Image()
  let ready = false
  img.onload = () => { ready = true }
  img.onerror = () => console.error('sprite failed to load', o.image)
  img.src = o.image

  // ---------- sounds ----------
  const sfx = {
    enabled: true, ac: null,
    tone({ from, to = from, dur = 0.12, vol = 0.18, type = 'sine', delay = 0 }) {
      if (!this.enabled) return
      try {
        this.ac = this.ac || new (window.AudioContext || window.webkitAudioContext)()
        const t0 = this.ac.currentTime + delay
        const osc = this.ac.createOscillator(), g = this.ac.createGain()
        osc.type = type
        osc.frequency.setValueAtTime(from, t0)
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur)
        g.gain.setValueAtTime(0.0001, t0)
        g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01)
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
        osc.connect(g).connect(this.ac.destination)
        osc.start(t0); osc.stop(t0 + dur + 0.02)
      } catch { /* no audio */ }
    },
    play(n) {
      switch (n) {
        case 'pop':  this.tone({ from: 420, to: 760, dur: 0.08 }); break
        case 'boop': this.tone({ from: 600, to: 800, dur: 0.07, vol: 0.2 }); this.tone({ from: 800, to: 420, dur: 0.1, vol: 0.16, delay: 0.07 }); break
        case 'huh':  this.tone({ from: 300, to: 420, dur: 0.12 }); this.tone({ from: 420, to: 260, dur: 0.16, delay: 0.13 }); break
        case 'ding': this.tone({ from: 1320, dur: 0.25, vol: 0.12 }); this.tone({ from: 1760, dur: 0.3, vol: 0.1, delay: 0.08 }); break
        case 'horn': this.tone({ from: 155, to: 150, dur: 0.9, vol: 0.12, type: 'sawtooth' }); this.tone({ from: 233, to: 228, dur: 0.9, vol: 0.08, type: 'sawtooth' }); break
        case 'swish': this.tone({ from: 1800, to: 900, dur: 0.12, vol: 0.05, type: 'triangle' }); break
        case 'blip': this.tone({ from: 880, dur: 0.06, vol: 0.08 }); break
      }
    },
  }

  // ---------- state ----------
  let state = 'idle', stateT = 0
  let level = 0, levelSmooth = 0
  let talking = false
  let sq = 0, sqV = 0                       // squash spring
  let face = o.facing, faceT = o.facing     // smoothed facing (-1..1, passes through 0 when turning)
  const look = { x: 0, y: 0, tx: 0, ty: 0 }
  const vel = { x: 0, y: 0, tx: 0, ty: 0 }
  const slide = { x: 0, y: 0, tx: 0, ty: 0, speed: 3 }
  let calm = 0
  let stride = 0                             // skating stride phase
  let drift = 0                              // little in-place glide when idle
  let doneT = 99
  const sparks = []                          // {x,y,vx,vy,life,color,size}
  const spray = []                           // ice spray behind the skates

  function impulse(v) { sqV += v * (1 - 0.5 * calm) }

  function burst() {
    const colors = [o.accent, '#ffffff', '#1f5fbf', '#ffd34d']
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, sp = 90 + Math.random() * 170
      sparks.push({ x: W / 2, y: H * 0.45, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, life: 1, color: colors[i % colors.length], size: 3 + Math.random() * 3 })
    }
  }

  window.pet = {
    name: o.name,
    motion: o.motion,
    setState(s) {
      if (s === state) return
      const prev = state
      state = s; stateT = 0
      if (s === 'listening') { impulse(-4); sfx.play('pop') }
      if (s === 'thinking') sfx.play('blip')
      if (s === 'done') { impulse(9); burst(); doneT = 0; sfx.play(o.doneSound) }
      if (s === 'confused') { impulse(3); sfx.play('huh') }
      if (s === 'noting') impulse(-3)
      if (s === 'idle') { impulse(2); if (prev === 'loading' || prev === 'sleeping') sfx.play('pop') }
    },
    setLevel(v) { level = Math.max(0, Math.min(1, +v || 0)) },
    lookAt(x, y) { look.tx = Math.max(-1, Math.min(1, +x || 0)); look.ty = Math.max(-1, Math.min(1, +y || 0)) },
    setVelocity(x, y) {
      const was = Math.hypot(vel.tx, vel.ty)
      vel.tx = +x || 0; vel.ty = +y || 0
      if (was < 0.1 && Math.hypot(vel.tx, vel.ty) > 0.3) sfx.play('swish')
    },
    setSounds(on) { sfx.enabled = !!on },
    setTalking(on) { talking = !!on },
    setCalm(c) { calm = Math.max(0, Math.min(1, +c || 0)) },
    setFlySpeed() {},
    setOffset(x, y, secs) { slide.tx = x; slide.ty = y; slide.speed = secs ? 1 / Math.max(0.05, secs) : 3 },
    setZoom() {}, zoomTo() {},
    ui(html) { let u = document.getElementById('ui'); if (!u) { u = document.createElement('div'); u.id = 'ui'; document.body.appendChild(u) } u.innerHTML = html || '' },
    setCaption(text) { let c = document.getElementById('cap'); if (!c) { c = document.createElement('div'); c.id = 'cap'; document.body.appendChild(c) } c.textContent = text || ''; c.style.opacity = text ? 1 : 0 },
    boop() { impulse(6); sfx.play('boop') },
    state: () => state,
  }

  // ---------- drawing helpers ----------
  function ellipse(x, y, rx, ry, fill, alpha = 1) {
    ctx.globalAlpha = alpha; ctx.fillStyle = fill
    ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
  }
  function label(txt, x, y, size, fill, alpha = 1, rot = 0) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.rotate(rot)
    ctx.font = `900 ${size}px -apple-system, "SF Pro Rounded", "Arial Rounded MT Bold", Arial, sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'
    ctx.lineWidth = size * 0.18; ctx.strokeStyle = '#1b2233'; ctx.strokeText(txt, 0, 0)
    ctx.fillStyle = fill; ctx.fillText(txt, 0, 0)
    ctx.restore()
  }

  // ---------- loop ----------
  let last = performance.now(), t = 0
  function frame(now) {
    requestAnimationFrame(frame)
    const dt = Math.min(0.05, (now - last) / 1000); last = now
    t += dt; stateT += dt; doneT += dt

    // springs and smoothing
    const k = 160 * (1 - 0.5 * calm), damp = 12
    sqV += (-k * sq - damp * sqV) * dt; sq += sqV * dt
    levelSmooth += (level - levelSmooth) * Math.min(1, dt * 14)
    look.x += (look.tx - look.x) * Math.min(1, dt * 5); look.y += (look.ty - look.y) * Math.min(1, dt * 5)
    vel.x += (vel.tx - vel.x) * Math.min(1, dt * 4); vel.y += (vel.ty - vel.y) * Math.min(1, dt * 4)
    slide.x += (slide.tx - slide.x) * Math.min(1, dt * slide.speed); slide.y += (slide.ty - slide.y) * Math.min(1, dt * slide.speed)
    const speed = Math.min(1, Math.hypot(vel.x, vel.y))
    const moving = speed > 0.08

    // facing: follow travel direction, else the cursor; turning squeezes through 0 like a real turn
    if (Math.abs(vel.x) > 0.15) faceT = Math.sign(vel.x)
    else if (!moving && Math.abs(look.tx) > 0.35 && state !== 'sleeping') faceT = Math.sign(look.tx)
    face += (faceT - face) * Math.min(1, dt * 9)

    // skating stride and idle drift
    stride += dt * (moving ? 2.2 + speed * 2.5 : 0)
    const stridePush = moving ? Math.sin(stride * Math.PI) : 0
    drift += dt * (state === 'idle' && !moving ? 0.45 : 0)
    const driftX = state === 'idle' && !moving ? Math.sin(drift) * 10 : 0

    // per-state pose
    let bob = 0, rot = 0, sx = 1, sy = 1, alpha = 1
    const breathe = Math.sin(t * (state === 'sleeping' ? 1.4 : 2.4)) * (state === 'sleeping' ? 0.03 : 0.015)
    sy += breathe; sx -= breathe * 0.5
    switch (state) {
      case 'listening': sy += levelSmooth * 0.12; sx -= levelSmooth * 0.05; bob -= levelSmooth * 6; break
      case 'thinking': rot += Math.sin(t * 3) * 0.04; break
      case 'done': bob -= Math.max(0, Math.sin(Math.min(1, doneT / 0.6) * Math.PI)) * 34; rot += Math.sin(doneT * 14) * 0.08 * Math.max(0, 1 - doneT); if (stateT > 1.6) window.pet.setState('idle'); break
      case 'confused': rot += Math.sin(t * 4) * 0.1; if (stateT > 2.2) window.pet.setState('idle'); break
      case 'sleeping': rot += 0.12 * face; sy -= 0.04; break
      case 'loading': alpha = 0.6 + Math.sin(t * 3) * 0.2; break
    }
    if (talking) { bob += Math.abs(Math.sin(t * 16)) * -3; sy += Math.abs(Math.sin(t * 16)) * 0.02 }
    // gliding: lean into the direction of travel, rock with each stride, crouch a little
    if (moving) {
      rot += vel.x * 0.16 + stridePush * 0.05 * speed
      sy -= 0.04 * speed; sx += 0.02 * speed
      bob += Math.abs(stridePush) * 3 * speed
    } else if (state === 'idle') {
      rot += look.y * -0.04 + Math.cos(drift) * 0.03
    }
    sy *= 1 - sq * 0.06; sx *= 1 + sq * 0.05

    // ---------- draw ----------
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    const gx = W / 2 + driftX + slide.x * W * 0.25, gy = H * o.ground - slide.y * H * 0.25
    const sh = H * o.height, sw = ready ? sh * img.width / img.height : sh

    // ice: shadow + glint under the skates
    ellipse(gx, gy + 2, sw * 0.38 * (1 + bob / 120), 9 * (1 + bob / 120), '#0b1a33', 0.22)
    ellipse(gx - sw * 0.12, gy, sw * 0.12, 2.2, '#ffffff', 0.35 + 0.2 * Math.sin(t * 2))

    // spray and speed streaks behind the skates
    if (o.trail && moving && Math.random() < speed * 1.6) {
      const back = -Math.sign(vel.x || face) || -1
      spray.push({ x: gx + back * sw * 0.18, y: gy - 3, vx: back * (40 + Math.random() * 80), vy: -30 - Math.random() * 60, life: 1 })
    }
    for (let i = spray.length - 1; i >= 0; i--) {
      const p = spray[i]
      p.life -= dt * 2.2; p.vy += 220 * dt; p.x += p.vx * dt; p.y = Math.min(gy, p.y + p.vy * dt)
      if (p.life <= 0) { spray.splice(i, 1); continue }
      ellipse(p.x, p.y, 2.4 * p.life + 0.6, 2.4 * p.life + 0.6, '#e8f6ff', p.life * 0.9)
    }
    if (o.trail && speed > 0.25) {
      const back = -Math.sign(vel.x || face) || -1
      ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round'
      for (let i = 0; i < 3; i++) {
        const y = gy - sh * (0.25 + i * 0.2), len = 26 + 18 * speed + Math.sin(t * 9 + i) * 6
        ctx.globalAlpha = 0.45 * speed; ctx.lineWidth = 3
        ctx.beginPath(); ctx.moveTo(gx + back * sw * 0.42, y); ctx.lineTo(gx + back * (sw * 0.42 + len), y); ctx.stroke()
      }
      ctx.globalAlpha = 1
    }

    // listening rings
    if (state === 'listening') {
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.9 + i / 3) % 1
        ctx.globalAlpha = (1 - ph) * (0.25 + levelSmooth * 0.6)
        ctx.strokeStyle = o.accent; ctx.lineWidth = 3
        ctx.beginPath(); ctx.ellipse(gx, gy - sh * 0.5, sw * 0.45 + ph * 40, sh * 0.5 + ph * 40, 0, 0, Math.PI * 2); ctx.stroke()
      }
      ctx.globalAlpha = 1
    }

    // the sprite itself, anchored at the feet
    if (ready) {
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.translate(gx, gy + bob)
      ctx.rotate(rot)
      const flip = face * o.facing
      ctx.scale(sx * (Math.abs(flip) < 0.08 ? 0.08 * Math.sign(flip || 1) : flip), sy)
      ctx.drawImage(img, -sw / 2, -sh, sw, sh)
      ctx.restore()
    }

    // overhead effects
    const headY = gy - sh * 1.02 + bob
    if (state === 'thinking') {
      for (let i = 0; i < 3; i++) {
        const up = Math.max(0, Math.sin(t * 6 - i * 0.7)) * 7
        ellipse(gx - 16 + i * 16, headY - 6 - up, 5.5, 5.5, '#ffffff', 0.95)
      }
      // a puck being juggled
      const pj = Math.abs(Math.sin(t * 4))
      ellipse(gx + face * sw * 0.36, gy - sh * 0.2 - pj * 34, 9, 4, '#111111', 1)
    }
    if (state === 'confused') label('?', gx + face * sw * 0.32, headY + Math.sin(t * 5) * 3, 38, '#ffd34d', Math.min(1, stateT * 4), Math.sin(t * 4) * 0.2)
    if (state === 'sleeping') {
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.45 + i / 3) % 1
        label('z', gx + sw * 0.28 + ph * 26, headY + 10 - ph * 46, 14 + ph * 14, '#cfe3ff', (1 - ph) * Math.min(1, ph * 4))
      }
    }
    if (state === 'noting') {
      ellipse(gx + sw * 0.42, headY + 14, 7, 7, '#ff3b4f', 0.55 + 0.45 * Math.sin(t * 4))
      label('REC', gx + sw * 0.42, headY + 32, 11, '#ffffff', 0.9)
    }
    if (state === 'loading') {
      ctx.strokeStyle = o.accent; ctx.lineWidth = 4; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.arc(gx, headY - 4, 12, t * 5, t * 5 + Math.PI * 1.3); ctx.stroke()
    }
    if (doneT < 1.4) {
      const s = Math.min(1, doneT * 5)
      label(o.doneText, W / 2, H * 0.14 - doneT * 10, 30 + 8 * Math.sin(Math.min(1, doneT * 3) * Math.PI), o.accent, Math.min(1, (1.4 - doneT) * 3) * s)
    }

    // confetti
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i]
      p.life -= dt * 0.9; p.vy += 300 * dt; p.x += p.vx * dt; p.y += p.vy * dt
      if (p.life <= 0) { sparks.splice(i, 1); continue }
      ctx.globalAlpha = p.life; ctx.fillStyle = p.color
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
    }
    ctx.globalAlpha = 1
  }
  requestAnimationFrame(frame)

  // ---------- browser-only preview helpers ----------
  if (params.get('demo')) {
    const states = ['idle', 'listening', 'thinking', 'done', 'noting', 'confused', 'sleeping']
    let i = 0
    setInterval(() => { i = (i + 1) % states.length; window.pet.setState(states[i]) }, 2600)
    setInterval(() => { if (state === 'listening') window.pet.setLevel(Math.abs(Math.sin(performance.now() / 180)) * 0.9) }, 33)
    window.addEventListener('mousemove', e => window.pet.lookAt((e.clientX / W - 0.5) * 2, -(e.clientY / H - 0.5) * 2))
  }
  if (params.get('glide')) {   // ?glide=1 fakes the Swift wander so you can preview the skating
    setInterval(() => { const a = performance.now() / 2500; window.pet.setVelocity(Math.cos(a), Math.sin(a * 0.7) * 0.5) }, 33)
  }
  const forced = params.get('state')
  if (forced) { window.pet.setState(forced); if (forced === 'listening') window.pet.setLevel(0.7) }
}
