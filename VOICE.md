# Local voice workout entries

Open the Safari / Home Screen web app, go to Log, and expand **Voice entry · on device**.
Use **Download / load model** on Wi-Fi first. Tap **Record**, speak for up to 30 seconds,
then **Stop**. Review the transcript, choose **Preview entries**, then **Add to workout**.
Edit the resulting workout cards and use the existing **Save workout** button.

Example: “Bench press, three sets of eight at 135 pounds. Dumbbell curls, three sets of ten at 25 pounds each.”

Use one sentence or line per exercise. Supported metrics: sets/reps, `3 x 8`, decimal
weights, pounds, kilograms (converted to pounds), each/per-side weights, bodyweight,
and durations in minutes or seconds. Unknown names use the current category and
are flagged for review. Missing metrics are left blank. The parser is intentionally
conservative; always review the workout cards. Different set groups should be
spoken as separate exercise sentences; repeated exercise rows are supported.

## Privacy

* Audio and transcripts are never uploaded. No transcription service, API key,
  analytics, or telemetry is used by this feature.
* Audio exists only in memory, is released after processing/cancellation, and is
  excluded from backups. Closing the app loses the unsaved transcript.
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

`node tests/voice-parser.test.cjs` tests parsing without browser dependencies.
Serve the repository on localhost:8765, install Playwright in your test environment,
then run `node tests/voice-ui.test.cjs`. Set `CHROMIUM_PATH` if using an existing
Chromium binary. This checks preview/add/save, volume, duplicate-add prevention,
stale-preview invalidation, and text injection safety.

Physical iPhone Air microphone, speed, battery, and offline-cache behavior still
require device testing. Native Xcode compilation is not required for the PWA update.

Verified in desktop Chromium: actual Whisper transcription of the public JFK sample
succeeded online and in a fresh worker while offline, with zero network writes.
Parser, workout UI, microphone-denial/cancellation, and privacy guard checks passed.
