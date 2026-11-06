// HockeyTime for Windows: Henrik as a desktop pet. The same Henrik page the Mac app shows (web/dist), in a
// transparent, always-on-top window that glides around the screen, plus the goal show across the screen
// and a tray menu. Dictation, notes and the talking brain are Mac-only for now.
const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { Glide } = require('./glide.js')

const SIZE = 320                      // the pet page is 320x320 CSS px (web/index.html)
const GOAL_EVERY = [90, 150]          // seconds between goal shows, like the Mac app

let pet, overlay, tray
let dragging = null                   // { dx, dy } offset of the cursor inside the window while dragging
let goalRunning = false
const glide = new Glide({ onVelocity: (x, y) => js(`pet.setVelocity && pet.setVelocity(${x.toFixed(3)},${y.toFixed(3)})`) })

// ---------- preferences ----------
const prefsFile = () => path.join(app.getPath('userData'), 'prefs.json')
let prefs = { wander: true, sounds: true, x: null, y: null }
function loadPrefs() { try { prefs = { ...prefs, ...JSON.parse(fs.readFileSync(prefsFile(), 'utf8')) } } catch { /* first run */ } }
let saveTimer
function savePrefs() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { try { fs.writeFileSync(prefsFile(), JSON.stringify(prefs)) } catch { /* read-only disk */ } }, 500)
}

function js(code) {
  if (pet && !pet.isDestroyed()) pet.webContents.executeJavaScript(code).catch(() => {})
}
const rand = (a, b) => a + Math.random() * (b - a)

// ---------- the pet window ----------
function createPet() {
  const area = screen.getPrimaryDisplay().workArea
  const x = prefs.x ?? area.x + area.width - SIZE - 24
  const y = prefs.y ?? area.y + area.height - SIZE - 24
  pet = new BrowserWindow({
    x, y, width: SIZE, height: SIZE, useContentSize: true,
    frame: false, transparent: true, resizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, hasShadow: false, focusable: false, alwaysOnTop: true, show: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false, contextIsolation: true },
  })
  pet.setAlwaysOnTop(true, 'screen-saver')
  pet.setVisibleOnAllWorkspaces(true)
  pet.loadFile(path.join(__dirname, 'web', 'index.html'))
  pet.webContents.on('did-finish-load', () => {
    js(`pet.setSounds(${prefs.sounds}); pet.setState('idle')`)
    // left click: boop (every 2nd or 3rd click he shoots at you) and drag; right click: the menu
    js(`
      document.addEventListener('mousedown', e => {
        if (e.button === 0) { window.pet && pet.boop(); window.hockey.grab(e.screenX, e.screenY) }
        if (e.button === 2) window.hockey.menu()
      })
      document.addEventListener('mouseup', e => { if (e.button === 0) window.hockey.release() })
      document.addEventListener('contextmenu', e => e.preventDefault())
    `)
    pet.showInactive()
  })
  pet.on('moved', () => { const b = pet.getBounds(); prefs.x = b.x; prefs.y = b.y; savePrefs() })
}

ipcMain.on('grab', () => {
  const c = screen.getCursorScreenPoint(), b = pet.getBounds()
  dragging = { dx: c.x - b.x, dy: c.y - b.y }
  glide.pause(30)                       // he stays put for a while after you move him, like on the Mac
})
ipcMain.on('release', () => { dragging = null })
ipcMain.on('menu', () => trayMenu().popup({ window: pet }))

// ---------- 60 Hz: dragging, gliding, gaze ----------
let lastLook = ''
setInterval(() => {
  if (!pet || pet.isDestroyed() || !pet.isVisible()) return
  const b = pet.getBounds()
  const display = screen.getDisplayMatching(b)
  if (dragging) {
    const c = screen.getCursorScreenPoint()
    pet.setPosition(Math.round(c.x - dragging.dx), Math.round(c.y - dragging.dy))
    return
  }
  const next = glide.tick(b, display.workArea, { enabled: prefs.wander, busy: goalRunning })
  if (next) pet.setPosition(next.x, next.y)
  // eyes follow the cursor: offset from the pet's centre, -1..1, y up
  const c = screen.getCursorScreenPoint()
  const nx = Math.max(-1, Math.min(1, (c.x - (b.x + b.width / 2)) / 400))
  const ny = Math.max(-1, Math.min(1, -(c.y - (b.y + b.height / 2)) / 400))
  const look = `${nx.toFixed(2)},${ny.toFixed(2)}`
  if (look !== lastLook) { lastLook = look; js(`pet.lookAt(${look})`) }
}, 1000 / 60)

// ---------- the goal show ----------
// A net drops in on the far side of the screen; Henrik turns, winds up and slaps a puck across the screen
// into it; the goal light flashes and the horns blare. Same timeline as the Mac app's GoalShow.swift.
async function goalShow(force = false) {
  if (goalRunning || !pet || !pet.isVisible()) return
  if (!force) {
    const busy = await pet.webContents.executeJavaScript(`(pet.tricking && pet.tricking()) || pet.state() !== 'idle'`).catch(() => true)
    if (busy || dragging) return
  }
  goalRunning = true
  const b = pet.getBounds()
  const area = screen.getDisplayMatching(b).workArea
  const dir = b.x + b.width / 2 < area.x + area.width / 2 ? 1 : -1
  const netW = 132, netH = 96
  // everything below is in overlay coordinates with y UP (the overlay covers the work area)
  const up = sy => area.y + area.height - sy
  const petBottom = up(b.y + b.height)
  const net = {
    x: dir > 0 ? area.width - netW - 24 : 24,
    y: Math.min(Math.max(petBottom + 18, 8), area.height - netH - 40),
    w: netW, h: netH,
  }
  const from = { x: b.x - area.x + b.width / 2 + dir * b.width * 0.3, y: petBottom + b.height * 0.1 }
  const to = { x: net.x + net.w / 2 - dir * netW * 0.12, y: net.y + netH * 0.32 }
  const tWindup = 0.55, tRelease = 1.0
  const tArrive = tRelease + Math.min(0.9, Math.max(0.3, Math.hypot(to.x - from.x, to.y - from.y) / 2200))
  const tEnd = tArrive + 3.2

  overlay = new BrowserWindow({
    ...area, frame: false, transparent: true, resizable: false, movable: false, skipTaskbar: true,
    hasShadow: false, focusable: false, alwaysOnTop: true, show: false, backgroundColor: '#00000000',
    webPreferences: { contextIsolation: true },
  })
  overlay.setIgnoreMouseEvents(true)     // clicks go straight through to whatever is underneath
  overlay.setAlwaysOnTop(true, 'pop-up-menu')
  const q = new URLSearchParams({ dir, net: JSON.stringify(net), from: JSON.stringify(from), to: JSON.stringify(to), tRelease, tArrive, tEnd })
  await overlay.loadFile(path.join(__dirname, 'goal.html'), { search: q.toString() })
  overlay.showInactive()
  pet.moveTop()                          // Henrik stays in front of the net
  setTimeout(() => js(`pet.windup && pet.windup(${dir})`), tWindup * 1000)
  setTimeout(() => js(`pet.goal && pet.goal()`), tArrive * 1000)
  setTimeout(() => {
    if (overlay && !overlay.isDestroyed()) overlay.destroy()
    overlay = null
    goalRunning = false
  }, tEnd * 1000 + 100)
}

function scheduleGoal() {
  setTimeout(() => { goalShow().finally(scheduleGoal) }, rand(...GOAL_EVERY) * 1000)
}

// ---------- tray ----------
function trayMenu() {
  return Menu.buildFromTemplate([
    { label: pet && pet.isVisible() ? 'Hide Henrik' : 'Show Henrik', click: () => { if (pet.isVisible()) pet.hide(); else pet.showInactive() } },
    { type: 'separator' },
    { label: 'Tricks', submenu: [
      { label: 'Score a goal', click: () => goalShow(true) },
      { label: 'Skating twirl', click: () => js('pet.twirl && pet.twirl()') },
      { label: 'Shoot at the screen', click: () => js('pet.shoot && pet.shoot()') },
    ] },
    { type: 'separator' },
    { label: 'Wanders around', type: 'checkbox', checked: prefs.wander, click: i => { prefs.wander = i.checked; savePrefs() } },
    { label: 'Sounds', type: 'checkbox', checked: prefs.sounds, click: i => { prefs.sounds = i.checked; savePrefs(); js(`pet.setSounds(${prefs.sounds})`) } },
    { label: 'Start with Windows', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: i => app.setLoginItemSettings({ openAtLogin: i.checked }) },
    { type: 'separator' },
    { label: 'Quit HockeyTime', click: () => app.quit() },
  ])
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  tray.setToolTip('HockeyTime')
  tray.on('click', () => tray.popUpContextMenu(trayMenu()))
  tray.on('right-click', () => tray.popUpContextMenu(trayMenu()))
}

// ---------- smoke test (CI): HOCKEYTIME_SMOKE=<dir> plays the goal show, saves screenshots, quits ----------
function smokeTest(dir) {
  fs.mkdirSync(dir, { recursive: true })
  const shot = async (win, name) => { if (win && !win.isDestroyed()) fs.writeFileSync(path.join(dir, name), (await win.webContents.capturePage()).toPNG()) }
  const report = { errors: [] }
  pet.webContents.on('console-message', (_e, level, message) => { if (level >= 3) report.errors.push(message) })
  setTimeout(async () => {
    report.pet = await pet.webContents.executeJavaScript(`({ name: pet.name, motion: pet.motion, state: pet.state(), hockey: typeof window.hockey })`)
    await shot(pet, 'pet.png')
    goalShow(true)
    setTimeout(async () => { await shot(overlay, 'goal-flight.png') }, 1300)
    setTimeout(async () => {
      await shot(overlay, 'goal-scored.png'); await shot(pet, 'pet-goal.png')
      report.goalRunning = goalRunning
      fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2))
      app.exit(0)
    }, 2400)
  }, 2500)
}

// ---------- app ----------
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => { if (pet) pet.showInactive() })
  app.whenReady().then(() => {
    app.setAppUserModelId('ai.learnvector.hockeytime')
    loadPrefs()
    createPet()
    createTray()
    scheduleGoal()
    if (process.env.HOCKEYTIME_SMOKE) smokeTest(process.env.HOCKEYTIME_SMOKE)
    screen.on('display-removed', () => {   // keep him on a screen that still exists
      const b = pet.getBounds(), a = screen.getDisplayMatching(b).workArea
      pet.setPosition(Math.min(Math.max(b.x, a.x), a.x + a.width - SIZE), Math.min(Math.max(b.y, a.y), a.y + a.height - SIZE))
    })
  })
  app.on('window-all-closed', e => e.preventDefault())   // a tray app: keep running with no windows
}
