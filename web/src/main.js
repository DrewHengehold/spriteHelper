// Loads the configured avatar. Every avatar lives in src/avatars/<name>/index.js and
// installs `window.pet` (see CLAUDE.md for the contract the Swift app relies on).
import config from '../avatar.config.js'

/* global __AVATAR__ */
const avatars = import.meta.glob('./avatars/*/index.js')
const pick = new URLSearchParams(location.search).get('avatar') || __AVATAR__ || config.avatar || 'frog'
const key = `./avatars/${pick}/index.js`

if (!avatars[key]) {
  const known = Object.keys(avatars).map(k => k.split('/')[2]).join(', ')
  console.error(`Unknown avatar "${pick}". Available: ${known}. Falling back to frog.`)
}
;(avatars[key] || avatars['./avatars/frog/index.js'])()
