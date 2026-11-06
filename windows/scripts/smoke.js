// Launches the app with HOCKEYTIME_SMOKE set: it plays the goal show, saves screenshots and a report, and
// quits. Fails if the pet page didn't load or logged errors. Usage: node scripts/smoke.js [outDir]
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const electron = require('electron')   // the binary's path when required from Node

const out = path.resolve(process.argv[2] || 'smoke')
fs.rmSync(out, { recursive: true, force: true })
const args = ['.', '--disable-gpu', ...(process.platform === 'linux' ? ['--no-sandbox'] : [])]
const child = spawn(electron, args, { cwd: path.resolve(__dirname, '..'), env: { ...process.env, HOCKEYTIME_SMOKE: out }, stdio: 'inherit' })
const timer = setTimeout(() => { console.error('smoke test timed out'); child.kill() }, 90_000)
child.on('exit', () => {
  clearTimeout(timer)
  const fail = msg => { console.error('SMOKE FAILED:', msg); process.exit(1) }
  const reportFile = path.join(out, 'report.json')
  if (!fs.existsSync(reportFile)) fail('no report written')
  const r = JSON.parse(fs.readFileSync(reportFile, 'utf8'))
  console.log(JSON.stringify(r, null, 2))
  if (r.errors.length) fail('page errors: ' + r.errors.join(' | '))
  if (r.pet?.name !== 'henrik' || r.pet?.motion !== 'glide') fail('Henrik did not load')
  if (r.pet?.hockey !== 'object') fail('click/drag bridge missing')
  if (!r.goalRunning) fail('goal show did not start')
  for (const f of ['pet.png', 'goal-flight.png', 'goal-scored.png', 'pet-goal.png'])
    if (!fs.existsSync(path.join(out, f))) fail('missing screenshot ' + f)
  console.log('smoke test passed')
})
