# Local voice workout entries

Open the Safari / Home Screen web app and go to Log. Tap the **microphone** to start
recording; it turns red. Tap the same microphone again to stop (maximum 30 seconds).
The entry panel opens below it. First use downloads the speech model; use Wi-Fi for
that initial download. The microphone is disabled while the audio is being processed. The transcript is parsed automatically. Review the editable preview,
then choose **Add to workout**. For a typed or edited transcript, use **Preview entries**.
Edit the resulting workout cards and use the existing **Save workout** button.

Example: “Bench press, three sets of eight at 135 pounds. Dumbbell curls, three sets of ten at 25 pounds each.”

Use one sentence or line per exercise. Supported metrics: sets/reps, `3 x 8`, decimal
weights, pounds, kilograms (converted to pounds), each/per-side weights, bodyweight,
and durations in minutes or seconds. Exercise aliases and plurals map to the existing
exercise catalog and its categories/subgroups, regardless of the tab you started on.
For example, “RDLs for sets of 10 at 20 pounds each side” becomes **Romanian Deadlift →
Legs → Glutes / Hamstrings**, **4 sets × 10 reps**, **20 lb each side** (40 lb total).
Contextual number corrections such as “for sets” → “4 sets” are shown in the transcript
and status. Ordinary phrases like “for 30 seconds” are left alone.
Missing spaces before counts are repaired too: “RDL4 sets” becomes “RDL 4 sets”,
so the exercise maps to Legs and the set count is retained.

The preview lets you edit exercise, category, subgroup, sets, reps, weight, weight type,
and duration. Adding distributes entries to their respective workout sections and
preserves other draft entries. Exact names and categories from your own exercise
history take precedence over built-in aliases. Your explicitly saved corrections take
precedence over both. Equipment variants retain their names, so dumbbell bench
press is not merged with bench press. Unknown names use the current category and
are flagged for review; choose the category in the preview. Missing metrics are left blank. The parser is intentionally
conservative; always review the workout cards. Different set groups should be
spoken as separate exercise sentences; repeated exercise rows are supported.

## Exercise dictionary and personal corrections

The app includes **186 common exercises** and **351 distinct names/aliases** across
its existing categories. Variants such as seated versus lying leg curls, dumbbell
versus barbell presses, single-leg RDLs, and common abbreviations stay distinct.
Shoulder movements use General because the app has no separate shoulder category.
The voice preview and correction form suggest exercise names as you type.

To teach a recurring name or recognition mistake:
1. Preview the entry, then correct its exercise, category or subgroup.
2. Tap **Remember this correction**. Saving a workout alone does not learn a mapping.
3. Future entries with that name use your mapping, including after an offline reload.

Only the exercise phrase, target name, category and subgroup are saved. Sets, reps,
weight, duration, full transcript sentences and audio are not learned or stored by
correction memory. A saved correction changes interpretation of recognized text;
it does not retrain Whisper or guarantee that speech is transcribed correctly.

Use **Home → Exercise dictionary → Manage** to add a nickname without recording,
edit or forget a mapping, or browse/search the built-in dictionary. The same controls
are available under **Exercise names & corrections** in the voice panel. Forgetting a
mapping leaves existing workouts intact. Matching is exact after normalization of
case, punctuation, common plurals and abbreviations; arbitrary fuzzy matches are not saved.

JSON backup/export includes `voiceCorrections` (version 1). Restore merges corrections
with existing ones; an existing mapping wins if the same phrase is already saved.
Older backups still work and leave correction memory unchanged. Invalid correction
records are rejected before changing workout data. Excel remains a workout report.

## Privacy

* Audio and transcripts are never uploaded. No transcription service, API key,
  analytics, or telemetry is used by this feature.
* Audio exists only in memory, is released after processing/cancellation, and is
  excluded from backups. Closing the app loses the unsaved transcript. Only explicitly
  remembered exercise mappings persist alongside normal workout storage.
* Initial setup makes GET requests to Hugging Face and jsDelivr for model/runtime
  files. Those hosts see ordinary download metadata (e.g. IP address), not audio
  or transcript content. Worker fetches reject writes and other origins.
* Parsing happens locally; confirmed entries use existing local workout storage
  and existing backup/export. Nothing is written to GitHub by voice entry.
* The PWA caches model files and speech runtime for offline reuse. iOS can evict
  caches; reload the model online if necessary. Setup must finish before offline use.
* No cloud/OS dictation fallback is started automatically. If recording is unavailable,
  type your entry. The file-based native WKWebView wrapper supports text parsing,
  but local Whisper recording is limited to the Safari / Home Screen web app.
* Recording stops on backgrounding, cancellation, or after 30 seconds. Inference
  runs in a worker so the workout UI remains responsive. Silence is rejected before
  inference to reduce Whisper hallucinations.

## Dependencies

* Vendored Transformers.js **3.8.1**, Apache-2.0 (see `vendor/transformers-LICENSE.txt`).
* `Xenova/whisper-tiny.en`, ONNX q8, revision
  `79fb389fc764e7c395bd330e9531d9d32ada7049`, Apache-2.0 per its model card.
* ONNX WASM runtime is downloaded from the pinned Transformers.js distribution
  on jsDelivr; CPU/WASM single-threaded execution avoids requiring WebGPU or
  cross-origin-isolated hosting. No server inference fallback.

References:
- https://huggingface.co/Xenova/whisper-tiny.en
- https://huggingface.co/docs/transformers.js/en/pipelines
- https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder

## Verification

`node tests/voice-parser.test.cjs` checks parsing and every dictionary alias.
`node tests/voice-memory.test.cjs` checks persistence, validation, storage failures,
backup merges and operation with network access blocked.
Serve the repository on localhost:8765, install Playwright in your test environment,
then run `node tests/voice-ui.test.cjs` and `node tests/voice-learning.test.cjs`. Set `CHROMIUM_PATH` if using an existing
Chromium binary. This checks automatic transcription preview, the RDL regression,
category/subgroup/field mapping, microphone start/stop and processing states,
manual corrections, preserved drafts, saved volume,
duplicate-add prevention, stale-preview invalidation, and text injection safety.
Learning checks cover explicit remembering, manual mappings, editing/forgetting,
offline reload, actual JSON export/import, legacy/conflicting backups and no network writes.

Physical iPhone Air microphone, speed, battery, and offline-cache behavior still
require device testing. Native Xcode compilation is not required for the PWA update.

Verified in desktop Chromium: actual Whisper transcription of the public JFK sample
succeeded online and in a fresh worker while offline, with zero network writes.
Parser, workout UI, microphone-denial/cancellation, and privacy guard checks passed.
