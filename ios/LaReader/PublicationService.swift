import Foundation
import ReadiumShared
import ReadiumStreamer
import WebKit

@MainActor final class PublicationService {
    static let shared = PublicationService()
    private let http = OfflineHTTPClient()
    private(set) var offlineRules: WKContentRuleList?
    private lazy var retriever = AssetRetriever(httpClient: http)
    private lazy var opener = PublicationOpener(parser: DefaultPublicationParser(httpClient: http, assetRetriever: retriever, pdfFactory: DefaultPDFDocumentFactory()))

    func open(_ url: URL) async throws -> Publication {
        if offlineRules == nil {
            offlineRules = try await withCheckedThrowingContinuation { continuation in
                WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "la-offline-publications", encodedContentRuleList: """
                [{"trigger":{"url-filter":"^(https?|wss?)://"},"action":{"type":"block"}}]
                """) { rules, error in
                    if let error { continuation.resume(throwing: error) }
                    else { continuation.resume(returning: rules) }
                }
            }
        }
        guard let file = FileURL(url: url) else { throw ReaderFailure("Không tìm thấy tệp sách.") }
        let asset = try await retriever.retrieve(url: file).get()
        let publication = try await opener.open(asset: asset, allowUserInteraction: false).get()
        guard !publication.isRestricted, !publication.readingOrder.isEmpty else {
            throw ReaderFailure("Sách có DRM hoặc không có nội dung đọc được.")
        }
        return publication
    }
}

private struct OfflineHTTPClient: HTTPClient {
    func stream(request: HTTPRequestConvertible, consume: @escaping (Data, Double?) -> HTTPResult<Void>) async -> HTTPResult<HTTPResponse> {
        .failure(.offline(nil))
    }
}
