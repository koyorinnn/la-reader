import SwiftUI
import ReadiumShared
import ReadiumNavigator
import UIKit
import WebKit

@MainActor final class ReaderSession: ObservableObject {
    let book: LibraryBook
    let store: LibraryStore
    @Published var publication: Publication?
    @Published var tableOfContents: [ReadiumShared.Link] = []
    @Published var error: String?
    @Published var chrome = true
    @Published var label = "Đang mở sách…"
    @Published var progress: Double = 0
    @Published var page = 0
    @Published var pages = 1
    @Published var turning = false
    @Published var ready = false
    var positions: [Locator] = []
    var locator: Locator?
    weak var host: ReaderHostController?
    init(book: LibraryBook, store: LibraryStore) { self.book = book; self.store = store; page = book.comicPage; progress = book.progress }
    var currentBook: LibraryBook { store.book(book.id) ?? book }
    var isBookmarked: Bool { currentBook.bookmarks.contains { book.format == .cbz ? $0.page == page : $0.locator == locator.flatMap { try? $0.jsonString() } } }
    var bookmark: Bookmark { Bookmark(label: label, locator: locator.flatMap { try? $0.jsonString() }, page: book.format == .cbz ? page : nil, progress: progress) }

    func open() async {
        do {
            let url = store.file(book)
            _ = try await Task.detached { try ArchiveInspector.inspect(url) }.value
            let pub = try await PublicationService.shared.open(url)
            let loadedPositions = (try? await pub.positions().get()) ?? []
            guard !Task.isCancelled else { return }
            positions = loadedPositions
            tableOfContents = (try? await pub.tableOfContents().get()) ?? []
            if let saved = book.locator { locator = try? Locator(jsonString: saved) }
            if locator == nil, book.progress > 0, !positions.isEmpty {
                locator = positions.min { abs(($0.locations.totalProgression ?? 0)-book.progress) < abs(($1.locations.totalProgression ?? 0)-book.progress) }
            }
            publication = pub
            label = book.format == .cbz ? "\(page+1) / \(pub.readingOrder.count)" : "\(Int(progress*100))%"
        } catch { self.error = "Không mở được sách. \(error.localizedDescription)" }
    }
    func toggleChrome() { readerTrace("chrome \(!chrome)"); withAnimation(.smooth(duration: 0.25)) { chrome.toggle() } }
    func turn(_ forward: Bool) { host?.turn(forward) }
    func jump(_ value: Double) {
        if book.format == .cbz, let publication {
            host?.showComic(Int((Double(publication.readingOrder.count-1)*value).rounded()))
        } else if !positions.isEmpty { host?.go(positions[min(positions.count-1, Int(Double(positions.count-1)*value))]) }
    }
    func go(_ mark: Bookmark) {
        if let page = mark.page { host?.showComic(page) }
        else if let raw = mark.locator, let location = try? Locator(jsonString: raw) { host?.go(location) }
        else { jump(mark.progress) }
    }
    func didLocate(_ locator: Locator) {
        readerTrace("location progress=\(locator.locations.totalProgression ?? -1)")
        ready = true
        self.locator = locator
        progress = locator.locations.totalProgression ?? progress
        label = "\(Int((progress*100).rounded()))%"
        store.updatePosition(book.id, locator: try? locator.jsonString(), page: nil, progress: progress)
    }
    func didShowComic(_ page: Int) {
        guard let publication else { return }
        ready = true
        self.page = page
        let visible = ReaderPolicy.spread(page: page, count: publication.readingOrder.count, pages: pages)
        let last = visible.last ?? page
        progress = Double(last+1) / Double(max(1, publication.readingOrder.count))
        label = visible.count == 2 ? "\(page+1)–\(last+1) / \(publication.readingOrder.count)" : "\(page+1) / \(publication.readingOrder.count)"
        store.updatePosition(book.id, locator: nil, page: page, progress: progress)
    }
}

struct ReaderHost: UIViewControllerRepresentable {
    @ObservedObject var session: ReaderSession
    var settings: ReaderSettings
    func makeUIViewController(context: Context) -> ReaderHostController { ReaderHostController(session: session) }
    func updateUIViewController(_ controller: ReaderHostController, context: Context) { controller.configure(settings) }
}

@MainActor final class ReaderHostController: UIViewController, EPUBNavigatorDelegate {
    let session: ReaderSession
    private var epub: EPUBNavigatorViewController?
    private var comic: ComicPagerController?
    private var settings: ReaderSettings
    private var effectivePages = 0
    private var snapshot: UIView?
    init(session: ReaderSession) {
        self.session = session; settings = session.store.settings
        super.init(nibName: nil, bundle: nil)
        session.host = self
    }
    required init?(coder: NSCoder) { fatalError("Use init(session:)") }
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = settings.theme.uiColor
        guard let publication = session.publication else { return }
        do {
            if session.book.format == .epub {
                let navigator = try EPUBNavigatorViewController(publication: publication, initialLocation: session.locator, config: .init(preferences: preferences()))
                navigator.delegate = self; epub = navigator; embed(navigator)
            } else {
                let pager = ComicPagerController(session: session, settings: settings)
                comic = pager; embed(pager)
            }
        } catch { session.error = error.localizedDescription }
    }
    private func embed(_ controller: UIViewController) {
        addChild(controller); view.addSubview(controller.view)
        controller.view.frame = view.bounds; controller.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        controller.didMove(toParent: self)
    }
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let pages = ReaderPolicy.pages(width: view.bounds.width, height: view.bounds.height, double: session.book.format == .epub ? settings.epubDouble : settings.comicDouble)
        if pages != effectivePages {
            effectivePages = pages
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.session.pages = pages
                self.epub?.submitPreferences(self.preferences())
                self.comic?.configure(self.settings, pages: pages)
            }
        }
    }
    override func viewWillTransition(to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator) {
        snapshot?.layer.removeAllAnimations(); snapshot?.removeFromSuperview(); snapshot = nil
        session.turning = false
        super.viewWillTransition(to: size, with: coordinator)
    }
    func configure(_ value: ReaderSettings) {
        guard value != settings else { return }
        settings = value; effectivePages = 0
        view.backgroundColor = value.theme.uiColor
        epub?.submitPreferences(preferences())
        comic?.configure(value, pages: max(1, session.pages))
        view.setNeedsLayout()
    }
    private func preferences() -> EPUBPreferences {
        EPUBPreferences(columnCount: effectivePages == 2 ? .two : .one,
                        fontSize: settings.fontSize / 19, lineHeight: settings.lineHeight,
                        pageMargins: 1.3, publisherStyles: false, scroll: false,
                        spread: effectivePages == 2 ? .always : .never,
                        theme: settings.theme == .dark ? .dark : settings.theme == .sepia ? .sepia : .light)
    }
    func turn(_ forward: Bool) {
        readerTrace("turn forward=\(forward) busy=\(session.turning) ready=\(session.ready)")
        guard !session.turning else { return }
        if let comic { comic.turn(forward); return }
        guard let epub else { return }
        session.turning = true
        let animate = !UIAccessibility.isReduceMotionEnabled && settings.motion != .none
        let flip = animate && settings.motion == .curl
        let old = flip ? epub.view.snapshotView(afterScreenUpdates: false) : nil
        if let old { old.frame = view.bounds; old.isUserInteractionEnabled = false; view.addSubview(old); snapshot = old }
        Task {
            let success = forward ? await epub.goForward(options: .init(animated: animate && !flip)) : await epub.goBackward(options: .init(animated: animate && !flip))
            readerTrace("turn completed success=\(success)")
            guard success, let old else { self.snapshot?.removeFromSuperview(); self.snapshot = nil; self.session.turning = false; return }
            var perspective = CATransform3DIdentity; perspective.m34 = -1 / 1500
            old.layer.transform = perspective
            old.layer.anchorPoint = CGPoint(x: forward ? 0 : 1, y: 0.5)
            old.frame = self.view.bounds
            UIView.animate(withDuration: 0.42, delay: 0, options: [.curveEaseInOut]) {
                old.layer.transform = CATransform3DRotate(perspective, forward ? -.pi/2 : .pi/2, 0, 1, 0)
                old.alpha = 0.12
            } completion: { _ in old.removeFromSuperview(); self.snapshot = nil; self.session.turning = false }
        }
    }
    func showComic(_ page: Int) { comic?.show(page) }
    func go(_ locator: Locator) { Task { await epub?.go(to: locator) } }
    func go(_ link: ReadiumShared.Link) { Task { await epub?.go(to: link) } }
    func navigator(_ navigator: VisualNavigator, didTapAt point: CGPoint) {
        readerTrace("epub tap=\(point) bounds=\(navigator.view.bounds) busy=\(session.turning)")
        guard !session.turning else { return }
        switch ReaderPolicy.tap(x: point.x, width: navigator.view.bounds.width) {
        case .left: turn(navigator.presentation.readingProgression == .rtl)
        case .right: turn(navigator.presentation.readingProgression != .rtl)
        case .center: session.toggleChrome()
        case nil: break
        }
    }
    func navigator(_ navigator: Navigator, locationDidChange locator: Locator) { session.didLocate(locator) }
    func navigator(_ navigator: Navigator, presentError error: NavigatorError) { session.error = error.localizedDescription }
    func navigator(_ navigator: EPUBNavigatorViewController, setupUserScripts userContentController: WKUserContentController) {
        if let rules = PublicationService.shared.offlineRules { userContentController.add(rules) }
    }
    func navigatorContentInset(_ navigator: VisualNavigator) -> UIEdgeInsets? {
        // SwiftUI's edge-to-edge host reports zero safe area. Use the window so
        // the first/last lines stay clear of the floating controls and notch.
        let safe = navigator.view.window?.safeAreaInsets ?? .zero
        let portraitPhone = UIDevice.current.userInterfaceIdiom == .phone && view.bounds.height > view.bounds.width
        let top: CGFloat = portraitPhone ? 59 : UIDevice.current.userInterfaceIdiom == .pad ? 32 : 0
        return UIEdgeInsets(top: max(safe.top, top) + 64, left: safe.left, bottom: max(safe.bottom, 20) + 88, right: safe.right)
    }
    override var keyCommands: [UIKeyCommand]? {
        [UIKeyCommand(input: UIKeyCommand.inputLeftArrow, modifierFlags: [], action: #selector(previousPage)),
         UIKeyCommand(input: UIKeyCommand.inputRightArrow, modifierFlags: [], action: #selector(nextPage)),
         UIKeyCommand(input: UIKeyCommand.inputEscape, modifierFlags: [], action: #selector(showControls))]
    }
    @objc private func previousPage() { turn(false) }
    @objc private func nextPage() { turn(true) }
    @objc private func showControls() { session.chrome = true }
}

func readerTrace(_ message: @autoclosure () -> String) {
    #if DEBUG
    NSLog("ReaderInput %@", message())
    #endif
}

extension ReaderTheme {
    var uiColor: UIColor { switch self { case .paper: .systemBackground; case .sepia: UIColor(red: 0.98, green: 0.955, blue: 0.91, alpha: 1); case .dark: UIColor(white: 0.055, alpha: 1) } }
}
