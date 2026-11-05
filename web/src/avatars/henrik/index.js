// Henrik, a cartoon hockey goalie: one sprite image animated by the generic sprite engine.
// To make your own sprite avatar, copy this folder, replace henrik.svg with any image
// (PNG/SVG/WebP, transparent background, character facing right, feet at the bottom edge),
// tweak the options below, and set `avatar` in web/avatar.config.js to the folder name.
import { createSpritePet } from '../../sprite-pet.js'
import image from './henrik.svg'

createSpritePet({
  name: 'henrik',     // also picks the brain's persona (Sources/HockeyTime/Brain.swift)
  image,
  facing: 1,          // the art faces right
  height: 0.74,       // fraction of the 320px canvas
  ground: 0.92,
  motion: 'glide',    // the Swift app skates the window around with momentum
  trail: true,        // ice spray + speed streaks
  pixel: 2,           // chunky pixel-art rendering; 0 for smooth vector
  accent: '#1f5fbf',
  // where things are on henrik.svg (fractions of the 240x260 image)
  mouth: { x: 0.504, y: 0.232, w: 0.075 },
  eyes: { pts: [{ x: 0.4625, y: 0.123 }, { x: 0.5625, y: 0.123 }], r: 0.022, lid: '#f1c7a3' },
  stick: { x: 0.86, y: 0.95 },  // blade: he shoots pucks at the screen from here
  shotEvery: [360, 720],        // pucks at the screen: every 6-12 minutes while idle
  twirlEvery: [120, 240],       // skating twirl: every 2-4 minutes while idle
  doneText: 'SAVE!',
  doneSound: 'horn',
})
