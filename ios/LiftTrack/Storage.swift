import Foundation

/// Durable replacement for the web app's `localStorage`.
///
/// WKWebView keeps `localStorage` in the app's website data store, which iOS
/// may evict under storage pressure and which isn't a sensible home for a
/// training log people keep for years. This writes the same key/value pairs to
/// JSON in Application Support instead, so the data is atomic on disk and
/// included in iCloud/Finder device backups.
final class Storage {

    static let shared = Storage()

    private let queue = DispatchQueue(label: "com.lifttrack.storage")
    private let fileURL: URL
    private var data: [String: String]

    private init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let directory = base.appendingPathComponent("LiftTrack", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        fileURL = directory.appendingPathComponent("store.json")

        if let raw = try? Data(contentsOf: fileURL),
           let decoded = try? JSONSerialization.jsonObject(with: raw) as? [String: String] {
            data = decoded
        } else {
            data = [:]
        }
    }

    /// Whole store, used to seed the JS shim before the page loads.
    var snapshot: [String: String] {
        queue.sync { data }
    }

    func set(_ key: String, _ value: String) {
        mutate { $0[key] = value }
    }

    func remove(_ key: String) {
        mutate { $0.removeValue(forKey: key) }
    }

    func clear() {
        mutate { $0.removeAll() }
    }

    private func mutate(_ block: (inout [String: String]) -> Void) {
        queue.sync {
            block(&data)
            persist()
        }
    }

    /// Called on `queue` only.
    private func persist() {
        guard let raw = try? JSONSerialization.data(withJSONObject: data, options: [.sortedKeys]) else {
            NSLog("[LiftTrack] could not serialise store")
            return
        }
        do {
            try raw.write(to: fileURL, options: .atomic)
        } catch {
            NSLog("[LiftTrack] could not write store: \(error.localizedDescription)")
        }
    }
}
