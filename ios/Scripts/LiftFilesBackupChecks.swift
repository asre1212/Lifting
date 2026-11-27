import Foundation

@main struct LiftFilesBackupChecks {
    static func main() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
        defer { try? FileManager.default.removeItem(at: folder) }
        let owner = UUID()
        let unrelated = folder.appendingPathComponent("unrelated.json")
        try Data("unchanged".utf8).write(to: unrelated)
        func save(_ value: Int) throws {
            try LiftFilesBackup.capture(in: folder, owner: owner, store: [
                "lt_wo": "[{\"id\":\"w\",\"date\":\"2026-11-27\",\"entries\":[{\"sets\":\(value)}],\"notes\":\"kept\"}]",
                "lt_ex": "{\"Upper\":[\"Press\"]}",
                "lt_voice_corrections": "do-not-copy",
                "token": "do-not-copy"
            ])
        }
        try save(1)
        try save(2)
        try save(3)
        try save(3)
        let directory = folder.appendingPathComponent("LiftTrack Auto Backup " + owner.uuidString)
        let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
        let data = try files.map { try Data(contentsOf: $0) }
        let decoded = try data.map { try JSONSerialization.jsonObject(with: $0) as! [String: Any] }
        precondition(Set(decoded.compactMap { $0["backupSequence"] as? Int }) == [2, 3])
        precondition(data.allSatisfy { !String(decoding: $0, as: UTF8.self).contains("do-not-copy") })
        precondition(decoded.allSatisfy { ($0["workouts"] as? [[String: Any]])?.first?["notes"] as? String == "kept" })
        let untouched = try Data(contentsOf: unrelated)
        precondition(untouched == Data("unchanged".utf8))
        try Data("foreign".utf8).write(to: files[0])
        do { try save(4); fatalError("Replaced unknown file") } catch {}
        let foreign = try Data(contentsOf: files[0])
        let previous = try Data(contentsOf: files[1])
        precondition(foreign == Data("foreign".utf8) && previous == data[1])
        print("Verified two external generations, dedupe, compatible notes, omissions, and refusal to overwrite unrelated files")
    }
}
