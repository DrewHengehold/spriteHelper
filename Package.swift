// swift-tools-version: 6.2
import PackageDescription
import Foundation

var voicePetDependencies: [Target.Dependency] = [
    .product(name: "LLM", package: "LLM.swift")
]

// FluidAudio (Parakeet + diarization) only builds for Apple Silicon. The manifest is evaluated on the
// host, so when cross-compiling (e.g. `ARCH=amd64 ./build.sh` on an M-series Mac) build.sh sets
// VOICEPET_ARCH to the *target* architecture.
let targetArch: String = {
    if let a = ProcessInfo.processInfo.environment["VOICEPET_ARCH"], !a.isEmpty {
        return ["amd64", "x86_64", "intel"].contains(a.lowercased()) ? "x86_64" : "arm64"
    }
    #if arch(arm64)
    return "arm64"
    #else
    return "x86_64"
    #endif
}()

if targetArch == "arm64" {
    voicePetDependencies.append(.product(name: "FluidAudio", package: "FluidAudio"))
}

let package = Package(
    name: "VoicePet",
    platforms: [.macOS(.v26)],
    dependencies: [
        .package(url: "https://github.com/FluidInference/FluidAudio.git", from: "0.15.7"),
        .package(url: "https://github.com/eastriverlee/LLM.swift", from: "3.0.3")
    ],
    targets: [
        .executableTarget(
            name: "VoicePet",
            dependencies: voicePetDependencies,
            path: "Sources/VoicePet",
            swiftSettings: [.swiftLanguageMode(.v5)]
        )
    ]
)
