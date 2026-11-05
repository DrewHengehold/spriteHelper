# Avatars

Each folder here is one avatar. `web/avatar.config.js` picks which one ships.

| Folder | What it is | Motion on screen |
|---|---|---|
| `henrik/` | Henrik, a 2D sprite hockey goalie (`henrik.svg`) on the generic sprite engine | `glide`: skates around with momentum and bounces off screen edges |
| `frog/` | The original three.js frog | `walk`: strolls, rests, strolls |

## Switch avatar

Pick one of these:

- Edit `web/avatar.config.js` → `avatar: 'frog'` and rebuild.
- Build with an override: `AVATAR=frog ./build.sh`.
- Preview in a browser: `npm run dev`, then open `http://localhost:5210/?avatar=frog&bg=1&demo=1`.

## Make your own from an image (no 3D needed)

1. `cp -R web/src/avatars/henrik web/src/avatars/goalie`
2. Drop your image in that folder (PNG, SVG or WebP with a transparent background; the character
   faces right and its feet touch the bottom edge). Change the `import image from './henrik.svg'`
   line to your file name. If your art faces left, set `facing: -1`.
3. Adjust `name`, `height`, `accent`, `doneText`, and `motion` (`'glide'` or `'walk'`) in `index.js`.
   Optional extras, all positions as fractions of your image (0..1 from the top-left):
   - `mouth: { x, y, w }` opens and closes while the pet talks.
   - `eyes: { pts: [{ x, y }, …], r, lid }` blinks (and closes when sleeping); `lid` is the skin colour.
   - `stick: { x, y }` is where pucks are shot from; `shotEvery: [min, max]` seconds between pucks at the screen.
   - `twirlEvery: [min, max]` seconds between skating twirls. The app's goal show (net across the screen) uses `pet.windup(dir)` and `pet.goal()`, which every sprite avatar gets for free.
   - `pixel: 2` renders chunky pixel art (bigger number = chunkier); `0` keeps smooth vector edges.
4. Set `avatar: 'goalie'` in `web/avatar.config.js`, then `./build.sh`.

Preview while you tweak: `?bg=1&glide=1` fakes the window moving so you can see the skating, `?talk=1` moves the mouth, `?shoot=1` fires a puck, `?twirl=1` spins, `?goal=1` plays the pet's half of the goal show, `?pixel=0` turns pixel art off,
`?demo=1` cycles every state, `?state=done` forces one.

## The contract

Any avatar, sprite or 3D, must install `window.pet` with `setState`, `setLevel`, `lookAt`, and should
provide `name`, `motion`, `setVelocity`, `setTalking`, `setSounds`, `boop`. See the root `CLAUDE.md`.
The sprite engine (`web/src/sprite-pet.js`) already does all of it.
