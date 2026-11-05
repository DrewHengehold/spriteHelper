import AppKit

/// The goal show: a hockey net drops in on the far side of the screen, the pet turns and slaps a puck,
/// the puck flies across the screen into the net, the goal light flashes and the horns blare.
///
/// The net and puck live in a transparent, click-through overlay window the size of the screen, drawn as
/// pixel art to match the sprite. The pet's own half (wind-up, slap, GOAL!, horns) runs in its web view
/// via `pet.windup(dir)` and `pet.goal()`.
@MainActor
final class GoalShow {
    private weak var panel: NSPanel?
    private let js: (String) -> Void
    private var overlay: NSPanel?
    private var view: GoalView?
    private var timer: Timer?
    private var start = Date()
    private(set) var isRunning = false

    // timeline (seconds)
    private let tWindup = 0.55        // net has dropped in; pet starts the wind-up
    private let tRelease = 1.0        // pet's slap (pet.windup releases 0.45 s after it starts)
    private var tArrive = 1.6         // set from the flight distance
    private var tEnd = 5.0

    init(panel: NSPanel, js: @escaping (String) -> Void) {
        self.panel = panel
        self.js = js
    }

    func play() {
        guard !isRunning, let panel, panel.isVisible, let screen = panel.screen ?? NSScreen.main else { return }
        isRunning = true
        let f = screen.visibleFrame
        let pet = panel.frame
        let dir: CGFloat = pet.midX < f.midX ? 1 : -1         // the net goes on the far side
        let netW: CGFloat = 132, netH: CGFloat = 96
        let netX = dir > 0 ? f.maxX - netW - 24 : f.minX + 24
        let netY = min(max(pet.minY + 18, f.minY + 8), f.maxY - netH - 40)

        // everything in overlay-local coordinates (the overlay covers the visible frame)
        let v = GoalView(frame: NSRect(origin: .zero, size: f.size))
        v.dir = dir
        v.net = NSRect(x: netX - f.minX, y: netY - f.minY, width: netW, height: netH)
        // the stick blade, roughly where the sprite draws it (bottom of the 320 pt pet window)
        v.from = NSPoint(x: pet.midX + dir * pet.width * 0.3 - f.minX, y: pet.minY + pet.height * 0.1 - f.minY)
        // into the mouth of the net, which faces the pet
        v.to = NSPoint(x: v.net.midX - dir * netW * 0.12, y: v.net.minY + netH * 0.32)
        let dist = hypot(v.to.x - v.from.x, v.to.y - v.from.y)
        tArrive = tRelease + min(0.9, max(0.3, Double(dist) / 2200))
        tEnd = tArrive + 3.2

        let w = NSPanel(contentRect: f, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        w.isOpaque = false
        w.backgroundColor = .clear
        w.hasShadow = false
        w.ignoresMouseEvents = true                         // never gets in the way of clicks
        w.level = .floating
        w.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        w.isReleasedWhenClosed = false
        w.animationBehavior = .none
        w.contentView = v
        w.order(.below, relativeTo: panel.windowNumber)     // the pet stays in front
        overlay = w
        view = v
        start = Date()

        let t = Timer(timeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    private func tick() {
        guard let v = view else { return finish() }
        let t = Date().timeIntervalSince(start)
        v.t = t
        v.netIn = min(1, t / 0.4)
        if t >= tWindup, !v.windupSent {
            v.windupSent = true
            js("pet.windup && pet.windup(\(v.dir > 0 ? 1 : -1))")
        }
        if t >= tRelease && t < tArrive {
            v.puckK = (t - tRelease) / (tArrive - tRelease)
        } else if t >= tArrive {
            if !v.scored {
                v.scored = true
                js("pet.goal && pet.goal()")
            }
            v.puckK = 1
            v.since = t - tArrive
        }
        v.fade = t > tEnd - 0.5 ? max(0, (tEnd - t) / 0.5) : 1
        v.needsDisplay = true
        if t >= tEnd { finish() }
    }

    private func finish() {
        timer?.invalidate(); timer = nil
        overlay?.orderOut(nil); overlay?.close()
        overlay = nil; view = nil
        isRunning = false
    }
}

/// Draws the net and the puck as chunky pixel art.
final class GoalView: NSView {
    var dir: CGFloat = 1
    var net = NSRect.zero
    var from = NSPoint.zero
    var to = NSPoint.zero
    var t: Double = 0
    var netIn: Double = 0
    var puckK: Double = -1          // <0 not launched, 0..1 in flight, 1 in the net
    var since: Double = 0           // seconds since the goal
    var scored = false
    var windupSent = false
    var fade: Double = 1

    private let px: CGFloat = 4     // one "pixel"
    override var isFlipped: Bool { false }

    private func snap(_ v: CGFloat) -> CGFloat { (v / px).rounded() * px }
    private func block(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ c: NSColor) {
        c.setFill()
        NSRect(x: snap(x), y: snap(y), width: max(px, snap(w)), height: max(px, snap(h))).fill()
    }

    override func draw(_ dirtyRect: NSRect) {
        guard let g = NSGraphicsContext.current?.cgContext else { return }
        g.setShouldAntialias(false)
        g.setAlpha(CGFloat(fade))
        NSColor.clear.set(); dirtyRect.fill()

        // net drops in from above with a little bounce, and shakes when the puck hits
        let e = netIn < 1 ? 1 - pow(1 - netIn, 3) : 1
        var n = net.offsetBy(dx: 0, dy: CGFloat(1 - e) * 160)
        if scored && since < 0.5 { n = n.offsetBy(dx: CGFloat(sin(since * 60)) * CGFloat(6 * (1 - since / 0.5)), dy: 0) }

        let ink = NSColor(red: 0.05, green: 0.09, blue: 0.19, alpha: 1)
        let red = NSColor(red: 0.84, green: 0.16, blue: 0.23, alpha: 1)
        let mesh = NSColor(white: 1, alpha: 0.85)
        let shade = NSColor(red: 0.75, green: 0.82, blue: 0.93, alpha: 0.55)
        let mouthX = dir > 0 ? n.minX : n.maxX                 // posts on the side facing the pet
        let backX = dir > 0 ? n.maxX : n.minX
        let depth = n.width * 0.55

        // ice shadow
        block(n.minX - 8, n.minY - 6, n.width + 16, 8, NSColor(white: 0, alpha: 0.18))
        // back of the net: shaded body with a mesh grid
        let bodyX = min(mouthX, mouthX + dir * depth), bodyW = abs(depth)
        block(bodyX, n.minY, bodyW, n.height * 0.8, shade)
        var gx = bodyX
        while gx <= bodyX + bodyW { block(gx, n.minY, px, n.height * 0.8, mesh); gx += 12 }
        var gy = n.minY
        while gy <= n.minY + n.height * 0.8 { block(bodyX, gy, bodyW, px, mesh); gy += 12 }
        // the sloping back frame down to the ice
        let steps = 10
        for i in 0...steps {
            let k = CGFloat(i) / CGFloat(steps)
            let topBack = mouthX + dir * depth
            block(topBack + k * (backX - topBack) - px, n.minY + n.height * 0.8 * (1 - k), px * 2, px * 2, red)
        }
        // red posts and crossbar with a dark outline
        block(mouthX - px * 2, n.minY, px * 4, n.height, ink)
        block(mouthX - px, n.minY, px * 2, n.height - px, red)
        block(bodyX - px, n.minY + n.height * 0.8 - px, bodyW + px * 2, px * 3, ink)
        block(bodyX, n.minY + n.height * 0.8, bodyW, px, red)
        block(bodyX, n.minY - px, bodyW, px * 2, red)

        // goal light: flashes red after the goal
        let lightOn = scored && Int(since * 6) % 2 == 0
        let lx = mouthX + dir * depth * 0.5 - 10
        block(lx - px, n.minY + n.height * 0.8 + px * 3, 28, 20, ink)
        block(lx, n.minY + n.height * 0.8 + px * 4, 20, 12, lightOn ? NSColor(red: 1, green: 0.25, blue: 0.2, alpha: 1) : NSColor(red: 0.35, green: 0.1, blue: 0.1, alpha: 1))
        if lightOn {
            block(lx - 16, n.minY + n.height * 0.8 + px * 5, 8, 4, NSColor(red: 1, green: 0.4, blue: 0.3, alpha: 0.7))
            block(lx + 28, n.minY + n.height * 0.8 + px * 5, 8, 4, NSColor(red: 1, green: 0.4, blue: 0.3, alpha: 0.7))
        }

        // the puck: a flat arc across the screen with a streak behind it
        if puckK >= 0 {
            let k = CGFloat(min(1, puckK))
            let x = from.x + (to.x - from.x) * k
            let y = from.y + (to.y - from.y) * k + sin(k * .pi) * 40
            if puckK < 1 {
                for i in 1...6 {
                    let tk = max(0, k - CGFloat(i) * 0.03)
                    let tx = from.x + (to.x - from.x) * tk, ty = from.y + (to.y - from.y) * tk + sin(tk * .pi) * 40
                    block(tx - 4, ty - 2, 8, 4, NSColor(white: 1, alpha: 0.5 - CGFloat(i) * 0.07))
                }
            }
            let px2 = scored ? CGFloat(dir) * CGFloat(min(since, 0.3)) * 30 : 0      // settles into the back of the net
            block(x - 12 + px2, y - 6, 24, 12, ink)
            block(x - 10 + px2, y - 4, 20, 8, NSColor(red: 0.15, green: 0.16, blue: 0.2, alpha: 1))
            block(x - 6 + px2, y, 8, 4, NSColor(red: 0.3, green: 0.32, blue: 0.38, alpha: 1))
        }
    }
}
