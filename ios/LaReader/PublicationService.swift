import Foundation
import ReadiumShared
import ReadiumStreamer

@MainActor final class PublicationService {
    static let shared = PublicationService()
    private let http = DefaultHTTPClient()
    private lazy var retriever = AssetRetriever(httpClient: http)
    private lazy var opener = PublicationOpener(parser: DefaultPublicationParser(httpClient: http, assetRetriever: retriever))

    func open(_ url: URL) async throws -> Publication {
        guard let file = FileURL(url: url) else { throw ReaderFailure("Không tìm thấy tệp sách.") }
        let asset = try await retriever.retrieve(url: file).get()
        let publication = try await opener.open(asset: asset, allowUserInteraction: false).get()
        guard !publication.isRestricted, !publication.readingOrder.isEmpty else {
            throw ReaderFailure("Sách có DRM hoặc không có nội dung đọc được.")
        }
        return publication
    }
}
