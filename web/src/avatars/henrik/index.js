// Henrik, a cartoon hockey goalie: one sprite image animated by the generic sprite engine.
// To make your own sprite avatar, copy this folder, replace henrik.svg with any image
// (PNG/SVG/WebP, transparent background, character facing right, feet at the bottom edge),
// tweak the options below, and set `avatar` in web/avatar.config.js to the folder name.
import { createSpritePet } from '../../sprite-pet.js'
import image from './henrik.svg'

createSpritePet({
  name: 'henrik',     // also picks the brain's persona (Sources/VoicePet/Brain.swift)
  image,
  facing: 1,          // the art faces right
  height: 0.74,       // fraction of the 320px canvas
  ground: 0.92,
  motion: 'glide',    // the Swift app skates the window around with momentum
  trail: true,        // ice spray + speed streaks
  accent: '#2a5bd7',
  doneText: 'SAVE!',
  doneSound: 'horn',
})
