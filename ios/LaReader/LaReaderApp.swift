import SwiftUI

@main struct LaReaderApp: App {
    @StateObject private var library = LibraryStore()
    @Environment(\.scenePhase) private var phase
    var body: some Scene {
        WindowGroup {
            LibraryView().environmentObject(library)
                .tint(Color(red: 0.24, green: 0.38, blue: 0.3))
                .onOpenURL { url in Task { await library.importBooks([url]) } }
                .task {
                    #if DEBUG
                    if ProcessInfo.processInfo.arguments.contains("--uitest"), library.books.isEmpty,
                       let directory = Bundle.main.resourceURL?.appendingPathComponent("TestBooks"),
                       let files = try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) {
                        await library.importBooks(files.filter { ["epub", "cbz"].contains($0.pathExtension) })
                    }
                    #endif
                }
                .onChange(of: phase) { _, value in if value != .active { library.flush() } }
        }
    }
}

struct GlassSurface: ViewModifier {
    var radius: CGFloat = 24
    @Environment(\.accessibilityReduceTransparency) private var solid
    @ViewBuilder func body(content: Content) -> some View {
        if solid {
            content.background(.background, in: RoundedRectangle(cornerRadius: radius))
        } else if #available(iOS 26.0, *) {
            content.glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: radius))
        } else {
            content.background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: radius))
                .overlay(RoundedRectangle(cornerRadius: radius).strokeBorder(.white.opacity(0.2)))
        }
    }
}
extension View { func readerGlass(radius: CGFloat = 24) -> some View { modifier(GlassSurface(radius: radius)) } }
