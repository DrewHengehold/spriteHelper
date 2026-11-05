// A generic 2D "sprite" pet: give it one image and it implements the whole `window.pet` contract
// (states, mic level, gaze, velocity, talking) with procedural, spring-driven animation on a
// transparent canvas, optionally rendered as chunky pixel art.
//
//   import { createSpritePet } from '../../sprite-pet.js'
//   import image from './my-character.png'
//   createSpritePet({ name: 'my character', image })
//
// Options (all but `image` optional):
//   name        string   what the pet is called (the brain and voice lines use it)
//   image       url      the sprite; any format the browser can draw (png, svg, webp)
//   facing      1 | -1   which way the art faces: 1 = right, -1 = left
//   height      0..1     sprite height as a fraction of the canvas
//   ground      0..1     where the feet touch, as a fraction of the canvas height from the top
//   motion      'glide' | 'walk'   how the Swift app moves the window around the screen
//   pixel       number   size of one "pixel" in CSS px for the pixel-art look (0 or 1 = smooth)
//   trail       bool     ice spray + speed streaks while moving
//   accent      css color  rings, spinner, text
//   doneText    string   pops up on the 'done' state
//   doneSound   'horn' | 'ding'
//   mouth       { x, y, w }        mouth centre and width, as fractions of the image; opens while talking
//   eyes        { pts: [{x, y}], r, lid }  eye centres/radius as image fractions, eyelid colour; blinks
//   stick       { x, y }           stick blade as an image fraction; enables shooting pucks at the screen
//   shotEvery   [min, max] seconds between pucks fired at the screen while idle (default 6 to 12 minutes)
//   twirlEvery  [min, max] seconds between skating twirls while idle (default 2 to 4 minutes)
//
// Tricks can also be triggered: pet.shoot() (puck at the screen), pet.twirl(), and for the goal show the
// app runs across the whole screen, pet.windup(dir) (face dir = 1 right / -1 left and slap a puck out of
// the window) followed by pet.goal() (horns, GOAL!, confetti).

import { createSfx, spring, step, rand, label as drawLabel } from './pet-kit.js'

export function createSpritePet(opts) {
  const o = {
    name: 'pet', facing: 1, height: 0.66, ground: 0.88, motion: 'glide', trail: true, pixel: 0,
    accent: '#1f5fbf', doneText: 'NICE!', doneSound: 'ding', shotEvery: [360, 720], twirlEvery: [120, 240], ...opts,
  }

  // ---------- canvases ----------
  const params = new URLSearchParams(location.search)
  const VSIZE = parseInt(params.get('size') || '0', 10)
  const VW = parseInt(params.get('w') || '0', 10) || VSIZE, VH = parseInt(params.get('h') || '0', 10) || VSIZE
  const W = VW || 320, H = VH || 320
  if (params.get('bg')) document.body.classList.add('bg')
  if (params.get('white')) document.body.classList.add('white')
  if (params.has('pixel')) o.pixel = parseFloat(params.get('pixel')) || 0
  const canvas = document.getElementById('c')
  if (VW) { canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; document.body.style.width = W + 'px'; document.body.style.height = H + 'px' }
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = W * dpr; canvas.height = H * dpr
  const out = canvas.getContext('2d')     // transparent by default

  // Everything is drawn in CSS-px coordinates into a buffer whose resolution is 1 / pixel of the
  // canvas, then scaled up with nearest-neighbour sampling: that is the pixel-art look.
  const px = o.pixel > 1 ? o.pixel : 1 / dpr
  const LW = Math.ceil(W / px), LH = Math.ceil(H / px)
  const makeBuf = () => { const c = document.createElement('canvas'); c.width = LW; c.height = LH; const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = false; return [c, x] }
  const [scene, ctx] = makeBuf()          // the whole frame
  const [spriteBuf, sctx] = makeBuf()     // just the character, so its edges can be made crisp

  const img = new Image()
  let ready = false
  img.onload = () => { ready = true }
  img.onerror = () => console.error('sprite failed to load', o.image)
  img.src = o.image

  const sfx = createSfx()

  const sp = {
    rot: spring(0, 90, 13),      // body lean
    bob: spring(0, 160, 14),     // vertical offset (jumps use impulses on .v)
    sx: spring(1, 200, 16),      // squash and stretch
    sy: spring(1, 200, 16),
    face: spring(o.facing, 70, 15),   // facing; passes through 0 when turning
    vx: spring(0, 30, 11), vy: spring(0, 30, 11),   // smoothed window velocity
    lookX: spring(0, 40, 12), lookY: spring(0, 40, 12),
    level: spring(0, 400, 40),
    mouth: spring(0, 500, 30),
    slide: spring(0, 60, 15), slideY: spring(0, 60, 15),
  }

  // ---------- state ----------
  let state = 'idle', stateT = 0
  let level = 0, talking = false, calm = 0
  let stride = 0, drift = 0, doneT = 99
  let blinkIn = 2 + Math.random() * 3, blink = 0
  let syllableIn = 0
  let nextShot = rand(o.shotEvery[0] * 0.4, o.shotEvery[1] * 0.6)   // the first one comes sooner
  let shot = null                                                    // { phase, t, to }: puck at the screen
  let twirl = null                                                   // { t, from }: skating spin
  let pass = null                                                    // { t, dir, released }: goal-show slap shot
  let nextTwirl = rand(60, 120)
  let banner = o.doneText
  let shake = 0
  const sparks = [], spray = [], cracks = []

  function impulse(v) { sp.bob.v -= v * 22 * (1 - 0.5 * calm); sp.sy.v += v * 0.35; sp.sx.v -= v * 0.2 }

  function burst() {
    const colors = [o.accent, '#ffffff', '#ffd34d', '#7fb2ff']
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, s = 90 + Math.random() * 170
      sparks.push({ x: W / 2, y: H * 0.45, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: 1, color: colors[i % colors.length], size: 3 + Math.random() * 3 })
    }
  }

  const tricking = () => !!(shot || twirl || pass)

  function shoot() {
    if (tricking() || !o.stick) return false
    shot = { phase: 'windup', t: 0 }
    return true
  }

  function startTwirl() {
    if (tricking()) return false
    twirl = { t: 0, from: Math.sign(sp.face.x) || 1 }
    sfx.play('twirl')
    return true
  }

  window.pet = {
    name: o.name,
    motion: o.motion,
    setState(s) {
      if (s === state) return
      const prev = state
      state = s; stateT = 0
      if (s === 'listening') { impulse(-3); sfx.play('pop') }
      if (s === 'thinking') sfx.play('blip')
      if (s === 'done') { impulse(9); burst(); banner = o.doneText; doneT = 0; sfx.play(o.doneSound) }
      if (s === 'confused') { impulse(3); sfx.play('huh') }
      if (s === 'noting') impulse(-2)
      if (s === 'idle') { impulse(2); if (prev === 'loading' || prev === 'sleeping') sfx.play('pop') }
      if (s !== 'idle') { if (shot && shot.phase === 'windup') shot = null; twirl = null }   // real work wins
    },
    setLevel(v) { level = Math.max(0, Math.min(1, +v || 0)) },
    lookAt(x, y) { sp.lookX.t = Math.max(-1, Math.min(1, +x || 0)); sp.lookY.t = Math.max(-1, Math.min(1, +y || 0)) },
    setVelocity(x, y) {
      const was = Math.hypot(sp.vx.t, sp.vy.t)
      sp.vx.t = +x || 0; sp.vy.t = +y || 0
      if (was < 0.1 && Math.hypot(sp.vx.t, sp.vy.t) > 0.3) sfx.play('swish')
    },
    setSounds(on) { sfx.enabled = !!on },
    setTalking(on) { talking = !!on },
    setCalm(c) { calm = Math.max(0, Math.min(1, +c || 0)) },
    setFlySpeed() {},
    setOffset(x, y, secs) { sp.slide.t = x; sp.slideY.t = y; sp.slide.k = sp.slideY.k = secs ? 12 / Math.max(0.05, secs) : 60 },
    setZoom() {}, zoomTo() {},
    ui(html) { let u = document.getElementById('ui'); if (!u) { u = document.createElement('div'); u.id = 'ui'; document.body.appendChild(u) } u.innerHTML = html || '' },
    setCaption(text) { let c = document.getElementById('cap'); if (!c) { c = document.createElement('div'); c.id = 'cap'; document.body.appendChild(c) } c.textContent = text || ''; c.style.opacity = text ? 1 : 0 },
    boop() { impulse(6); sfx.play('boop') },
    shoot,
    twirl: startTwirl,
    windup(dir) {   // goal show: turn toward the net and slap a puck out of the window
      shot = null; twirl = null
      pass = { t: 0, dir: Math.sign(+dir) || 1, released: false }
      return true
    },
    goal() {        // the puck went in
      impulse(10); burst(); banner = 'GOAL!'; doneT = 0
      sfx.play('goalhorn')
    },
    tricking,
    state: () => state,
  }

  // ---------- drawing helpers ----------
  function ellipse(c, x, y, rx, ry, fill, alpha = 1) {
    c.globalAlpha = alpha; c.fillStyle = fill
    c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); c.fill()
    c.globalAlpha = 1
  }
  const label = (...a) => drawLabel(ctx, ...a)
  // crisp pixel edges: no half-transparent fringe around the character
  function hardenAlpha(c) {
    if (px <= 1) return
    const d = c.getImageData(0, 0, LW, LH), a = d.data
    for (let i = 3; i < a.length; i += 4) a[i] = a[i] > 110 ? 255 : 0
    c.putImageData(d, 0, 0)
  }
  function puck(c, x, y, r, tilt) {
    ellipse(c, x, y + r * 0.18, r, r * tilt, '#000000')
    ellipse(c, x, y, r, r * tilt, '#262a33')
    ellipse(c, x - r * 0.25, y - r * tilt * 0.3, r * 0.45, r * tilt * 0.3, '#4a5160')
  }

  // ---------- loop ----------
  let last = performance.now(), t = 0
  function frame(now) {
    requestAnimationFrame(frame)
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000)); last = now
    t += dt; stateT += dt; doneT += dt

    // ----- inputs -----
    sp.level.t = level; step(sp.level, dt)
    step(sp.vx, dt); step(sp.vy, dt); step(sp.lookX, dt); step(sp.lookY, dt)
    step(sp.slide, dt); step(sp.slideY, dt)
    const vx = sp.vx.x, vy = sp.vy.x, lvl = sp.level.x
    const speed = Math.min(1, Math.hypot(vx, vy))
    const moving = speed > 0.06

    // ----- facing: travel direction, else the cursor -----
    if (pass) sp.face.t = pass.dir
    else if (Math.abs(sp.vx.t) > 0.15) sp.face.t = Math.sign(sp.vx.t)
    else if (!moving && Math.abs(sp.lookX.t) > 0.35 && state !== 'sleeping' && !shot) sp.face.t = Math.sign(sp.lookX.t)
    const face = step(sp.face, dt)
    const turning = 1 - Math.min(1, Math.abs(face))            // 1 mid-turn

    // ----- blink, mouth -----
    blinkIn -= dt
    if (blinkIn <= 0) { blink = 1; blinkIn = Math.random() < 0.2 ? 0.25 : rand(2.2, 5.5) }   // sometimes a double blink
    blink = Math.max(0, blink - dt * 7)
    syllableIn -= dt
    if (talking && syllableIn <= 0) { sp.mouth.t = Math.random() < 0.15 ? 0.1 : rand(0.45, 1); syllableIn = rand(0.07, 0.16) }
    if (!talking) sp.mouth.t = 0
    const mouth = Math.max(0, step(sp.mouth, dt))

    // ----- the puck shot -----
    nextShot -= dt
    if (nextShot <= 0) {
      nextShot = rand(o.shotEvery[0], o.shotEvery[1])
      if (state === 'idle' && !talking) shoot()
    }
    nextTwirl -= dt
    if (nextTwirl <= 0) {
      nextTwirl = rand(o.twirlEvery[0], o.twirlEvery[1])
      if (state === 'idle' && !talking) startTwirl()
    }
    let windup = 0
    if (shot) {
      shot.t += dt
      if (shot.phase === 'windup') {
        windup = Math.min(1, shot.t / 0.45)
        if (shot.t >= 0.45) {
          shot.phase = 'flight'; shot.t = 0; sfx.play('slap'); impulse(-4)
          shot.to = { x: W * rand(0.3, 0.7), y: H * rand(0.25, 0.55) }
        }
      } else if (shot.phase === 'flight' && shot.t >= 0.42) {
        shot.phase = 'hit'; shot.t = 0; shake = 1; sfx.play('crack')
        cracks.length = 0
        const n = 9 + Math.floor(Math.random() * 4)
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rand(-0.2, 0.2), pts = [[0, 0]]
          let r = 0, ang = a
          while (r < rand(70, 140)) { r += rand(12, 24); ang += rand(-0.25, 0.25); pts.push([Math.cos(ang) * r, Math.sin(ang) * r]) }
          cracks.push(pts)
        }
      } else if (shot.phase === 'hit' && shot.t >= 1.6) {
        shot = null
      }
    }
    if (pass) {
      pass.t += dt
      windup = Math.min(1, pass.t / 0.45)
      if (!pass.released && pass.t >= 0.45) { pass.released = true; sfx.play('slap'); impulse(-4) }
      if (pass.t >= 1.0) pass = null
    }
    let spin = 0
    if (twirl) {
      twirl.t += dt
      const k = Math.min(1, twirl.t / 1.5)
      spin = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2      // ease in-out
      if (Math.random() < 0.8) {                                             // spray flung off in a circle
        const a = spin * Math.PI * 4 + Math.random()
        spray.push({ x: W / 2 + Math.cos(a) * 30, y: H * o.ground - 3, vx: Math.cos(a) * rand(80, 150), vy: -rand(40, 110), life: 1 })
      }
      if (twirl.t >= 1.5) { twirl = null; spin = 0; impulse(4); sfx.play('swish') }
    }
    shake = Math.max(0, shake - dt * 3)

    // ----- pose targets (the springs smooth them) -----
    stride += dt * (moving ? 2 + speed * 2.4 : 0)
    const push = moving ? Math.sin(stride * Math.PI) : 0
    drift += dt * (state === 'idle' && !moving && !shot ? 0.4 : 0)
    const driftX = Math.sin(drift) * 10 * (state === 'idle' && !moving ? 1 : 0)
    const breathe = Math.sin(t * (state === 'sleeping' ? 1.3 : 2.3)) * (state === 'sleeping' ? 0.03 : 0.014)
    let rot = 0, bob = 0, sx = 1 - breathe * 0.5, sy = 1 + breathe, alpha = 1
    switch (state) {
      case 'listening': sy += lvl * 0.12; sx -= lvl * 0.05; bob -= lvl * 6; break
      case 'thinking': rot += Math.sin(t * 2.6) * 0.05; break
      case 'done': rot += Math.sin(doneT * 12) * 0.07 * Math.max(0, 1 - doneT); if (stateT > 1.6) window.pet.setState('idle'); break
      case 'confused': rot += Math.sin(t * 3.5) * 0.1; if (stateT > 2.2) window.pet.setState('idle'); break
      case 'sleeping': rot += 0.12 * Math.sign(face || 1); sy -= 0.04; break
      case 'loading': alpha = 0.65 + Math.sin(t * 3) * 0.2; break
    }
    if (talking) { bob -= mouth * 2.5; sy += mouth * 0.015 }
    if (moving) {                                           // skating: lean into travel, crouch, rock with each push
      rot += vx * 0.16 + push * 0.045 * speed
      sy -= 0.05 * speed; sx += 0.025 * speed
      bob += Math.abs(push) * 3 * speed
    } else if (state === 'idle') {
      rot += sp.lookY.x * -0.04 + Math.cos(drift) * 0.025
    }
    if ((shot && shot.phase === 'windup') || (pass && !pass.released)) rot -= windup * 0.22 * Math.sign(face || 1)   // lean back, stick up
    if (pass && pass.released && pass.t < 0.6) rot += 0.14 * Math.sign(face || 1)          // follow-through
    if (twirl) { bob -= Math.sin(Math.min(1, twirl.t / 1.5) * Math.PI) * 16; sy += 0.04; sx -= 0.03; rot += Math.sin(spin * Math.PI * 4) * 0.05 }
    if (shot && shot.phase === 'flight' && shot.t < 0.15) rot += 0.12 * Math.sign(face || 1)  // follow-through
    bob -= turning * 8                                       // a little hop as he turns around
    sp.rot.t = rot; sp.bob.t = bob; sp.sx.t = sx; sp.sy.t = sy
    const R = step(sp.rot, dt), B = step(sp.bob, dt), SX = step(sp.sx, dt), SY = step(sp.sy, dt)

    // ----- draw the scene into the low-res buffer -----
    const jx = shake * rand(-6, 6), jy = shake * rand(-6, 6)
    ctx.setTransform(1 / px, 0, 0, 1 / px, jx / px, jy / px)
    ctx.clearRect(-20, -20, W + 40, H + 40)
    const gx = W / 2 + driftX + sp.slide.x * W * 0.25, gy = H * o.ground - sp.slideY.x * H * 0.25
    const sh = H * o.height, sw = ready ? sh * img.width / img.height : sh

    // ice: shadow and a glint under the skates
    const lift = Math.max(0, -B) / 60
    ellipse(ctx, gx, gy + 2, sw * 0.4 * (1 - lift * 0.4), 9 * (1 - lift * 0.4), '#0b1a33', 0.25 * (1 - lift * 0.5))
    ellipse(ctx, gx - sw * 0.12, gy, sw * 0.12, 2.2, '#ffffff', 0.35 + 0.2 * Math.sin(t * 2))

    // spray and speed streaks behind the skates
    const back = -(Math.sign(vx) || Math.sign(face) || 1)
    if (o.trail && moving && Math.random() < speed * 1.6) {
      spray.push({ x: gx + back * sw * 0.18, y: gy - 3, vx: back * rand(40, 120), vy: -rand(30, 90), life: 1 })
    }
    for (let i = spray.length - 1; i >= 0; i--) {
      const p = spray[i]
      p.life -= dt * 2.2; p.vy += 220 * dt; p.x += p.vx * dt; p.y = Math.min(gy, p.y + p.vy * dt)
      if (p.life <= 0) { spray.splice(i, 1); continue }
      ellipse(ctx, p.x, p.y, 2.4 * p.life + 0.8, 2.4 * p.life + 0.8, '#e8f6ff', Math.min(1, p.life * 1.2))
    }
    if (o.trail && speed > 0.25) {
      ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round'; ctx.lineWidth = 3
      for (let i = 0; i < 3; i++) {
        const y = gy - sh * (0.25 + i * 0.2), len = 26 + 18 * speed + Math.sin(t * 9 + i) * 6
        ctx.globalAlpha = 0.5 * speed
        ctx.beginPath(); ctx.moveTo(gx + back * sw * 0.42, y); ctx.lineTo(gx + back * (sw * 0.42 + len), y); ctx.stroke()
      }
      ctx.globalAlpha = 1
    }

    // listening rings
    if (state === 'listening') {
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.9 + i / 3) % 1
        ctx.globalAlpha = (1 - ph) * (0.3 + lvl * 0.6)
        ctx.strokeStyle = o.accent; ctx.lineWidth = 3
        ctx.beginPath(); ctx.ellipse(gx, gy - sh * 0.5, sw * 0.45 + ph * 40, sh * 0.5 + ph * 40, 0, 0, Math.PI * 2); ctx.stroke()
      }
      ctx.globalAlpha = 1
    }

    // the character: drawn into its own buffer (with eyelids and mouth), edges hardened, then composited
    const turnFace = twirl ? twirl.from * Math.cos(spin * Math.PI * 4) : face   // two full spins
    const flip = Math.abs(turnFace) < 0.06 ? 0.06 * (Math.sign(turnFace) || 1) : turnFace
    const toScene = (u, v) => {   // image-fraction point -> scene px, for effects attached to the sprite
      const lx = (u - 0.5) * sw * flip * o.facing * SX, ly = (v - 1) * sh * SY
      return { x: gx + lx * Math.cos(R) - ly * Math.sin(R), y: gy + B + lx * Math.sin(R) + ly * Math.cos(R) }
    }
    if (ready) {
      sctx.setTransform(1 / px, 0, 0, 1 / px, 0, 0)
      sctx.clearRect(0, 0, W, H)
      sctx.save()
      sctx.translate(gx, gy + B)
      sctx.rotate(R)
      sctx.scale(SX * flip * o.facing, SY)
      sctx.translate(-sw / 2, -sh)
      sctx.drawImage(img, 0, 0, sw, sh)
      const ix = u => u * sw, iy = v => v * sh
      if (o.eyes && (blink > 0 || state === 'sleeping')) {          // eyelids
        const shut = state === 'sleeping' ? 1 : Math.sin(Math.min(1, blink) * Math.PI)
        for (const e of o.eyes.pts) {
          const r = o.eyes.r * sw
          sctx.fillStyle = o.eyes.lid
          sctx.fillRect(ix(e.x) - r * 1.3, iy(e.y) - r * 1.35, r * 2.6, r * 2.7 * shut)
          if (shut > 0.6) { sctx.fillStyle = '#17203a'; sctx.fillRect(ix(e.x) - r * 1.1, iy(e.y) + r * 0.2, r * 2.2, Math.max(1.5, r * 0.35)) }
        }
      }
      if (o.mouth && mouth > 0.04) {                                  // open mouth while talking
        const m = o.mouth, mw = m.w * sw
        const h = mw * 0.75 * mouth, w = mw * (0.7 + 0.3 * mouth)
        ellipse(sctx, ix(m.x), iy(m.y) + h * 0.25, w / 2 + 1.5, h / 2 + 1.5, '#17203a')
        ellipse(sctx, ix(m.x), iy(m.y) + h * 0.25, w / 2, h / 2, '#5a1620')
        if (mouth > 0.35) ellipse(sctx, ix(m.x), iy(m.y) + h * 0.5, w * 0.28, h * 0.18, '#e0606e')   // tongue
        sctx.fillStyle = '#ffffff'; sctx.fillRect(ix(m.x) - w * 0.3, iy(m.y) + h * 0.25 - h / 2, w * 0.6, Math.max(1, h * 0.16))   // teeth
      }
      sctx.restore()
      hardenAlpha(sctx)
      ctx.save(); ctx.setTransform(1, 0, 0, 1, jx / px, jy / px); ctx.globalAlpha = alpha; ctx.drawImage(spriteBuf, 0, 0); ctx.restore()
    }

    // overhead effects
    const headY = gy - sh * 1.02 + B
    if (state === 'thinking') {
      for (let i = 0; i < 3; i++) {
        const up = Math.max(0, Math.sin(t * 6 - i * 0.7)) * 7
        ellipse(ctx, gx - 16 + i * 16, headY - 6 - up, 5.5, 5.5, '#ffffff', 0.95)
      }
      if (o.stick) {   // juggles a puck on the blade
        const b = toScene(o.stick.x, o.stick.y), pj = Math.abs(Math.sin(t * 4))
        puck(ctx, b.x, b.y - 8 - pj * 34, 8, 0.45)
      }
    }
    if (state === 'confused') label('?', gx + Math.sign(face || 1) * sw * 0.34, headY + Math.sin(t * 5) * 3, 38, '#ffd34d', Math.min(1, stateT * 4), Math.sin(t * 4) * 0.2)
    if (state === 'sleeping') {
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.45 + i / 3) % 1
        label('z', gx + sw * 0.28 + ph * 26, headY + 10 - ph * 46, 14 + ph * 14, '#cfe3ff', (1 - ph) * Math.min(1, ph * 4))
      }
    }
    if (state === 'noting') {
      ellipse(ctx, gx + sw * 0.42, headY + 14, 7, 7, '#ff3b4f', 0.55 + 0.45 * Math.sin(t * 4))
      label('REC', gx + sw * 0.42, headY + 32, 12, '#ffffff', 1)
    }
    if (state === 'loading') {
      ctx.strokeStyle = o.accent; ctx.lineWidth = 4; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.arc(gx, headY - 4, 12, t * 5, t * 5 + Math.PI * 1.3); ctx.stroke()
    }
    if (doneT < 1.4) {
      const pop = Math.min(1, doneT * 5)
      label(banner, W / 2, H * 0.12 - doneT * 10, 30 + 8 * Math.sin(Math.min(1, doneT * 3) * Math.PI), o.accent, Math.min(1, (1.4 - doneT) * 3) * pop)
    }

    // the puck: from the blade, straight at you, then the "glass" cracks
    if (shot && o.stick && shot.phase !== 'windup') {
      if (shot.phase === 'flight') {
        const k = Math.min(1, shot.t / 0.42), e = k * k * k          // accelerates toward the viewer
        const b = toScene(o.stick.x, o.stick.y)
        const x = b.x + (shot.to.x - b.x) * e, y = b.y - 6 + (shot.to.y - b.y) * e - Math.sin(k * Math.PI) * 30
        const r = 7 + e * 70, tilt = 0.45 + e * 0.5
        ctx.globalAlpha = 0.35; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(2, r * 0.25)
        ctx.beginPath(); ctx.moveTo(b.x, b.y - 6); ctx.lineTo(x, y); ctx.stroke(); ctx.globalAlpha = 1
        puck(ctx, x, y, r, tilt)
      } else if (shot.phase === 'hit') {
        const fade = Math.max(0, 1 - Math.max(0, shot.t - 0.9) / 0.7)
        const { x, y } = shot.to
        ctx.save(); ctx.translate(x, y)
        ctx.lineCap = 'round'; ctx.lineJoin = 'round'
        for (const pass of [['#0d1630', 5], ['#ffffff', 2.5]]) {
          ctx.strokeStyle = pass[0]; ctx.lineWidth = pass[1]; ctx.globalAlpha = fade * (pass[0] === '#ffffff' ? 1 : 0.6)
          for (const pts of cracks) {
            const grow = Math.min(1, shot.t * 8)
            ctx.beginPath(); ctx.moveTo(0, 0)
            for (let i = 1; i < pts.length * grow; i++) ctx.lineTo(pts[i][0], pts[i][1])
            ctx.stroke()
          }
          ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.stroke()
        }
        ctx.restore(); ctx.globalAlpha = 1
        // the puck bounces off the glass and drops away
        const k = Math.min(1, shot.t / 0.6)
        if (k < 1) puck(ctx, x + k * 40 * -back, y + k * k * 220, 77 * (1 - k * 0.8), 0.95 - k * 0.4)
      }
    }

    // goal show: the puck rockets out of the window toward the net (the app takes it from there)
    if (pass && pass.released && pass.t < 0.6 && o.stick) {
      const b = toScene(o.stick.x, o.stick.y), k = Math.min(1, (pass.t - 0.45) / 0.12)
      const x = b.x + pass.dir * k * W * 0.7
      ctx.globalAlpha = 0.5; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(b.x, b.y - 4); ctx.lineTo(x, b.y - 4); ctx.stroke(); ctx.globalAlpha = 1
      if (k < 1) puck(ctx, x, b.y - 4, 8, 0.45)
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

    // ----- upscale to the real canvas -----
    out.setTransform(1, 0, 0, 1, 0, 0)
    out.clearRect(0, 0, canvas.width, canvas.height)
    out.imageSmoothingEnabled = px < 1   // smooth mode keeps full resolution; pixel mode stays blocky
    out.drawImage(scene, 0, 0, LW * px * dpr, LH * px * dpr)
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
  if (params.get('talk')) window.pet.setTalking(true)          // ?talk=1 previews the mouth
  if (params.get('shoot')) setTimeout(shoot, 300)               // ?shoot=1 fires a puck right away
  if (params.get('twirl')) setTimeout(startTwirl, 300)          // ?twirl=1 spins right away
  if (params.get('goal')) {                                      // ?goal=1 previews Henrik's half of the goal show
    setTimeout(() => window.pet.windup(1), 300)
    setTimeout(() => window.pet.goal(), 1300)
  }
  const forced = params.get('state')
  if (forced) { window.pet.setState(forced); if (forced === 'listening') window.pet.setLevel(0.7) }
}
