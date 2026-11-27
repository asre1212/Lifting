import Foundation

/// Files-only backup; the app container stores a permission bookmark, never a
/// second copy of the user's workout database.
enum LiftFilesBackup {
    enum Failure: LocalizedError {
        case access, occupied, invalid, tooLarge, verification
        var errorDescription: String? {
            switch self {
            case .access: return "Cannot access this Files folder. Select it again."
            case .occupied: return "A backup slot contains an unrecognized file. No file was replaced."
            case .invalid: return "Workout data could not be read for backup."
            case .tooLarge: return "The backup is too large to save."
            case .verification: return "The written Files backup could not be verified."
            }
        }
    }

    // Only saved workouts (including their notes) and the exercise list. No
    // voice history/dictionary, runtime state, credentials, or whole store.
    static let keys: Set<String> = ["lt_wo", "lt_ex"]
    static let limit = 20_000_000

    private static func content(_ store: [String: String]) throws -> [String: Any] {
        var result: [String: Any] = [:]
        if let raw = store["lt_wo"] {
            guard raw.utf8.count <= limit,
                  let workouts = try JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [[String: Any]],
                  workouts.allSatisfy({ $0["id"] is String && $0["date"] is String && $0["entries"] is [[String: Any]] })
            else { throw Failure.invalid }
            result["workouts"] = workouts
        } else { result["workouts"] = [] as [[String: Any]] }
        if let raw = store["lt_ex"] {
            guard raw.utf8.count <= limit,
                  let exercises = try JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: [String]]
            else { throw Failure.invalid }
            result["exercises"] = exercises
        }
        return result
    }

    private struct Existing {
        let url: URL
        let sequence: Int?
        let content: Data?
    }

    static func capture(in folder: URL, owner: UUID, store: [String: String]) throws {
        let content = try content(store)
        let canonical = try JSONSerialization.data(withJSONObject: content, options: .sortedKeys)
        guard canonical.count <= limit else { throw Failure.tooLarge }
        let fm = FileManager.default
        let directory = folder.appendingPathComponent("LiftTrack Auto Backup " + owner.uuidString, isDirectory: true)
        if fm.fileExists(atPath: directory.path) {
            let info = try directory.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
            guard info.isDirectory == true, info.isSymbolicLink != true else { throw Failure.occupied }
        } else {
            try fm.createDirectory(at: directory, withIntermediateDirectories: false)
        }
        func read(_ url: URL) throws -> Data {
            let handle = try FileHandle(forReadingFrom: url)
            defer { try? handle.close() }
            let data = try handle.read(upToCount: limit + 1) ?? Data()
            guard data.count <= limit else { throw Failure.tooLarge }
            return data
        }
        let slots = try ["Backup A.json", "Backup B.json"].map { name -> Existing in
            let url = directory.appendingPathComponent(name)
            do {
                let info = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
                guard info.isRegularFile == true, info.isSymbolicLink != true else { throw Failure.occupied }
            } catch let e as NSError where e.domain == NSCocoaErrorDomain &&
                [NSFileNoSuchFileError, NSFileReadNoSuchFileError].contains(e.code) {
                return Existing(url: url, sequence: nil, content: nil)
            }
            guard let json = try JSONSerialization.jsonObject(with: read(url)) as? [String: Any],
                  json["app"] as? String == "LiftTrack", json["backupOwner"] as? String == owner.uuidString,
                  json["backupVersion"] as? Int == 1,
                  let sequence = json["backupSequence"] as? Int, sequence > 0,
                  json["workouts"] is [[String: Any]]
            else { throw Failure.occupied }
            let comparable = json.filter { ["workouts", "exercises"].contains($0.key) }
            return Existing(url: url, sequence: sequence,
                            content: try JSONSerialization.data(withJSONObject: comparable, options: .sortedKeys))
        }
        let latest = slots.max { ($0.sequence ?? 0) < ($1.sequence ?? 0) }!
        if latest.content == canonical { return }
        let prior = latest.sequence ?? 0
        guard prior < Int.max else { throw Failure.occupied }
        var payload = content
        payload["app"] = "LiftTrack"
        payload["backupOwner"] = owner.uuidString
        payload["backupVersion"] = 1
        payload["backupSequence"] = prior + 1
        payload["exported"] = ISO8601DateFormatter().string(from: Date())
        let bytes = try JSONSerialization.data(withJSONObject: payload, options: .sortedKeys)
        guard bytes.count <= limit else { throw Failure.tooLarge }
        let target = slots.min { ($0.sequence ?? 0) < ($1.sequence ?? 0) }!.url
        try bytes.write(to: target, options: .atomic)
        guard try read(target) == bytes else { throw Failure.verification }
    }

    #if os(iOS)
    struct Destination: Codable {
        let bookmark: Data
        let name: String
        let owner: UUID

        init(selecting url: URL, owner: UUID) throws {
            guard url.startAccessingSecurityScopedResource() else { throw Failure.access }
            defer { url.stopAccessingSecurityScopedResource() }
            let chosen = url.resolvingSymlinksInPath().path
            let home = URL(fileURLWithPath: NSHomeDirectory()).resolvingSymlinksInPath().path
            guard chosen != home, !chosen.hasPrefix(home + "/") else { throw Failure.access }
            self.bookmark = try url.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil)
            self.name = url.lastPathComponent
            self.owner = owner
        }

        func capture(_ store: [String: String]) throws {
            var stale = false
            let folder = try URL(resolvingBookmarkData: bookmark, bookmarkDataIsStale: &stale)
            guard !stale, folder.startAccessingSecurityScopedResource() else { throw Failure.access }
            defer { folder.stopAccessingSecurityScopedResource() }
            var coordinationError: NSError?
            var result: Result<Void, Error>?
            NSFileCoordinator().coordinate(writingItemAt: folder, options: .forMerging, error: &coordinationError) { url in
                result = Result { try LiftFilesBackup.capture(in: url, owner: owner, store: store) }
            }
            if let coordinationError { throw coordinationError }
            guard let result else { throw Failure.access }
            try result.get()
        }
    }
    #endif
}
