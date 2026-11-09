// swift-tools-version: 6.0
import PackageDescription
let package = Package(
    name: "LabyrinthCore", platforms: [.macOS(.v15)],
    products: [.library(name: "LabyrinthCore", targets: ["LabyrinthCore"])],
    targets: [
        .target(name: "LabyrinthCore", path: "Sources/Core"),
        .testTarget(name: "CoreTests", dependencies: ["LabyrinthCore"], path: "Tests/CoreTests")
    ]
)
