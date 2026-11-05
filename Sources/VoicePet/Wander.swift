import AppKit

/// Moves the pet's window around the screen. The avatar picks the style through `pet.motion` in JS:
/// - `.walk`: a heading that drifts, steers away from edges, and now and then rests (the frog).
/// - `.glide`: skating. Faster, with momentum: it accelerates, carves wide turns, coasts to a stop
///   instead of halting, and bounces off the screen edges like a puck off the boards.
@MainActor
final class Wander {
    enum Style: String { case walk, glide }

    private weak var panel: NSPanel?
    private var timer: Timer?
    private var heading: Double = .random(in: 0..<(2 * .pi))
    private var turnRate: Double = 0
    private var restUntil = Date().addingTimeInterval(3)
    private var cruiseUntil = Date().addingTimeInterval(3 + .random(in: 20...60))
    private var pausedUntil = Date.distantPast
    private var lastVel = (0.0, 0.0)
    private var vel = (0.0, 0.0)                 // current velocity in points per second (glide)
    private var pos: NSPoint?                    // sub-point position so slow coasting stays smooth
    var enabled = true { didSet { if !enabled { stop() } } }
    var style: Style = .walk { didSet { if style != oldValue { stop(); scheduleBreak(from: Date()) } } }
    var isBusy: () -> Bool = { false }
    var onVelocity: ((Double, Double) -> Void)?
    private let walkSpeed: CGFloat = 34          // points per second
    private let glideSpeed: Double = 120
    private let dt = 1.0 / 30.0

    init(panel: NSPanel) {
        self.panel = panel
        timer = Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
    }

    func pause(seconds: Double) {
        pausedUntil = Date().addingTimeInterval(seconds)
        stop()
    }

    private func stop() {
        vel = (0, 0)
        pos = nil
        emit(0, 0)
    }

    private func scheduleBreak(from now: Date) {
        switch style {
        case .walk:
            restUntil = now.addingTimeInterval(.random(in: 4...12))
            cruiseUntil = restUntil.addingTimeInterval(.random(in: 25...70))
        case .glide:
            restUntil = now.addingTimeInterval(.random(in: 2...6))
            cruiseUntil = restUntil.addingTimeInterval(.random(in: 12...30))
        }
        heading = .random(in: 0..<(2 * .pi))
    }

    private func emit(_ x: Double, _ y: Double) {
        guard abs(x - lastVel.0) > 0.01 || abs(y - lastVel.1) > 0.01 else { return }
        lastVel = (x, y)
        onVelocity?(x, y)
    }

    private func tick() {
        guard enabled, let panel, Date() > pausedUntil, !isBusy() else { stop(); return }
        switch style {
        case .walk: walkTick(panel)
        case .glide: glideTick(panel)
        }
    }

    /// Steer the heading: a little random turning, and back toward the middle near the edges.
    private func steer(_ panel: NSPanel, frame f: NSRect, origin cur: NSPoint, wobble: Double, edgeStart: Double, edgePull: Double) {
        let w = panel.frame.width, h = panel.frame.height
        turnRate += (Double.random(in: -1...1) * wobble - turnRate * 0.9) * dt
        heading += turnRate * dt
        let cx = f.midX - w / 2, cy = f.midY - h / 2
        let ex = Double((cur.x - cx) / max(1, f.width / 2 - w / 2)), ey = Double((cur.y - cy) / max(1, f.height / 2 - h / 2))   // -1..1
        let toCenter = atan2(-ey, -ex)
        let edge = max(abs(ex), abs(ey))
        if edge > edgeStart {
            var d = toCenter - heading
            while d > .pi { d -= 2 * .pi }
            while d < -.pi { d += 2 * .pi }
            heading += d * min(1, (edge - edgeStart) * edgePull)
        }
    }

    private func walkTick(_ panel: NSPanel) {
        let now = Date()
        if now < restUntil { emit(0, 0); return }
        if now > cruiseUntil { scheduleBreak(from: now); emit(0, 0); return }   // take a break, then cruise again
        guard let screen = panel.screen ?? NSScreen.main else { return }
        let f = screen.visibleFrame.insetBy(dx: 10, dy: 10)
        let w = panel.frame.width, h = panel.frame.height
        let cur = panel.frame.origin
        steer(panel, frame: f, origin: cur, wobble: 1.2, edgeStart: 0.7, edgePull: 0.25)
        let dx = cos(heading), dy = sin(heading) * 0.55        // more sideways than up and down
        let step = walkSpeed / 30.0
        var nx = cur.x + CGFloat(dx) * step, ny = cur.y + CGFloat(dy) * step
        nx = max(f.minX, min(nx, f.maxX - w)); ny = max(f.minY, min(ny, f.maxY - h))
        panel.setFrameOrigin(NSPoint(x: nx, y: ny))
        emit(dx, dy)
    }

    private func glideTick(_ panel: NSPanel) {
        let now = Date()
        guard let screen = panel.screen ?? NSScreen.main else { return }
        let f = screen.visibleFrame.insetBy(dx: 4, dy: 4)
        let w = panel.frame.width, h = panel.frame.height
        // the user may have dragged the window; resync if we're off by more than a point
        if let p = pos, abs(p.x - panel.frame.origin.x) > 1.5 || abs(p.y - panel.frame.origin.y) > 1.5 { pos = nil }
        let cur = pos ?? panel.frame.origin

        if now > cruiseUntil { scheduleBreak(from: now) }
        let resting = now < restUntil
        var target = (0.0, 0.0)
        if !resting {
            steer(panel, frame: f, origin: cur, wobble: 0.8, edgeStart: 0.8, edgePull: 0.15)
            target = (cos(heading) * glideSpeed, sin(heading) * glideSpeed * 0.7)
        }
        // momentum: push off quickly, coast down slowly on the ice
        let k = resting ? 0.9 : 1.6
        vel.0 += (target.0 - vel.0) * min(1, k * dt)
        vel.1 += (target.1 - vel.1) * min(1, k * dt)

        var nx = Double(cur.x) + vel.0 * dt, ny = Double(cur.y) + vel.1 * dt
        // bounce off the boards
        let minX = Double(f.minX), maxX = Double(f.maxX - w), minY = Double(f.minY), maxY = Double(f.maxY - h)
        if nx < minX { nx = minX; vel.0 = abs(vel.0) * 0.8; heading = atan2(vel.1, vel.0) }
        if nx > maxX { nx = maxX; vel.0 = -abs(vel.0) * 0.8; heading = atan2(vel.1, vel.0) }
        if ny < minY { ny = minY; vel.1 = abs(vel.1) * 0.8; heading = atan2(vel.1, vel.0) }
        if ny > maxY { ny = maxY; vel.1 = -abs(vel.1) * 0.8; heading = atan2(vel.1, vel.0) }

        let p = NSPoint(x: nx, y: ny)
        pos = p
        if abs(vel.0) + abs(vel.1) > 0.5 { panel.setFrameOrigin(NSPoint(x: p.x.rounded(), y: p.y.rounded())) }
        let vx = vel.0 / glideSpeed, vy = vel.1 / glideSpeed
        emit(abs(vx) < 0.02 ? 0 : vx, abs(vy) < 0.02 ? 0 : vy)
    }
}
