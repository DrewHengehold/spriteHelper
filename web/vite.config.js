import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Single self-contained index.html so WKWebView can load it from file:// with no CORS issues.
// AVATAR=<name> picks an avatar at build time, overriding avatar.config.js.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  define: { __AVATAR__: JSON.stringify(process.env.AVATAR || '') },
  build: { outDir: 'dist', emptyOutDir: true, minify: true, assetsInlineLimit: 30_000_000 },
  assetsInclude: ['**/*.glb'],
})
