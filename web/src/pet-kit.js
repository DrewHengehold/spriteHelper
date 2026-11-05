// Shared by the sprite and voxel avatars: sound effects, damped springs, small helpers.

export const rand = (a, b) => a + Math.random() * (b - a)

/** Tiny synthesized sound kit (WebAudio): no audio files to ship. */
export function createSfx() {
  return {
    enabled: true, ac: null,
    ctx() { this.ac = this.ac || new (window.AudioContext || window.webkitAudioContext)(); return this.ac },
    tone({ from, to = from, dur = 0.12, vol = 0.18, type = 'sine', delay = 0 }) {
      if (!this.enabled) return
      try {
        const ac = this.ctx(), t0 = ac.currentTime + delay
        const osc = ac.createOscillator(), g = ac.createGain()
        osc.type = type
        osc.frequency.setValueAtTime(from, t0)
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur)
        g.gain.setValueAtTime(0.0001, t0)
        g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01)
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
        osc.connect(g).connect(ac.destination)
        osc.start(t0); osc.stop(t0 + dur + 0.02)
      } catch { /* no audio */ }
    },
    noise({ dur = 0.15, vol = 0.2, delay = 0, hp = 800 }) {
      if (!this.enabled) return
      try {
        const ac = this.ctx(), t0 = ac.currentTime + delay
        const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate)
        const d = buf.getChannelData(0)
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3)
        const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain()
        src.buffer = buf; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol
        src.connect(f).connect(g).connect(ac.destination)
        src.start(t0)
      } catch { /* no audio */ }
    },
    play(n) {
      switch (n) {
        case 'pop':  this.tone({ from: 420, to: 760, dur: 0.08 }); break
        case 'boop': this.tone({ from: 600, to: 800, dur: 0.07, vol: 0.2 }); this.tone({ from: 800, to: 420, dur: 0.1, vol: 0.16, delay: 0.07 }); break
        case 'huh':  this.tone({ from: 300, to: 420, dur: 0.12 }); this.tone({ from: 420, to: 260, dur: 0.16, delay: 0.13 }); break
        case 'ding': this.tone({ from: 1320, dur: 0.25, vol: 0.12 }); this.tone({ from: 1760, dur: 0.3, vol: 0.1, delay: 0.08 }); break
        case 'horn': this.tone({ from: 155, to: 150, dur: 0.9, vol: 0.12, type: 'sawtooth' }); this.tone({ from: 233, to: 228, dur: 0.9, vol: 0.08, type: 'sawtooth' }); break
        case 'swish': this.noise({ dur: 0.25, vol: 0.05, hp: 3000 }); break
        case 'blip': this.tone({ from: 880, dur: 0.06, vol: 0.08 }); break
        case 'slap': this.noise({ dur: 0.08, vol: 0.35, hp: 400 }); this.tone({ from: 180, to: 90, dur: 0.08, vol: 0.15, type: 'square' }); break
        case 'crack': this.noise({ dur: 0.35, vol: 0.3, hp: 1500 }); this.tone({ from: 2400, to: 900, dur: 0.12, vol: 0.05, type: 'triangle' }); break
        case 'goalhorn':   // arena goal horn: three blasts and a long one
          for (const [at, len] of [[0, 0.45], [0.6, 0.45], [1.2, 0.45], [1.8, 1.6]]) {
            this.tone({ from: 146, to: 144, dur: len, vol: 0.14, type: 'sawtooth', delay: at })
            this.tone({ from: 220, to: 218, dur: len, vol: 0.1, type: 'sawtooth', delay: at })
            this.tone({ from: 293, to: 291, dur: len, vol: 0.07, type: 'square', delay: at })
          }
          this.noise({ dur: 2.5, vol: 0.06, hp: 600, delay: 0.1 })   // the crowd
          break
        case 'twirl': this.noise({ dur: 0.6, vol: 0.07, hp: 2500 }); this.tone({ from: 500, to: 1400, dur: 0.9, vol: 0.05, type: 'triangle' }); break
      }
    },
  }
}

/** Damped spring toward `.t`; step() advances it. Everything that moves eases with one, so nothing snaps. */
export const spring = (x, k = 120, d = 2 * Math.sqrt(k)) => ({ x, v: 0, t: x, k, d })
export function step(s, dt) {
  // semi-implicit Euler in small substeps stays stable even when a frame is slow
  const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n
  for (let i = 0; i < n; i++) { s.v += (s.k * (s.t - s.x) - s.d * s.v) * h; s.x += s.v * h }
  return s.x
}

/** Outlined, chunky text (overlay labels like GOAL!, ?, z). */
export function label(ctx, txt, x, y, size, fill, alpha = 1, rot = 0) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.rotate(rot)
  ctx.font = `900 ${size}px -apple-system, "SF Pro Rounded", "Arial Rounded MT Bold", Arial, sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(3, size * 0.2); ctx.strokeStyle = '#0d1630'; ctx.strokeText(txt, 0, 0)
  ctx.fillStyle = fill; ctx.fillText(txt, 0, 0)
  ctx.restore()
}
