// Which avatar the app shows. This is the one line to change to swap the pet.
//
// The value is the name of a folder in src/avatars/:
//   'henrik'   – Henrik as a 2D pixel-art sprite (the default)
//   'henrik3d' – Henrik in 3D (three.js); pick a style with LOOK in src/avatars/henrik3d/index.js:
//                voxel, soft, chibi, chibi-pixel or clay
//   'frog'   – the original three.js frog that strolls around
//
// You can also override it without editing this file:
//   AVATAR=frog ./build.sh            (build time)
//   index.html?avatar=frog            (browser preview / npm run dev)
//
// To add your own, copy src/avatars/henrik/ to src/avatars/<name>/, swap in your
// image (PNG, SVG, WebP…) and set `avatar` below to '<name>'. See src/avatars/README.md.
export default {
  avatar: 'henrik',
}
