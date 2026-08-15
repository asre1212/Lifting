# LiftTrack for iOS

A native iOS wrapper around the LiftTrack web app. `index.html` at the repository
root stays the single source of truth — the Xcode build copies it into the app
bundle, so editing it and rebuilding is all it takes to ship a UI change.

## Running it

1. Open `ios/LiftTrack.xcodeproj`.
2. Select the **LiftTrack** target → **Signing & Capabilities**.
3. Pick your Team, and change the Bundle Identifier from `com.example.lifttrack`
   to something you own (e.g. `com.yourname.lifttrack`).
4. Choose a simulator or your iPhone and press Run.

Nothing else to install — no CocoaPods, no npm, no Capacitor. The only external
dependency is WebKit, which is part of iOS.

## How it fits together

| Piece | Job |
| --- | --- |
| `LiftTrack/WebViewController.swift` | Full-screen `WKWebView`, native message handlers, share sheet |
| `LiftTrack/Storage.swift` | Durable key/value store backing the web app's data |
| `LiftTrack/Bridge.js` | Injected before page load; swaps in native-backed web APIs |
| `Scripts/copy-web-assets.sh` | "Copy Web App" build phase — bundles the web app at `<App>.app/www` |

`index.html` is **not modified**. Everything native is bridged underneath it, so
the same file still runs unchanged as a website and as a PWA.

## What the bridge replaces, and why

Three web APIs the app relies on either don't exist or aren't durable inside a
`WKWebView`. `Bridge.js` is injected at document start, before any of the app's
own code runs, and substitutes native implementations:

**`localStorage` → JSON file in Application Support.** Every workout the app has
ever recorded lives in `localStorage`. In a `WKWebView` that data sits in the
website data store, which iOS can evict under storage pressure — not an
acceptable home for a multi-year training log. The shim keeps the store in
memory (it is a few KB), serves the app's synchronous reads from there, and
writes through to `store.json` on every mutation. Application Support is
included in iCloud and Finder device backups, so the log now survives a lost
phone.

**`navigator.share` → `UIActivityViewController`.** `WKWebView` implements
neither the Web Share API nor `<a download>`, and `exportData()` /
`exportExcel()` try them in that order. In a plain web view *both* backup paths
fail silently. The shim base64-encodes the file, hands it to native, and
presents a real share sheet. Cancellation is rejected as an `AbortError`, which
is exactly what the existing code already checks for.

**`navigator.vibrate` → `UIFeedbackGenerator`.** Never existed on iOS at all, so
the rest-timer haptic at the end of a set has always been a no-op on iPhone.
It now fires real haptics.

Import is untouched: `<input type="file">` works natively and opens the document
picker.

The service worker is deliberately **not** bundled. Service workers don't run
for `file://` content in a `WKWebView`, and the native shell has no use for
either the offline cache (all assets are already local) or the "Update ready —
tap Refresh" prompt it drives. Registration is guarded by
`'serviceWorker' in navigator`, so the app skips it and carries on.

## Moving data over from the PWA

There is no automatic migration — the native app starts with an empty store.
In the existing PWA use **Export Backup**, save the JSON, then use **Import** in
the native app.

## Notes

- **App icon** is upscaled from `icon-512.png` to the 1024×1024 Apple requires.
  It's a clean shape and holds up well, but a native 1024×1024 export would be
  sharper if you still have the source.
- **Deployment target** is iOS 15.0; portrait-only, matching `manifest.json`.
- **Privacy**: `PrivacyInfo.xcprivacy` declares no tracking and no collected
  data, which is accurate — the app makes no network requests.
- `ENABLE_USER_SCRIPT_SANDBOXING` is off so the copy phase can read the web app
  from the repository root, one level above the Xcode project.
