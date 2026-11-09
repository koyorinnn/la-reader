import UIKit
import ImageIO
import ReadiumShared

@MainActor final class ComicPagerController: UIViewController, UIPageViewControllerDataSource, UIPageViewControllerDelegate, UIGestureRecognizerDelegate {
    let session: ReaderSession
    private var settings: ReaderSettings
    private var pages = 1
    private var pager: UIPageViewController!
    private var pageTap: UITapGestureRecognizer?
    private let images = NSCache<NSString, UIImage>()
    init(session: ReaderSession, settings: ReaderSettings) { self.session = session; self.settings = settings; super.init(nibName: nil, bundle: nil); images.totalCostLimit = 48*1024*1024 }
    required init?(coder: NSCoder) { fatalError("Use init(session:settings:)") }
    override func viewDidLoad() { super.viewDidLoad(); rebuild() }
    func configure(_ value: ReaderSettings, pages: Int) {
        readerTrace("comic layout pages=\(pages) double=\(value.comicDouble)")
        let rebuildRequired = value.motion != settings.motion || value.rightToLeft != settings.rightToLeft
        let relayout = self.pages != pages || settings.theme != value.theme
        settings = value; self.pages = pages
        if isViewLoaded { if rebuildRequired { rebuild() } else if relayout { show(session.page) } }
    }
    private func rebuild() {
        if let pager { pager.willMove(toParent: nil); pager.view.removeFromSuperview(); pager.removeFromParent() }
        let curl = settings.motion == .curl && !UIAccessibility.isReduceMotionEnabled
        pager = UIPageViewController(transitionStyle: curl ? .pageCurl : .scroll, navigationOrientation: .horizontal)
        pager.dataSource = self; pager.delegate = self
        addChild(pager); view.addSubview(pager.view); pager.view.frame = view.bounds
        pager.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]; pager.didMove(toParent: self)
        // UIPageViewController's own narrow-edge taps are disabled; our full-width zones own taps.
        for gesture in pager.gestureRecognizers where gesture is UITapGestureRecognizer { gesture.isEnabled = false }
        let tap = UITapGestureRecognizer(target: self, action: #selector(tapped(_:)))
        if let pageTap { view.removeGestureRecognizer(pageTap) }
        pageTap = tap
        tap.delegate = self; tap.cancelsTouchesInView = false; view.addGestureRecognizer(tap)
        show(session.page)
    }
    private func spread(_ page: Int) -> ComicSpreadController? {
        guard let publication = session.publication, page >= 0, page < publication.readingOrder.count else { return nil }
        let indices = ReaderPolicy.spread(page: page, count: publication.readingOrder.count, pages: pages)
        return ComicSpreadController(start: indices.first ?? 0, indices: settings.rightToLeft ? Array(indices.reversed()) : indices, publication: publication, cache: images, background: settings.theme.uiColor)
    }
    func show(_ page: Int) {
        guard let publication = session.publication, let controller = spread(max(0, min(page, publication.readingOrder.count-1))) else { return }
        pager.setViewControllers([controller], direction: .forward, animated: false)
        session.didShowComic(controller.start)
    }
    func turn(_ forward: Bool) {
        guard !session.turning, let controller = spread(session.page + (forward ? pages : -pages)) else { return }
        session.turning = true
        let direction: UIPageViewController.NavigationDirection = (forward != settings.rightToLeft) ? .forward : .reverse
        pager.setViewControllers([controller], direction: direction, animated: settings.motion != .none && !UIAccessibility.isReduceMotionEnabled) { [weak self] done in
            guard let self else { return }
            if done { self.session.didShowComic(controller.start) }
            self.session.turning = false
        }
    }
    @objc private func tapped(_ recognizer: UITapGestureRecognizer) {
        readerTrace("cbz tap=\(recognizer.location(in: view)) bounds=\(view.bounds)")
        guard (pager.viewControllers?.first as? ComicSpreadController)?.zoomed != true else { return }
        switch ReaderPolicy.tap(x: recognizer.location(in: view).x, width: view.bounds.width) {
        case .left: turn(settings.rightToLeft)
        case .right: turn(!settings.rightToLeft)
        case .center: session.toggleChrome()
        case nil: break
        }
    }
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool { false }
    func pageViewController(_ pageViewController: UIPageViewController, viewControllerBefore viewController: UIViewController) -> UIViewController? {
        guard let current = viewController as? ComicSpreadController, !current.zoomed else { return nil }
        return spread(current.start + (settings.rightToLeft ? pages : -pages))
    }
    func pageViewController(_ pageViewController: UIPageViewController, viewControllerAfter viewController: UIViewController) -> UIViewController? {
        guard let current = viewController as? ComicSpreadController, !current.zoomed else { return nil }
        return spread(current.start + (settings.rightToLeft ? -pages : pages))
    }
    func pageViewController(_ pageViewController: UIPageViewController, willTransitionTo pendingViewControllers: [UIViewController]) { session.turning = true }
    func pageViewController(_ pageViewController: UIPageViewController, didFinishAnimating finished: Bool, previousViewControllers: [UIViewController], transitionCompleted completed: Bool) {
        if completed, let current = pageViewController.viewControllers?.first as? ComicSpreadController { session.didShowComic(current.start) }
        session.turning = false
    }
}

@MainActor final class ComicSpreadController: UIViewController, UIScrollViewDelegate {
    let start: Int
    private let indices: [Int], publication: Publication, cache: NSCache<NSString, UIImage>, background: UIColor
    private let scroll = UIScrollView(), content = UIStackView()
    private var task: Task<Void, Never>?
    var zoomed: Bool { scroll.zoomScale > 1.02 }
    init(start: Int, indices: [Int], publication: Publication, cache: NSCache<NSString, UIImage>, background: UIColor) {
        self.start = start; self.indices = indices; self.publication = publication; self.cache = cache; self.background = background
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("Use designated initializer") }
    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = background
        scroll.minimumZoomScale = 1; scroll.maximumZoomScale = 4; scroll.delegate = self
        scroll.showsHorizontalScrollIndicator = false; scroll.showsVerticalScrollIndicator = false
        view.addSubview(scroll); scroll.addSubview(content)
        content.axis = .horizontal; content.spacing = 4; content.distribution = .fillEqually
        for index in indices {
            let image = UIImageView(); image.contentMode = .scaleAspectFit; image.clipsToBounds = true
            image.isAccessibilityElement = true; image.accessibilityLabel = "Trang \(index+1)"; content.addArrangedSubview(image)
        }
        task = Task { [weak self] in
            guard let self else { return }
            for (i, index) in indices.enumerated() {
                if Task.isCancelled { return }
                let link = publication.readingOrder[index], key = link.href as NSString
                var image = cache.object(forKey: key)
                if image == nil, let resource = publication.get(link), let data = try? await resource.read().get() {
                    image = await Task.detached {
                        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
                              let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceThumbnailMaxPixelSize: 2400, kCGImageSourceCreateThumbnailWithTransform: true] as CFDictionary) else { return UIImage(data: data) }
                        return UIImage(cgImage: cg)
                    }.value
                    if let image { cache.setObject(image, forKey: key, cost: Int(image.size.width*image.size.height*4)) }
                }
                (content.arrangedSubviews[i] as? UIImageView)?.image = image
                if image == nil { content.arrangedSubviews[i].accessibilityLabel = "Không đọc được ảnh trang \(index+1)" }
            }
        }
    }
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        guard !zoomed else { return }
        scroll.frame = view.bounds.inset(by: UIEdgeInsets(top: 4, left: view.safeAreaInsets.left, bottom: 4, right: view.safeAreaInsets.right))
        content.frame = scroll.bounds; scroll.contentSize = scroll.bounds.size
    }
    func viewForZooming(in scrollView: UIScrollView) -> UIView? { content }
    deinit { task?.cancel() }
}
