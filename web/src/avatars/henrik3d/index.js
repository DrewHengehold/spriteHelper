// Henrik in 3D: a voxel goalie built from cubes, toon-shaded with dark outlines and rendered through a
// low-res pixel filter, so he looks like pixel art but truly turns, leans and spins in three dimensions.
// Same window.pet contract and tricks as the 2D sprite (web/src/sprite-pet.js), so the app treats them alike.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createSfx, spring, step, rand, label } from '../../pet-kit.js'

const params = new URLSearchParams(location.search)
const VSIZE = parseInt(params.get('size') || '0', 10)
const VW = parseInt(params.get('w') || '0', 10) || VSIZE, VH = parseInt(params.get('h') || '0', 10) || VSIZE
const W = VW || 320, H = VH || 320
if (params.get('bg')) document.body.classList.add('bg')
if (params.get('white')) document.body.classList.add('white')

// ---------- tuning ----------
const PIXEL = params.has('pixel') ? Math.max(1, parseFloat(params.get('pixel')) || 1) : 2   // CSS px per pixel
const SHOT_EVERY = [360, 720]     // puck at the screen: every 6-12 minutes while idle
const TWIRL_EVERY = [120, 240]    // skating twirl: every 2-4 minutes while idle
const ACCENT = '#1f5fbf'

// ---------- renderer: low-res buffer upscaled with nearest-neighbour = pixel art ----------
const canvas = document.getElementById('c')
canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
canvas.style.imageRendering = 'pixelated'
if (VW) { document.body.style.width = W + 'px'; document.body.style.height = H + 'px' }
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false })
renderer.setPixelRatio(1 / PIXEL)
renderer.setSize(W, H, false)
renderer.setClearColor(0x000000, 0)
renderer.outputColorSpace = THREE.SRGBColorSpace

// 2D overlay for text and screen effects (GOAL!, ?, z, cracked glass), also pixelated
const fx = document.createElement('canvas')
fx.width = Math.ceil(W / PIXEL); fx.height = Math.ceil(H / PIXEL)
Object.assign(fx.style, { position: 'absolute', left: '0', top: '0', width: W + 'px', height: H + 'px', imageRendering: 'pixelated', pointerEvents: 'none' })
canvas.after(fx)
const fctx = fx.getContext('2d')

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 50)
camera.position.set(0, 2.5, 8.6)
camera.lookAt(0, 1.45, 0)

scene.add(new THREE.HemisphereLight(0xeef4ff, 0x9fb4d8, 0.75))
scene.add(new THREE.AmbientLight(0xffffff, 0.35))
const key = new THREE.DirectionalLight(0xffffff, 1.8); key.position.set(-2.5, 4.5, 4); scene.add(key)
const rim = new THREE.DirectionalLight(0xbcd4ff, 1.0); rim.position.set(3, 2, -3); scene.add(rim)

function gradientMap(steps) {
  const data = new Uint8Array(steps.length * 4)
  steps.forEach((v, i) => { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255 })
  const t = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat)
  t.minFilter = t.magFilter = THREE.NearestFilter
  t.needsUpdate = true
  return t
}
const toonMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap([110, 180, 235, 255]) })
const inkMat = new THREE.MeshBasicMaterial({ color: 0x0d1630, side: THREE.BackSide })

// ---------- voxel builder ----------
// A part is a list of boxes in voxel units (model space: x right, y up from the ice, z toward the viewer):
// [x0, y0, z0, x1, y1, z1, color, outline = true]. Each part merges into one toon mesh plus one outline
// shell (slightly larger boxes, back faces, dark), positioned at a pivot so it can rotate as a limb.
const V = 0.08   // world units per voxel
const C = {
  skin: '#f1c7a3', skinDark: '#e2a985', beard: '#6e5a4c', stache: '#4e3e33', hair: '#4a3528', grey: '#a39589',
  eye: '#17203a', white: '#ffffff', blue: '#2a5bd7', red: '#d62a3a', pad: '#f4f6fb', boot: '#20263a',
  steel: '#c9d3df', stick: '#2b2f3a', tape: '#ffffff', mouth: '#4a1820', brow: '#3e2c22',
}
function part(boxes, pivot = [0, 0, 0]) {
  const geos = [], shells = []
  for (const [x0, y0, z0, x1, y1, z1, color, outline = true] of boxes) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0
    const cx = (x0 + x1) / 2 - pivot[0], cy = (y0 + y1) / 2 - pivot[1], cz = (z0 + z1) / 2 - pivot[2]
    const g = new THREE.BoxGeometry(w * V, h * V, d * V).toNonIndexed()
    g.translate(cx * V, cy * V, cz * V)
    const col = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
    g.deleteAttribute('uv')
    geos.push(g)
    if (outline) {
      const e = 0.32
      const s = new THREE.BoxGeometry((w + e * 2) * V, (h + e * 2) * V, (d + e * 2) * V).toNonIndexed()
      s.translate(cx * V, cy * V, cz * V)
      s.deleteAttribute('uv'); s.deleteAttribute('normal')
      shells.push(s)
    }
  }
  const group = new THREE.Group()
  group.position.set(pivot[0] * V, pivot[1] * V, pivot[2] * V)
  group.add(new THREE.Mesh(mergeGeometries(geos), toonMat))
  if (shells.length) group.add(new THREE.Mesh(mergeGeometries(shells), inkMat))
  return group
}
const mirror = boxes => boxes.map(([x0, y0, z0, x1, y1, z1, ...r]) => [-x1, y0, z0, -x0, y1, z1, ...r])

// ---------- Henrik ----------
const root = new THREE.Group()          // on the ice: turning, gliding lean, hops
scene.add(root)
const body = new THREE.Group()          // squash and stretch from the skates up
root.add(body)

// legs: pad + skate, pivot at the hip so they can push off while skating
function leg(side) {
  const pad = [
    [-6.5, 2, -2.5, -0.5, 15, 2.5, C.pad],
    [-6.5, 4, 2.5, -0.5, 5, 2.8, C.red, false],                                     // red stripe
    [-6.5, 0.7, -3, -0.8, 2.2, 3.5, C.boot],                                          // skate boot
    [-4.2, 0, -3.6, -3.2, 0.7, 4.2, C.steel],                                         // blade
  ]
  for (const y of [7, 11]) {                                                          // blue chevrons
    ;[[-6, 2], [-5, 1], [-4, 0], [-3, 1], [-2, 2]].forEach(([x, dy]) => pad.push([x, y + dy, 2.5, x + 1, y + dy + 1, 2.8, C.blue, false]))
  }
  pad.push([-3.6, 12.5, 2.5, -3, 14.5, 2.7, '#c7cfdd', false])
  const g = part(side < 0 ? pad : mirror(pad), [side * 3.5, 15, 0])
  body.add(g)
  return g
}
const legL = leg(-1), legR = leg(1)

const torso = part([
  [-6.5, 13, -3.5, 6.5, 16.5, 3.5, C.red],                                            // pants
  [-7, 16, -4, 7, 27, 4, C.blue],                                                      // jersey
  [-7.2, 16, -4.2, 7.2, 18.6, 4.2, C.white, false],                                   // hem: white
  [-7.3, 16.9, -4.3, 7.3, 17.7, 4.3, C.red, false],                                   //       red
  [-7.2, 24.6, -4.2, 7.2, 26.2, 4.2, C.white, false],                                 // chest stripe
  [-7.3, 25.05, -4.3, 7.3, 25.75, 4.3, C.red, false],
  [-3, 26.5, -3, 3, 27.6, 4.3, C.red],                                                 // collar
  ...digits('30', -3.5, 19.1, 4.05),                                                  // number on the chest
  ...mirror(digits('30', -3.5, 19.1, -4.35)),                                        // and on the back, reading right way round
])
body.add(torso)

function digits(str, x0, y0, z) {
  const font = { 3: ['111', '001', '111', '001', '111'], 0: ['111', '101', '101', '101', '111'] }
  const out = []
  ;[...str].forEach((ch, i) => font[ch].forEach((row, r) => [...row].forEach((on, c) => {
    if (on === '1') out.push([x0 + i * 4 + c, y0 + (4 - r), z, x0 + i * 4 + c + 1, y0 + (5 - r), z + 0.3, C.white, false])
  })))
  return out
}

// arms pivot at the shoulders. Left (viewer's left): catch glove. Right: blocker and the stick.
const sleeve = x => [
  [x, 18, -2.5, x + 3.5, 26, 2.5, C.blue],
  [x - 0.15, 19.5, -2.65, x + 3.65, 21, 2.65, C.white, false],
  [x - 0.25, 19.95, -2.75, x + 3.75, 20.55, 2.75, C.red, false],
]
const armL = part([
  ...sleeve(-10.2),
  [-12.5, 12.5, -2, -6.5, 18.5, 3.5, C.pad],                                          // catch glove
  [-11.5, 14, 3.5, -7.5, 17, 3.8, C.blue, false],
  [-12.6, 16.5, -1, -12.3, 18.4, 2.5, '#c7cfdd', false],
], [-7, 25.5, 0])
const armR = part([
  ...sleeve(6.7),
  [7, 12, 1.5, 12.5, 18.5, 3.6, C.pad],                                                // blocker
  [7.5, 13.5, 3.6, 12, 14.2, 3.9, C.blue, false],
  [7.5, 16.3, 3.6, 12, 17, 3.9, C.blue, false],
  [11, 1, 3.7, 12, 13, 4.7, C.stick],                                                  // shaft
  [10.4, 1, 3.7, 12.6, 7, 4.7, C.stick],                                               // paddle
  [11, 0, 3.4, 18.5, 1.4, 4.9, C.stick],                                               // blade
  [11, 9, 3.65, 12, 9.6, 4.75, C.tape, false],
], [7, 25.5, 0])
body.add(armL, armR)
const bladeLocal = new THREE.Vector3((15 - 7) * V, (0.7 - 25.5) * V, 4.1 * V)   // blade centre in armR space

// head pivots at the neck: turns toward the cursor, nods, droops when asleep
const head = part([
  [-5, 27, -4, 5, 37, 4, C.skin],
  [-5.2, 27, 3, 5.2, 31, 4.6, C.beard],                                                // beard, front
  [-5.3, 27, -1, -4.4, 33, 4.3, C.beard], [4.4, 27, -1, 5.3, 33, 4.3, C.beard],        //        sides
  [-2.6, 30.5, 4.4, 2.6, 31.4, 4.95, C.stache, false],                                // moustache
  [-0.7, 31.4, 4, 0.7, 33.2, 5.3, C.skinDark],                                         // nose
  [-3, 33, 4, -1.6, 35, 4.3, C.eye, false], [1.6, 33, 4, 3, 35, 4.3, C.eye, false],   // eyes
  [-2.5, 34.2, 4.3, -2, 34.7, 4.4, C.white, false], [2.1, 34.2, 4.3, 2.6, 34.7, 4.4, C.white, false],
  [-3.5, 35.6, 4, -1.2, 36.2, 4.4, C.brow, false], [1.2, 35.6, 4, 3.5, 36.2, 4.4, C.brow, false],
  [-5.6, 36.5, -4.6, 5.6, 39.5, 4.4, C.hair],                                          // hair: top, swept back
  [-5.6, 36, 3, 5.6, 37.4, 4.7, C.hair],
  [-5.6, 28, -4.6, 5.6, 37, -3, C.hair],                                               //       back, to the collar
  [-5.7, 31, -4.6, -4.8, 37, -0.8, C.hair], [4.8, 31, -4.6, 5.7, 37, -0.8, C.hair],   //       sides
  [-5.8, 33, -0.6, -5.2, 35.2, 0.8, C.grey, false], [5.2, 33, -0.6, 5.8, 35.2, 0.8, C.grey, false],
  [-5.5, 31, -0.6, -5, 34, 1.2, C.skinDark], [5, 31, -0.6, 5.5, 34, 1.2, C.skinDark],  // ears
], [0, 27, 0])
body.add(head)
// mouth: opens per syllable while talking (scaled from its top edge)
const mouth = part([[-1.6, 28.2, 4.62, 1.6, 30.2, 4.95, C.mouth, false], [-1.2, 29.6, 4.96, 1.2, 30.2, 5.0, C.white, false]], [0, 30.2, 4.8])
mouth.position.sub(head.position)
head.add(mouth)
// eyelids: skin-coloured shutters that drop over the eyes
const lids = part([[-3.2, 32.8, 4.31, -1.4, 35.3, 4.5, C.skin, false], [1.4, 32.8, 4.31, 3.2, 35.3, 4.5, C.skin, false]], [0, 35.3, 4.4])
lids.position.sub(head.position)
head.add(lids)

// ice: soft shadow and a few spray cubes
const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24), new THREE.MeshBasicMaterial({ color: 0x0b1a33, transparent: true, opacity: 0.28, depthWrite: false }))
shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.005; shadow.scale.set(1.25, 0.8, 1)
scene.add(shadow)

const cube = new THREE.BoxGeometry(1, 1, 1)
function pool(n, color) {
  const arr = []
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(cube, new THREE.MeshBasicMaterial({ color, transparent: true }))
    m.visible = false; scene.add(m); arr.push({ m, life: 0, v: new THREE.Vector3() })
  }
  return arr
}
const spray = pool(40, 0xe8f6ff)
const confetti = pool(48, 0xffffff)
const confettiColors = [0x1f5fbf, 0xffffff, 0xffd34d, 0x7fb2ff, 0xd62a3a]
function emit(p, pos, vel, size, life = 1, color) {
  const s = p.find(q => q.life <= 0) || p[0]
  s.life = life; s.m.visible = true; s.m.position.copy(pos); s.v.copy(vel); s.m.scale.setScalar(size)
  if (color != null) s.m.material.color.setHex(color)
}
function stepPool(p, dt, gravity, floor = 0) {
  for (const s of p) {
    if (s.life <= 0) continue
    s.life -= dt * 1.4
    s.v.y -= gravity * dt
    s.m.position.addScaledVector(s.v, dt)
    if (s.m.position.y < floor) { s.m.position.y = floor; s.v.multiplyScalar(0.4) }
    s.m.rotation.x += dt * 6; s.m.rotation.y += dt * 4
    s.m.material.opacity = Math.min(1, s.life * 1.5)
    if (s.life <= 0) s.m.visible = false
  }
}

// the puck (shot at the screen, slapped out for the goal show, juggled while thinking)
const puckMesh = new THREE.Group()
{
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.07, 16), new THREE.MeshToonMaterial({ color: 0x24272f, gradientMap: toonMat.gradientMap }))
  const o = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.09, 16), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide }))
  puckMesh.add(p, o)
}
puckMesh.visible = false
scene.add(puckMesh)

// ---------- sound, springs, state ----------
const sfx = createSfx()
const sp = {
  turn: spring(0, 60, 13),         // facing (rotation about y)
  lean: spring(0, 80, 12),
  pitch: spring(0, 80, 12),        // lean forward/back (wind-ups, sleeping)
  bob: spring(0, 160, 14),
  sx: spring(1, 200, 16), sy: spring(1, 200, 16),
  headY: spring(0, 50, 11), headX: spring(0, 50, 11), headZ: spring(0, 50, 11),
  armL: spring(0, 90, 12), armR: spring(0, 120, 12),
  vx: spring(0, 30, 11), vy: spring(0, 30, 11),
  lookX: spring(0, 40, 12), lookY: spring(0, 40, 12),
  level: spring(0, 400, 40), mouth: spring(0, 500, 30),
  slide: spring(0, 60, 15), slideY: spring(0, 60, 15),
}
let state = 'idle', stateT = 0, level = 0, talking = false, calm = 0
let stride = 0, drift = 0, doneT = 99, banner = 'SAVE!'
let blinkIn = 2 + Math.random() * 3, blink = 0, syllableIn = 0
let nextShot = rand(SHOT_EVERY[0] * 0.4, SHOT_EVERY[1] * 0.6), nextTwirl = rand(60, 120)
let shot = null, twirl = null, pass = null, shake = 0
const cracks = []
const tricking = () => !!(shot || twirl || pass)
function impulse(v) { sp.bob.v += v * 0.11 * (1 - 0.5 * calm); sp.sy.v += v * 0.35; sp.sx.v -= v * 0.2 }
function burst() {
  const at = new THREE.Vector3(0, 2.2, 0.5)
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, s = rand(1.5, 3.5)
    emit(confetti, at, new THREE.Vector3(Math.cos(a) * s, rand(2, 5), Math.sin(a) * s * 0.6), 0.07, 1.6, confettiColors[i % confettiColors.length])
  }
}
function shoot() { if (tricking()) return false; shot = { phase: 'windup', t: 0 }; return true }
function startTwirl() { if (tricking()) return false; twirl = { t: 0 }; sfx.play('twirl'); return true }

window.pet = {
  name: 'henrik',
  motion: 'glide',
  setState(s) {
    if (s === state) return
    const prev = state
    state = s; stateT = 0
    if (s === 'listening') { impulse(-3); sfx.play('pop') }
    if (s === 'thinking') sfx.play('blip')
    if (s === 'done') { impulse(9); burst(); banner = 'SAVE!'; doneT = 0; sfx.play('horn') }
    if (s === 'confused') { impulse(3); sfx.play('huh') }
    if (s === 'noting') impulse(-2)
    if (s === 'idle') { impulse(2); if (prev === 'loading' || prev === 'sleeping') sfx.play('pop') }
    if (s !== 'idle') { if (shot && shot.phase === 'windup') shot = null; twirl = null }
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
  setZoom(z) { camera.position.z = z }, zoomTo(z) { camera.position.z = z },
  ui(html) { let u = document.getElementById('ui'); if (!u) { u = document.createElement('div'); u.id = 'ui'; document.body.appendChild(u) } u.innerHTML = html || '' },
  setCaption(text) { let c = document.getElementById('cap'); if (!c) { c = document.createElement('div'); c.id = 'cap'; document.body.appendChild(c) } c.textContent = text || ''; c.style.opacity = text ? 1 : 0 },
  boop() { impulse(6); sfx.play('boop') },
  shoot,
  twirl: startTwirl,
  windup(dir) { shot = null; twirl = null; pass = { t: 0, dir: Math.sign(+dir) || 1, released: false }; return true },
  goal() { impulse(10); burst(); banner = 'GOAL!'; doneT = 0; sfx.play('goalhorn') },
  tricking,
  state: () => state,
}

// ---------- helpers ----------
const tmp = new THREE.Vector3()
function toScreen(v) { tmp.copy(v).project(camera); return { x: (tmp.x + 1) / 2 * W, y: (1 - tmp.y) / 2 * H } }
function bladeWorld() { armR.updateWorldMatrix(true, false); return armR.localToWorld(bladeLocal.clone()) }
const headTop = new THREE.Vector3()

// ---------- loop ----------
let last = performance.now(), t = 0
function frame(now) {
  requestAnimationFrame(frame)
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000)); last = now
  t += dt; stateT += dt; doneT += dt

  sp.level.t = level; step(sp.level, dt)
  for (const k of ['vx', 'vy', 'lookX', 'lookY', 'slide', 'slideY']) step(sp[k], dt)
  const vx = sp.vx.x, vy = sp.vy.x, lvl = sp.level.x
  const speed = Math.min(1, Math.hypot(vx, vy)), moving = speed > 0.06

  // blink and mouth
  blinkIn -= dt
  if (blinkIn <= 0) { blink = 1; blinkIn = Math.random() < 0.2 ? 0.25 : rand(2.2, 5.5) }
  blink = Math.max(0, blink - dt * 7)
  syllableIn -= dt
  if (talking && syllableIn <= 0) { sp.mouth.t = Math.random() < 0.15 ? 0.1 : rand(0.45, 1); syllableIn = rand(0.07, 0.16) }
  if (!talking) sp.mouth.t = 0
  const mo = Math.max(0, step(sp.mouth, dt))

  // trick timers
  nextShot -= dt
  if (nextShot <= 0) { nextShot = rand(...SHOT_EVERY); if (state === 'idle' && !talking) shoot() }
  nextTwirl -= dt
  if (nextTwirl <= 0) { nextTwirl = rand(...TWIRL_EVERY); if (state === 'idle' && !talking) startTwirl() }

  // ----- pose targets -----
  stride += dt * (moving ? 2 + speed * 2.4 : 0)
  const push = moving ? Math.sin(stride * Math.PI) : 0
  drift += dt * (state === 'idle' && !moving && !tricking() ? 0.4 : 0)
  const breathe = Math.sin(t * (state === 'sleeping' ? 1.3 : 2.3)) * (state === 'sleeping' ? 0.03 : 0.014)
  let turn = 0, lean = 0, pitch = 0, bob = 0, sx = 1 - breathe * 0.5, sy = 1 + breathe
  let hx = 0, hy = 0, hz = 0, aL = 0, aR = 0, lidShut = Math.sin(Math.min(1, blink) * Math.PI)

  if (moving) {                                   // skate toward travel in a 3/4 view, lean into the turn
    turn = Math.sign(vx) * Math.min(1, Math.abs(vx) * 1.6) * 1.0
    lean = -vx * 0.22 + push * 0.04 * speed
    pitch = 0.12 * speed
    sy -= 0.05 * speed; sx += 0.025 * speed
    bob += Math.abs(push) * 0.03 * speed
  } else if (state !== 'sleeping') {              // idle: turn a little toward the cursor, sway
    turn = sp.lookX.x * 0.45 + Math.sin(drift) * 0.18
  }
  hy = sp.lookX.x * 0.45; hx = -sp.lookY.x * 0.22
  switch (state) {
    case 'listening': sy += lvl * 0.1; sx -= lvl * 0.04; bob += lvl * 0.06; hx -= 0.1; break
    case 'thinking': hz = Math.sin(t * 2.6) * 0.12; hx = -0.18; aR = 0.25; break
    case 'done': lean += Math.sin(doneT * 12) * 0.08 * Math.max(0, 1 - doneT); aL = aR = 1.6 * Math.max(0, 1 - doneT / 1.2); if (stateT > 1.6) window.pet.setState('idle'); break
    case 'confused': hz = Math.sin(t * 3.5) * 0.25; lean += Math.sin(t * 3.5) * 0.06; if (stateT > 2.2) window.pet.setState('idle'); break
    case 'sleeping': pitch = 0.08; hx = 0.45; hz = 0.15; lidShut = 1; turn = 0.15; break
    case 'noting': hx = 0.15; break
  }
  if (talking) { hx += -mo * 0.06; bob += mo * 0.015 }

  // tricks
  let windup = 0, spin = 0
  if (shot) {
    shot.t += dt
    if (shot.phase === 'windup') {
      windup = Math.min(1, shot.t / 0.45)
      if (shot.t >= 0.45) { shot.phase = 'flight'; shot.t = 0; sfx.play('slap'); impulse(-4); shot.from = bladeWorld(); shot.to = { x: W * rand(0.3, 0.7), y: H * rand(0.25, 0.55) } }
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
    } else if (shot.phase === 'hit' && shot.t >= 1.6) shot = null
  }
  if (pass) {
    pass.t += dt
    windup = Math.min(1, pass.t / 0.45)
    if (!pass.released && pass.t >= 0.45) { pass.released = true; sfx.play('slap'); impulse(-4); pass.from = bladeWorld() }
    if (pass.t >= 1.0) pass = null
  }
  if (twirl) {
    twirl.t += dt
    const k = Math.min(1, twirl.t / 1.5)
    spin = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
    bob += Math.sin(k * Math.PI) * 0.22
    aL = -1.4 * Math.sin(k * Math.PI); aR = 1.4 * Math.sin(k * Math.PI)   // arms out like a figure skater
    sy += 0.05 * Math.sin(k * Math.PI)
    if (Math.random() < 0.9) {
      const a = Math.random() * Math.PI * 2
      emit(spray, new THREE.Vector3(root.position.x + Math.cos(a) * 0.3, 0.05, Math.sin(a) * 0.3), new THREE.Vector3(Math.cos(a) * rand(1.5, 2.6), rand(0.8, 1.8), Math.sin(a) * rand(1.5, 2.6)), 0.06, 0.8)
    }
    if (twirl.t >= 1.5) { twirl = null; spin = 0; impulse(4); sfx.play('swish') }
  }
  const aim = pass ? pass.dir * 1.15 : 0       // goal show: face the net
  if (pass || shot) turn = aim
  if ((shot && shot.phase === 'windup') || (pass && !pass.released)) { aR = windup * 1.5; pitch -= windup * 0.12; lean += windup * 0.05 }
  if ((shot && shot.phase === 'flight' && shot.t < 0.2) || (pass && pass.released && pass.t < 0.65)) { aR = -0.6; pitch += 0.15 }
  if (moving && !twirl) { legL.rotation.x = push * 0.35 * speed; legR.rotation.x = -push * 0.35 * speed } else { legL.rotation.x *= 0.85; legR.rotation.x *= 0.85 }
  shake = Math.max(0, shake - dt * 3)

  // ----- apply springs -----
  sp.turn.t = turn + spin * Math.PI * 4; sp.lean.t = lean; sp.pitch.t = pitch; sp.bob.t = bob
  sp.sx.t = sx; sp.sy.t = sy; sp.headX.t = hx; sp.headY.t = hy; sp.headZ.t = hz; sp.armL.t = aL; sp.armR.t = aR
  if (twirl) { sp.turn.x = sp.turn.t; sp.turn.v = 0 }       // the spin itself is already eased; don't lag it
  root.rotation.set(step(sp.pitch, dt), step(sp.turn, dt), step(sp.lean, dt), 'YXZ')
  if (!twirl && Math.abs(sp.turn.x) > Math.PI * 2) sp.turn.x %= Math.PI * 2   // forget whole spins after a twirl
  const B = step(sp.bob, dt)
  root.position.set(Math.sin(drift) * 0.12 * (state === 'idle' && !moving ? 1 : 0) + sp.slide.x * 1.5, Math.max(0, B), 0)
  const SX = step(sp.sx, dt), SY = step(sp.sy, dt)
  body.scale.set(SX, SY, SX)
  head.rotation.set(step(sp.headX, dt), step(sp.headY, dt), step(sp.headZ, dt))
  armL.rotation.z = -step(sp.armL, dt)
  armR.rotation.z = step(sp.armR, dt)
  mouth.scale.y = 0.05 + mo * 1.1
  mouth.visible = mo > 0.04
  lids.scale.y = Math.max(0.001, lidShut)
  lids.visible = lidShut > 0.02
  shadow.position.x = root.position.x
  const lift = Math.max(0, B)
  shadow.scale.set(1.25 * (1 - lift * 0.5), 0.8 * (1 - lift * 0.5), 1)
  shadow.material.opacity = 0.28 * (1 - Math.min(0.7, lift))

  // skating spray
  if (moving && Math.random() < speed * 1.4) {
    const back = -Math.sign(vx || 1)
    emit(spray, new THREE.Vector3(root.position.x + back * 0.25, 0.05, 0.1), new THREE.Vector3(back * rand(0.8, 2), rand(0.6, 1.4), rand(-0.4, 0.6)), 0.05, 0.7)
  }
  stepPool(spray, dt, 5)
  stepPool(confetti, dt, 5, -10)

  // puck
  puckMesh.visible = false
  if (shot && shot.phase === 'flight') {
    const k = Math.min(1, shot.t / 0.42), e = k * k
    const target = camera.position.clone().add(new THREE.Vector3((shot.to.x / W - 0.5) * 0.6, -(shot.to.y / H - 0.5) * 0.6, -0.6))
    puckMesh.position.lerpVectors(shot.from, target, e)
    puckMesh.position.y += Math.sin(k * Math.PI) * 0.4
    puckMesh.rotation.set(Math.PI / 2 * e, 0, t * 10)
    puckMesh.visible = true
  } else if (pass && pass.released && pass.t < 0.65) {
    const k = (pass.t - 0.45) / 0.2
    puckMesh.position.copy(pass.from).add(new THREE.Vector3(pass.dir * k * 4, 0.02, 0))
    puckMesh.rotation.set(0, 0, 0)
    puckMesh.visible = true
  } else if (state === 'thinking') {
    puckMesh.position.copy(bladeWorld()).add(new THREE.Vector3(0, 0.1 + Math.abs(Math.sin(t * 4)) * 0.5, 0))
    puckMesh.rotation.set(t * 3, 0, 0)
    puckMesh.visible = true
  }

  // ----- render 3D, then the 2D overlay -----
  camera.position.x = shake * rand(-0.06, 0.06)
  renderer.render(scene, camera)

  fctx.setTransform(1 / PIXEL, 0, 0, 1 / PIXEL, 0, 0)
  fctx.clearRect(0, 0, W, H)
  headTop.set(0, 3.25, 0); root.localToWorld(headTop)
  const hp = toScreen(headTop), feet = toScreen(new THREE.Vector3(root.position.x, 1.3, 0))
  const L = (...a) => label(fctx, ...a)
  if (state === 'listening') {
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.9 + i / 3) % 1
      fctx.globalAlpha = (1 - ph) * (0.3 + lvl * 0.6); fctx.strokeStyle = ACCENT; fctx.lineWidth = 3
      fctx.beginPath(); fctx.ellipse(feet.x, feet.y, 80 + ph * 40, 120 + ph * 40, 0, 0, Math.PI * 2); fctx.stroke()
    }
    fctx.globalAlpha = 1
  }
  if (state === 'thinking') for (let i = 0; i < 3; i++) {
    const up = Math.max(0, Math.sin(t * 6 - i * 0.7)) * 7
    fctx.fillStyle = '#ffffff'; fctx.beginPath(); fctx.arc(hp.x - 16 + i * 16, hp.y - 14 - up, 5.5, 0, Math.PI * 2); fctx.fill()
  }
  if (state === 'confused') L('?', hp.x + 48, hp.y + 4 + Math.sin(t * 5) * 3, 38, '#ffd34d', Math.min(1, stateT * 4), Math.sin(t * 4) * 0.2)
  if (state === 'sleeping') for (let i = 0; i < 3; i++) {
    const ph = (t * 0.45 + i / 3) % 1
    L('z', hp.x + 40 + ph * 26, hp.y + 10 - ph * 46, 14 + ph * 14, '#cfe3ff', (1 - ph) * Math.min(1, ph * 4))
  }
  if (state === 'noting') {
    fctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 4); fctx.fillStyle = '#ff3b4f'
    fctx.beginPath(); fctx.arc(hp.x + 70, hp.y + 14, 7, 0, Math.PI * 2); fctx.fill(); fctx.globalAlpha = 1
    L('REC', hp.x + 70, hp.y + 32, 12, '#ffffff')
  }
  if (state === 'loading') {
    fctx.strokeStyle = ACCENT; fctx.lineWidth = 4; fctx.lineCap = 'round'
    fctx.beginPath(); fctx.arc(hp.x, hp.y - 10, 12, t * 5, t * 5 + Math.PI * 1.3); fctx.stroke()
  }
  if (doneT < 1.4) {
    const pop = Math.min(1, doneT * 5)
    L(banner, W / 2, H * 0.1 - doneT * 10, 30 + 8 * Math.sin(Math.min(1, doneT * 3) * Math.PI), ACCENT, Math.min(1, (1.4 - doneT) * 3) * pop)
  }
  if (shot && shot.phase === 'hit') {
    const fade = Math.max(0, 1 - Math.max(0, shot.t - 0.9) / 0.7), { x, y } = shot.to
    fctx.save(); fctx.translate(x, y); fctx.lineCap = 'round'; fctx.lineJoin = 'round'
    for (const [col, lw, a] of [['#0d1630', 5, 0.6], ['#ffffff', 2.5, 1]]) {
      fctx.strokeStyle = col; fctx.lineWidth = lw; fctx.globalAlpha = fade * a
      for (const pts of cracks) {
        const grow = Math.min(1, shot.t * 8)
        fctx.beginPath(); fctx.moveTo(0, 0)
        for (let i = 1; i < pts.length * grow; i++) fctx.lineTo(pts[i][0], pts[i][1])
        fctx.stroke()
      }
      fctx.beginPath(); fctx.arc(0, 0, 18, 0, Math.PI * 2); fctx.stroke()
    }
    fctx.restore(); fctx.globalAlpha = 1
    const k = Math.min(1, shot.t / 0.6)       // the puck bounces off the glass and drops away
    if (k < 1) {
      const r = 70 * (1 - k * 0.8), px = x - k * 30, py = y + k * k * 220
      fctx.fillStyle = '#000'; fctx.beginPath(); fctx.ellipse(px, py + r * 0.15, r, r * (0.9 - k * 0.4), 0, 0, Math.PI * 2); fctx.fill()
      fctx.fillStyle = '#262a33'; fctx.beginPath(); fctx.ellipse(px, py, r, r * (0.9 - k * 0.4), 0, 0, Math.PI * 2); fctx.fill()
    }
  }
  fx.style.transform = shake ? `translate(${rand(-4, 4) * shake}px, ${rand(-4, 4) * shake}px)` : ''
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
if (params.get('glide')) setInterval(() => { const a = performance.now() / 2500; window.pet.setVelocity(Math.cos(a), Math.sin(a * 0.7) * 0.5) }, 33)
if (params.get('talk')) window.pet.setTalking(true)
if (params.get('shoot')) setTimeout(shoot, 300)
if (params.get('twirl')) setTimeout(startTwirl, 300)
if (params.get('goal')) { setTimeout(() => window.pet.windup(1), 300); setTimeout(() => window.pet.goal(), 1300) }
const forced = params.get('state')
if (forced) { window.pet.setState(forced); if (forced === 'listening') window.pet.setLevel(0.7) }
