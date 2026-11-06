// Henrik's 3D models. Two builders share one rig (root > body > legs, torso, arms, head with mouth and
// eyelids), so every look animates the same way:
//   buildVoxel  - the cube model; `round: true` softens every cube into a rounded block
//   buildChibi  - an organic version made of spheres, capsules and rounded shapes
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

function makeBox(w, h, d, round) {
  if (!round) return new THREE.BoxGeometry(w, h, d)
  const g = new RoundedBoxGeometry(w, h, d, 3, Math.min(w, h, d) * 0.45)
  g.deleteAttribute('uv')
  return g
}

const V = 0.08   // world units per voxel (voxel model)
export const C = {
  skin: '#f1c7a3', skinDark: '#e2a985', beard: '#6e5a4c', stache: '#4e3e33', hair: '#4a3528', grey: '#a39589',
  eye: '#17203a', white: '#ffffff', blue: '#2a5bd7', red: '#d62a3a', pad: '#f4f6fb', boot: '#20263a',
  steel: '#c9d3df', stick: '#2b2f3a', tape: '#ffffff', mouth: '#4a1820', brow: '#3e2c22',
}
function voxelPart(boxes, pivot, o) {
  const geos = [], shells = []
  for (const [x0, y0, z0, x1, y1, z1, color, outline = true] of boxes) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0
    const cx = (x0 + x1) / 2 - pivot[0], cy = (y0 + y1) / 2 - pivot[1], cz = (z0 + z1) / 2 - pivot[2]
    const g = makeBox(w * V, h * V, d * V, o.round).toNonIndexed()
    g.translate(cx * V, cy * V, cz * V)
    const col = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
    g.deleteAttribute('uv')
    geos.push(g)
    if (outline) {
      const e = 0.32
      const s = makeBox((w + e * 2) * V, (h + e * 2) * V, (d + e * 2) * V, o.round).toNonIndexed()
      s.translate(cx * V, cy * V, cz * V)
      s.deleteAttribute('uv'); s.deleteAttribute('normal')
      shells.push(s)
    }
  }
  const group = new THREE.Group()
  group.position.set(pivot[0] * V, pivot[1] * V, pivot[2] * V)
  group.add(new THREE.Mesh(mergeGeometries(geos), o.vertexMat))
  if (shells.length && o.outline) group.add(new THREE.Mesh(mergeGeometries(shells), o.inkMat))
  return group
}
const mirror = boxes => boxes.map(([x0, y0, z0, x1, y1, z1, ...r]) => [-x1, y0, z0, -x0, y1, z1, ...r])

/** opts: { round, outline, vertexMat, inkMat } */
export function buildVoxel(body, opts) {
  const P = (boxes, pivot = [0, 0, 0]) => voxelPart(boxes, pivot, opts)

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
    const g = P(side < 0 ? pad : mirror(pad), [side * 3.5, 15, 0])
    body.add(g)
    return g
  }
  const legL = leg(-1), legR = leg(1)

  const torso = P([
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
  const armL = P([
    ...sleeve(-10.2),
    [-12.5, 12.5, -2, -6.5, 18.5, 3.5, C.pad],                                          // catch glove
    [-11.5, 14, 3.5, -7.5, 17, 3.8, C.blue, false],
    [-12.6, 16.5, -1, -12.3, 18.4, 2.5, '#c7cfdd', false],
  ], [-7, 25.5, 0])
  const armR = P([
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
  const head = P([
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
  const mouth = P([[-1.6, 28.2, 4.62, 1.6, 30.2, 4.95, C.mouth, false], [-1.2, 29.6, 4.96, 1.2, 30.2, 5.0, C.white, false]], [0, 30.2, 4.8])
  mouth.position.sub(head.position)
  head.add(mouth)
  // eyelids: skin-coloured shutters that drop over the eyes
  const lids = P([[-3.2, 32.8, 4.31, -1.4, 35.3, 4.5, C.skin, false], [1.4, 32.8, 4.31, 3.2, 35.3, 4.5, C.skin, false]], [0, 35.3, 4.4])
  lids.position.sub(head.position)
  head.add(lids)

  return { legL, legR, torso, armL, armR, head, mouth, lids, bladeLocal }
}

/** The organic Henrik: big round head, soft body, rounded pads. opts: { makeMat(color, side), inkMat, outline } */
export function buildChibi(body, opts) {
  const cache = new Map()
  const M = (color, side = THREE.FrontSide) => {
    const k = color + side
    if (!cache.has(k)) cache.set(k, opts.makeMat(color, side))
    return cache.get(k)
  }
  const sphere = (r, ...rest) => new THREE.SphereGeometry(r, 32, 24, ...rest)
  const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 8, 20)
  const rbox = (w, h, d, rad) => new RoundedBoxGeometry(w, h, d, 4, rad ?? Math.min(w, h, d) * 0.3)
  const cyl = (r, h, ...rest) => new THREE.CylinderGeometry(r, r, h, 40, 1, true, ...rest)

  // a shape with an even dark outline: a back-face shell grown by a fixed amount, whatever its size
  function shape(geo, color, { pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0], outline = true, side, mat } = {}) {
    const g = new THREE.Group()
    g.position.set(...pos); g.rotation.set(...rot); g.scale.set(...scale)
    g.add(new THREE.Mesh(geo, mat || M(color, side)))
    if (outline && opts.outline) {
      geo.computeBoundingSphere()
      const r = geo.boundingSphere.radius * Math.min(...scale)
      const o = new THREE.Mesh(geo, opts.inkMat)
      o.scale.setScalar(1 + 0.028 / Math.max(0.03, r))
      g.add(o)
    }
    return g
  }
  const group = (pos = [0, 0, 0], ...kids) => { const g = new THREE.Group(); g.position.set(...pos); g.add(...kids); return g }

  // the jersey number, printed on a curved patch so it hugs the body
  function numberPatch(thetaStart) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 96
    const x = c.getContext('2d')
    x.font = '900 76px "Arial Rounded MT Bold", "Arial Black", Arial, sans-serif'
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round'
    x.lineWidth = 12; x.strokeStyle = C.red; x.strokeText('30', 64, 52)
    x.fillStyle = C.white; x.fillText('30', 64, 52)
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace
    return shape(cyl(0.528, 0.36, thetaStart, 0.95), C.white, { pos: [0, 1.55, 0], scale: [1.2, 1, 0.9], outline: false,
      mat: new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }) })
  }

  // legs: rounded pads with chevrons, pivot at the hip
  function leg(side) {
    const vBar = (x, y, r) => shape(rbox(0.2, 0.055, 0.03, 0.02), C.blue, { pos: [x, y, 0.185], rot: [0, 0, r], outline: false })
    const g = group([side * 0.27, 1.12, 0],
      shape(rbox(0.44, 0.98, 0.36, 0.13), C.pad, { pos: [0, -0.52, 0] }),
      vBar(-0.065, -0.36, -0.7), vBar(0.065, -0.36, 0.7),
      vBar(-0.065, -0.6, -0.7), vBar(0.065, -0.6, 0.7),
      shape(rbox(0.43, 0.06, 0.03, 0.02), C.red, { pos: [0, -0.86, 0.18], outline: false }),
      shape(rbox(0.4, 0.14, 0.52, 0.06), C.boot, { pos: [0, -1.03, 0.04] }),
      shape(rbox(0.05, 0.06, 0.6, 0.02), C.steel, { pos: [0, -1.09, 0.04], outline: false }),
    )
    body.add(g)
    return g
  }
  const legL = leg(-1), legR = leg(1)

  const band = (y, h, r, color) => shape(cyl(r, h), color, { pos: [0, y, 0], scale: [1.2, 1, 0.9], outline: false })
  const torso = group([0, 0, 0],
    shape(sphere(0.5), C.red, { pos: [0, 1.15, 0], scale: [1.15, 0.55, 0.85] }),               // pants
    shape(capsule(0.52, 0.42), C.blue, { pos: [0, 1.72, 0], scale: [1.2, 1, 0.9] }),            // jersey
    band(1.22, 0.17, 0.523, C.white), band(1.22, 0.06, 0.528, C.red),                           // hem
    band(1.86, 0.13, 0.523, C.white), band(1.86, 0.05, 0.528, C.red),                           // chest stripe
    numberPatch(-0.475), numberPatch(Math.PI - 0.475),                                          // 30, front and back
    shape(new THREE.TorusGeometry(0.2, 0.05, 12, 32), C.red, { pos: [0, 2.37, 0.03], rot: [Math.PI / 2, 0, 0] }),   // collar
  )
  body.add(torso)

  // arms pivot at the shoulders; sleeves angle out a little
  function arm(side) {
    const sleeve = new THREE.Group()
    sleeve.position.set(side * 0.05, 0, 0); sleeve.rotation.z = side * 0.25
    sleeve.add(
      shape(capsule(0.17, 0.4), C.blue, { pos: [0, -0.3, 0] }),
      shape(cyl(0.178, 0.09), C.white, { pos: [0, -0.46, 0], outline: false }),
      shape(cyl(0.182, 0.035), C.red, { pos: [0, -0.46, 0], outline: false }),
    )
    const g = group([side * 0.6, 2.05, 0], sleeve)
    body.add(g)
    return g
  }
  const armL = arm(-1), armR = arm(1)
  armL.add(                                                                                       // catch glove
    shape(sphere(0.26), C.pad, { pos: [-0.2, -0.75, 0.1], scale: [1.1, 1, 0.75] }),
    shape(sphere(0.15), C.blue, { pos: [-0.2, -0.75, 0.29], scale: [1, 1, 0.25], outline: false }),
  )
  armR.add(                                                                                       // blocker and stick
    shape(rbox(0.42, 0.5, 0.12, 0.05), C.pad, { pos: [0.2, -0.78, 0.17] }),
    shape(rbox(0.36, 0.05, 0.02, 0.01), C.blue, { pos: [0.2, -0.66, 0.235], outline: false }),
    shape(rbox(0.36, 0.05, 0.02, 0.01), C.blue, { pos: [0.2, -0.9, 0.235], outline: false }),
    shape(rbox(0.07, 1.1, 0.07, 0.025), C.stick, { pos: [0.34, -1.3, 0.32] }),
    shape(rbox(0.16, 0.62, 0.075, 0.03), C.stick, { pos: [0.34, -1.66, 0.32] }),
    shape(rbox(0.6, 0.1, 0.09, 0.035), C.stick, { pos: [0.58, -1.99, 0.33] }),
    shape(rbox(0.075, 0.05, 0.075, 0.015), C.tape, { pos: [0.34, -0.92, 0.32], outline: false }),
  )
  const bladeLocal = new THREE.Vector3(0.64, -1.99, 0.33)

  // head pivots at the neck
  const head = new THREE.Group(); head.position.set(0, 2.32, 0)
  const hairTilt = [-0.28, 0, 0]
  head.add(
    shape(sphere(0.62), C.skin, { pos: [0, 0.48, 0] }),
    shape(sphere(0.6), C.beard, { pos: [0, 0.22, 0.08], scale: [1.03, 0.6, 0.95] }),             // beard
    shape(capsule(0.055, 0.22), C.stache, { pos: [0, 0.45, 0.6], rot: [0, 0, Math.PI / 2], outline: false }),
    shape(sphere(0.09), C.skinDark, { pos: [0, 0.58, 0.6], scale: [0.9, 1.1, 1], outline: false }),   // nose
    ...[-1, 1].flatMap(s => [
      shape(sphere(0.085), C.eye, { pos: [s * 0.2, 0.71, 0.545], scale: [0.85, 1.25, 0.6], outline: false }),
      shape(sphere(0.028), C.white, { pos: [s * 0.2 + 0.025, 0.75, 0.59], outline: false }),
      shape(capsule(0.024, 0.12), C.brow, { pos: [s * 0.2, 0.865, 0.54], rot: [0, 0, Math.PI / 2 + s * 0.12], outline: false }),
      shape(sphere(0.1), C.skinDark, { pos: [s * 0.61, 0.5, 0], scale: [0.5, 1, 0.8] }),            // ears
      shape(sphere(0.1), C.grey, { pos: [s * 0.6, 0.66, -0.05], scale: [0.3, 1, 1.1], outline: false }),   // grey temples
    ]),
    shape(sphere(0.665, 0, Math.PI * 2, 0, 1.2), C.hair, { pos: [0, 0.5, -0.03], rot: hairTilt, side: THREE.DoubleSide }),   // hair: top
    shape(sphere(0.66, Math.PI, Math.PI, 0.5, 1.6), C.hair, { pos: [0, 0.48, -0.02], side: THREE.DoubleSide }),          //       back, to the collar
    shape(capsule(0.12, 0.7), C.hair, { pos: [0, 1.02, 0.28], rot: [0, 0, Math.PI / 2] }),       // swept-back front
  )
  body.add(head)
  const mouth = new THREE.Group(); mouth.position.set(0, 0.39, 0.6)
  mouth.add(
    shape(sphere(0.1), C.mouth, { pos: [0, -0.07, -0.02], scale: [1.3, 1, 0.45], outline: false }),
    shape(rbox(0.16, 0.035, 0.03, 0.01), C.white, { pos: [0, -0.005, 0.02], outline: false }),
  )
  head.add(mouth)
  const lids = new THREE.Group(); lids.position.set(0, 0.82, 0.555)
  for (const s of [-1, 1]) lids.add(shape(sphere(0.095), C.skin, { pos: [s * 0.2, -0.1, 0.0], scale: [0.95, 1.3, 0.7], outline: false }))
  head.add(lids)

  return { legL, legR, torso, armL, armR, head, mouth, lids, bladeLocal }
}
