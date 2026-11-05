import AVFoundation
import Foundation

/// The pet talks back with one of macOS's built-in novelty voices.
@MainActor
final class PetVoice: NSObject, AVSpeechSynthesizerDelegate {
    static let voices = ["Grandpa", "Rocko", "Grandma", "Bad News", "Jester", "Boing", "Bubbles", "Zarvox", "Trinoids"]
    private let synth = AVSpeechSynthesizer()
    private var lastQuip = Date.distantPast
    var onTalking: ((Bool) -> Void)?
    /// Set from the avatar's `pet.name`; the frog's "Ribbit" becomes the avatar's own catchphrase.
    var petName = "henrik"
    private var catchphrase: String {
        switch petName.lowercased() { case "frog": return "Ribbit"; case "henrik": return "Alright"; default: return "Hey" }
    }

    var enabled: Bool { UserDefaults.standard.bool(forKey: "voiceOn") }
    var readBack: Bool { UserDefaults.standard.bool(forKey: "voiceReadBack") }
    var voiceName: String { UserDefaults.standard.string(forKey: "voiceName") ?? "Grandpa" }

    override init() {
        super.init()
        synth.delegate = self
    }

    static func voice(named name: String) -> AVSpeechSynthesisVoice? {
        AVSpeechSynthesisVoice.speechVoices().first { $0.name.caseInsensitiveCompare(name) == .orderedSame && $0.language.hasPrefix("en") }
            ?? AVSpeechSynthesisVoice.speechVoices().first { $0.name.caseInsensitiveCompare(name) == .orderedSame }
    }

    func say(_ text: String, force: Bool = false) {
        guard enabled || force, !text.isEmpty else { return }
        var text = text
        if petName.lowercased() != "frog" {
            text = text.replacingOccurrences(of: "Ribbit", with: catchphrase)
                .replacingOccurrences(of: "Frog online", with: "\(petName.capitalized) online")
        }
        let u = AVSpeechUtterance(string: text)
        u.voice = Self.voice(named: voiceName)
        u.rate = 0.48
        u.pitchMultiplier = 1.15
        u.volume = 0.9
        synth.stopSpeaking(at: .immediate)
        synth.speak(u)
    }

    func stop() { synth.stopSpeaking(at: .immediate) }

    /// A short remark, not every time, never twice in a row too quickly.
    func quip(_ options: [String], chance: Double = 1.0) {
        guard enabled, Date().timeIntervalSince(lastQuip) > 4, Double.random(in: 0...1) < chance else { return }
        lastQuip = Date()
        say(options.randomElement()!)
    }

    /// Lines in the avatar's own voice: the goalie for Henrik, the frog for the frog, the frog's lines otherwise.
    private func lines(frog: [String], henrik: [String]) -> [String] {
        petName.lowercased() == "henrik" ? henrik : frog
    }

    // events
    func woke() {
        quip(lines(frog: ["Ribbit. I'm awake.", "Hello. Ribbit.", "Frog online.", "Ready when you are."],
                   henrik: ["Skates on. I'm ready.", "Henrik here. Let's play.", "Warm-up's done.", "Ready when you are."]))
    }
    func dictated(_ text: String) {
        if readBack { say(text); return }
        quip(lines(frog: ["Ribbit. Typed.", "Got it.", "Words delivered.", "Done and done.", "Sent to the keyboard.", "Nice one.", "Ribbit."],
                   henrik: ["Save. Typed.", "Got it.", "Clean save.", "In the glove.", "Nothing gets past me.", "Easy one.", "Typed."]), chance: 0.5)
    }
    func heardNothing() {
        quip(lines(frog: ["Hmm? I didn't catch that.", "Say again?", "Ribbit? Nothing came through."],
                   henrik: ["Hmm? I didn't catch that.", "Say again?", "That one went wide. Nothing came through."]))
    }
    func notesStarted() { say(lines(frog: ["Taking notes. Carry on."], henrik: ["Taking notes. I've got the net."])[0]) }
    func notesReady(title: String) { say("Notes are ready. \(title).") }
    func grabbed() {
        quip(lines(frog: ["Hey!", "Ribbit!", "Careful, I'm slippery.", "Put me down.", "Whee."],
                   henrik: ["Hey!", "Watch the hair.", "Careful, the ice is slippery.", "Put me down.", "That's interference."]), chance: 0.8)
    }
    func test() { say(lines(frog: ["Ribbit. This is my voice. I type what you say."], henrik: ["Henrik here. This is my voice. I type what you say."])[0], force: true) }

    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, didStart u: AVSpeechUtterance) { Task { @MainActor in self.onTalking?(true) } }
    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish u: AVSpeechUtterance) { Task { @MainActor in self.onTalking?(false) } }
    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, didCancel u: AVSpeechUtterance) { Task { @MainActor in self.onTalking?(false) } }
}
