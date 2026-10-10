// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Mascot",
    platforms: [.macOS(.v14), .iOS(.v17)],
    products: [
        .library(name: "Mascot", targets: ["Mascot"]),
    ],
    targets: [
        .target(name: "Mascot"),
        .testTarget(name: "MascotTests", dependencies: ["Mascot"]),
    ]
)
