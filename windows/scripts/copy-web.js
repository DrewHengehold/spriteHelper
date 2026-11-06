// Copies the built Henrik page (web/dist, built by `npm run build` in ../web) into this app.
const fs = require('node:fs')
const path = require('node:path')
const src = path.resolve(__dirname, '../../web/dist')
const dst = path.resolve(__dirname, '../web')
if (!fs.existsSync(path.join(src, 'index.html'))) {
  console.error('web/dist/index.html is missing: run `npm ci && npm run build` in ../web first')
  process.exit(1)
}
fs.rmSync(dst, { recursive: true, force: true })
fs.cpSync(src, dst, { recursive: true })
console.log('copied', src, '->', dst)
