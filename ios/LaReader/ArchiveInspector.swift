import Foundation
import CryptoKit

/// Validate ZIP boundaries before handing an untrusted local file to the parser.
enum ArchiveInspector {
    static let maximumFileSize = 100 * 1024 * 1024
    static func inspect(_ url: URL) throws -> String {
        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard size > 0, size <= maximumFileSize else { throw ReaderFailure("Tệp phải nhỏ hơn 100 MB.") }
        let data = try Data(contentsOf: url, options: .mappedIfSafe)
        try validate(data)
        return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
    static func validate(_ data: Data) throws {
        func invalid() -> ReaderFailure { ReaderFailure("Tệp ZIP không hợp lệ hoặc vượt giới hạn đọc an toàn.") }
        func u16(_ p: Int) -> Int { Int(data[p]) | Int(data[p+1]) << 8 }
        func u32(_ p: Int) -> Int { u16(p) | u16(p+2) << 16 }
        guard data.count >= 22, data.count <= maximumFileSize else { throw invalid() }
        let end = stride(from: data.count - 22, through: max(0, data.count - 65557), by: -1).first {
            u32($0) == 0x06054b50 && $0 + 22 + u16($0+20) == data.count
        }
        guard let end, u16(end+4) == 0, u16(end+6) == 0,
              u16(end+8) == u16(end+10) else { throw invalid() }
        let count = u16(end+10), centralSize = u32(end+12), start = u32(end+16)
        guard count > 0, count <= 5000, start < end, centralSize <= end-start else { throw invalid() }
        var p = start, total = 0, names = Set<String>()
        for _ in 0..<count {
            guard p+46 <= end, u32(p) == 0x02014b50 else { throw invalid() }
            let flags = u16(p+8), method = u16(p+10), compressed = u32(p+20), expanded = u32(p+24)
            let length = u16(p+28), next = p+46+length+u16(p+30)+u16(p+32), local = u32(p+42)
            guard next <= start+centralSize, flags & 1 == 0, [0,8].contains(method),
                  expanded <= 40*1024*1024, local+30 <= start,
                  u32(local) == 0x04034b50 else { throw invalid() }
            guard let name = String(data: data[(p+46)..<(p+46+length)], encoding: .utf8),
                  !name.isEmpty, !name.hasPrefix("/"), !name.contains("\\"), !name.contains(":"),
                  !name.contains("\0"), !name.split(separator: "/").contains(".."),
                  names.insert(name).inserted else { throw invalid() }
            let body = local+30+u16(local+26)+u16(local+28)
            guard body <= start, compressed <= start-body else { throw invalid() }
            total += expanded
            guard total <= 300*1024*1024 else { throw invalid() }
            p = next
        }
        guard p == start+centralSize else { throw invalid() }
    }
}
