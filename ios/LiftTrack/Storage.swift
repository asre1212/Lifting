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

    var backupValues: [String: String] {
        get throws {
            try queue.sync {
                guard FileManager.default.fileExists(atPath: fileURL.path) else { return [:] }
                let raw = try Data(contentsOf: fileURL)
                guard let stored = try JSONSerialization.jsonObject(with: raw) as? [String: String]
                else { throw LiftFilesBackup.Failure.invalid }
                return stored.filter { LiftFilesBackup.keys.contains($0.key) }
            }
        }
    }

    @discardableResult
    func set(_ key: String, _ value: String) -> Bool {
        mutate { $0[key] = value }
    }

    @discardableResult
    func remove(_ key: String) -> Bool {
        mutate { $0.removeValue(forKey: key) }
    }

    @discardableResult
    func clear() -> Bool {
        mutate { $0.removeAll() }
    }

    private func mutate(_ block: (inout [String: String]) -> Void) -> Bool {
        queue.sync {
            block(&data)
            return persist()
        }
    }

    /// Called on `queue` only.
    private func persist() -> Bool {
        guard let raw = try? JSONSerialization.data(withJSONObject: data, options: [.sortedKeys]) else {
            NSLog("[LiftTrack] could not serialise store")
            return false
        }
        do {
            try raw.write(to: fileURL, options: .atomic)
            return true
        } catch {
            NSLog("[LiftTrack] could not write store: \(error.localizedDescription)")
            return false
        }
    }
}
