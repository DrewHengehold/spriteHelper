# Working on this repo with Claude Code

This is HockeyTime (Henrik the goalie; a fork of Frog), a macOS menu-less desktop pet that does on-device dictation and meeting notes. Swift app in `Sources/HockeyTime/`. The pet is a swappable avatar in `web/src/avatars/<name>/`; `web/avatar.config.js` picks which one ships (currently `henrik3d`, a voxel 3D goalie in three.js; `henrik` is the same goalie as a 2D pixel sprite; `frog` is the original three.js frog). `web/src/main.js` only loads the chosen avatar. 2D image avatars use the shared engine in `web/src/sprite-pet.js`; sounds and springs shared by all sprite/voxel avatars live in `web/src/pet-kit.js`. See `web/src/avatars/README.md`.

## If someone asks for a different pet

Add a folder under `web/src/avatars/` (copy `henrik/` for an image sprite, `frog/` for three.js) and point `web/avatar.config.js` at it. Keep this contract, everything else is free:

- `window.pet.setState(name)` for `idle`, `listening`, `thinking`, `done`, `noting`, `confused`, `loading`, `sleeping`.
- `window.pet.setLevel(v)` with v in 0..1, the mic loudness while listening. The pet should visibly react to it.
- `window.pet.lookAt(x, y)` with x, y in -1..1, where the cursor is relative to the pet.
- Transparent canvas: `renderer.setClearColor(0, 0)` and `alpha: true`. The canvas is 260×300 CSS px (`W`, `H`), set in `index.html` and `PetPanel.size` in Swift. Change both if you change one.
- `?bg=1` paints a dark background for previews, `?demo=1` cycles states, `?state=name` forces one, `?avatar=name` picks an avatar, `?glide=1` fakes window motion.
- Optional: `pet.name` (also selects the brain persona in `Brain.swift` and the voice catchphrase), `pet.motion` (`'walk'` or `'glide'`, read by `Wander.swift`), `pet.setVelocity(x, y)`, `pet.setTalking(on)`.

After editing, run `cd web && npm run capture` and look at `web/shots/*.png` before claiming it looks right. Then `./build.sh` (or `ARCH=amd64 ./build.sh` for Intel) and `open build/HockeyTime.app`.

Design intent: cute, round, soft toon shading with a dark outline, squash-and-stretch on state changes, always something moving (breathing, blinking, gaze). No UI chrome around the pet.

## Swift side

- Build with `swift build -c release` or `./build.sh` (also builds the web bundle and assembles the .app). No Xcode project; SwiftPM only. Language mode 5.
- `AppDelegate.startListening/stopListening` is the dictation path. `MeetingRecorder` + `NoteProcessor` is the notes path. `Transcriber` is the engine protocol; add engines there.
- Every state change the pet shows goes through `panel.js("pet.setState('…')")`.
- Permissions: Microphone, Speech Recognition, Accessibility, and System Audio Recording (notes). Strings live in `Resources/Info.plist`.
- Debug flags in `main.swift` run without the UI. Use them to test engines with a WAV instead of talking.

## Rules

- Never commit `build/`, `.build/`, `web/dist*`, `web/shots/`, `web/node_modules/`.
- Don't rename the bundle id `ai.learnvector.voicepet`; macOS permissions are keyed on it.
- Don't delete existing avatars; add new ones beside them and switch `web/avatar.config.js`. An avatar's `name` should have a persona in `Brain.swift` (`web/tools/avatars.test.js` checks this).
- Feature branches and pull requests, not pushes to main.
