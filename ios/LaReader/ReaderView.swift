import SwiftUI
import ReadiumShared

struct ReaderView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @StateObject private var session: ReaderSession
    @ObservedObject private var store: LibraryStore
    @State private var settingsVisible = false
    @State private var contentsVisible = false
    @State private var bookmarksVisible = false
    @State private var slider: Double = 0
    @State private var scrubOrigin: Double = 0
    @State private var scrubbing = false
    init(book: LibraryBook, store: LibraryStore) {
        self.store = store; _session = StateObject(wrappedValue: ReaderSession(book: book, store: store))
        _slider = State(initialValue: book.progress)
    }
    var body: some View {
        ZStack {
            Color(uiColor: store.settings.theme.uiColor).ignoresSafeArea()
            if session.publication != nil {
                ReaderHost(session: session, settings: store.settings).ignoresSafeArea().accessibilityIdentifier("reader-content").zIndex(0)
            } else if session.error == nil { ProgressView("Đang mở sách…") }
            if session.chrome {
                VStack {
                    header.padding(.horizontal, 16).padding(.top, 8)
                    Spacer()
                    footer.frame(maxWidth: 560).padding(.horizontal, 18).padding(.bottom, 8)
                }.transition(.opacity.combined(with: .offset(y: reduceMotion ? 0 : 8))).zIndex(1)
            }
        }
        .preferredColorScheme(store.settings.theme == .dark ? .dark : .light)
        .statusBarHidden(!session.chrome)
        .persistentSystemOverlays(session.chrome ? .visible : .hidden)
        .accessibilityAction(named: "Hiện thanh điều khiển") { session.chrome = true }
        .task { await session.open() }
        .onDisappear { store.flush() }
        .onChange(of: session.progress) { _, value in if !scrubbing { slider = value } }
        .alert("Không đọc được sách", isPresented: Binding(get: { session.error != nil }, set: { if !$0 { session.error = nil } })) {
            Button("Về thư viện") { dismiss() }
        } message: { Text(session.error ?? "") }
    }
    private var header: some View {
        HStack(spacing: 12) {
            Button { store.flush(); dismiss() } label: { readerIcon("chevron.down", width: 48, height: 48) }
                .readerGlass().accessibilityLabel("Về thư viện").accessibilityIdentifier("reader-close")
            Text(session.book.title).font(.subheadline.weight(.medium)).lineLimit(1).frame(maxWidth: .infinity).shadow(color: Color(uiColor: store.settings.theme.uiColor), radius: 8)
            HStack(spacing: 0) {
                if session.book.format == .epub {
                    Button { contentsVisible = true } label: { readerIcon("list.bullet", height: 48) }
                        .accessibilityLabel("Mục lục")
                        .popover(isPresented: $contentsVisible) { contents.frame(idealWidth: 360, idealHeight: 480).presentationCompactAdaptation(.sheet) }
                }
                Button { bookmarksVisible = true } label: { readerIcon(session.isBookmarked ? "bookmark.fill" : "bookmark", height: 48) }
                    .accessibilityLabel("Dấu trang")
                    .popover(isPresented: $bookmarksVisible) { bookmarks.frame(idealWidth: 360, idealHeight: 440).presentationCompactAdaptation(.sheet) }
                Button { readerTrace("settings opened"); settingsVisible = true } label: { readerIcon("textformat.size", width: 48, height: 48) }
                    .accessibilityLabel("Cài đặt đọc").accessibilityIdentifier("reader-settings")
                    .popover(isPresented: $settingsVisible) { settings.frame(idealWidth: 360, idealHeight: 450).presentationCompactAdaptation(.sheet) }
            }.readerGlass().disabled(!session.ready)
        }.buttonStyle(.plain)
    }
    private var footer: some View {
        VStack(spacing: 2) {
            HStack(spacing: 8) {
                Button { session.turn(false) } label: { readerIcon("chevron.left") }.accessibilityLabel("Trang trước")
                Slider(value: $slider, in: 0...1, onEditingChanged: { editing in
                    if editing {
                        scrubOrigin = slider
                        scrubbing = true
                    } else {
                        scrubbing = false
                        // Touching the thumb without moving it must not seek
                        // to an earlier rounded publication position.
                        if abs(slider - scrubOrigin) > 0.0001 { session.jump(slider) }
                    }
                }).accessibilityLabel("Tiến độ đọc")
                Button { session.turn(true) } label: { readerIcon("chevron.right") }.accessibilityLabel("Trang sau")
                Button { session.toggleChrome() } label: { readerIcon("arrow.down.right.and.arrow.up.left") }
                    .accessibilityLabel("Ẩn thanh điều khiển").accessibilityIdentifier("reader-hide")
            }
            Text(session.label).font(.caption.monospacedDigit()).foregroundStyle(.secondary).padding(.bottom, 8).accessibilityIdentifier("reader-progress")
        }.padding(.horizontal, 8).readerGlass(radius: 28).buttonStyle(.plain).disabled(!session.ready || session.turning)
    }
    private var settings: some View {
        NavigationStack {
            Form {
                Section("Bố cục") {
                    Toggle("Hai trang khi xoay ngang", isOn: session.book.format == .epub ? $store.settings.epubDouble : $store.settings.comicDouble).accessibilityIdentifier("reader-double")
                    if session.book.format == .cbz { Toggle("Đọc từ phải sang trái", isOn: $store.settings.rightToLeft) }
                }
                Section("Giao diện") {
                    Picker("Màu trang", selection: $store.settings.theme) { ForEach(ReaderTheme.allCases, id: \.self) { Text($0.title).tag($0) } }.pickerStyle(.segmented)
                }
                if session.book.format == .epub {
                    Section("Chữ") {
                        VStack(spacing: 12) {
                            LabeledContent("Cỡ chữ", value: "\(Int(store.settings.fontSize))")
                            Slider(value: $store.settings.fontSize, in: 14...32, step: 1).accessibilityLabel("Cỡ chữ")
                        }.padding(.vertical, 4)
                        VStack(spacing: 12) {
                            LabeledContent("Giãn dòng", value: String(format: "%.1f", store.settings.lineHeight))
                            Slider(value: $store.settings.lineHeight, in: 1.3...2.2, step: 0.1).accessibilityLabel("Giãn dòng")
                        }.padding(.vertical, 4)
                    }
                }
                Section {
                    Picker("Chuyển trang", selection: $store.settings.motion) { ForEach(PageMotion.allCases, id: \.self) { Text($0.title).tag($0) } }
                } footer: { Text("Chạm hai bên để chuyển trang. Chạm giữa để ẩn hoặc hiện điều khiển.") }
            }.navigationTitle("Cài đặt đọc").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Xong") { settingsVisible = false } } }
        }.presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
    }
    private var contents: some View {
        NavigationStack {
            List { ForEach(Array(flatten(session.tableOfContents).enumerated()), id: \.offset) { _, link in
                Button(link.title ?? "Chương") { session.host?.go(link); contentsVisible = false }
            } }.overlay { if session.tableOfContents.isEmpty { ContentUnavailableView("Sách không có mục lục", systemImage: "list.bullet") } }
                .navigationTitle("Mục lục").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Xong") { contentsVisible = false } } }
        }.presentationDetents([.medium, .large])
    }
    private var bookmarks: some View {
        NavigationStack {
            List {
                Button { store.toggleBookmark(session.book.id, bookmark: session.bookmark) } label: {
                    Label(session.isBookmarked ? "Bỏ dấu trang hiện tại" : "Đánh dấu trang hiện tại", systemImage: session.isBookmarked ? "bookmark.slash" : "bookmark.badge.plus")
                }
                ForEach(session.currentBook.bookmarks) { mark in
                    Button(mark.label) { session.go(mark); bookmarksVisible = false }
                        .swipeActions { Button("Xóa", role: .destructive) { store.removeBookmark(session.book.id, bookmarkID: mark.id) } }
                }
            }.navigationTitle("Dấu trang").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Xong") { bookmarksVisible = false } } }
        }.presentationDetents([.medium, .large])
    }
    private func flatten(_ links: [ReadiumShared.Link]) -> [ReadiumShared.Link] { links.flatMap { [$0] + flatten($0.children) } }
    private func readerIcon(_ symbol: String, width: CGFloat = 44, height: CGFloat = 44) -> some View {
        // Plain image buttons must own the whole target, including transparent glass.
        Image(systemName: symbol).frame(width: width, height: height).contentShape(Rectangle())
    }
}
