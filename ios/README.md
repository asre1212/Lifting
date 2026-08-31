# LiftTrack for iOS

A native iOS wrapper around the LiftTrack web app. `index.html` at the repository
root stays the single source of truth — the Xcode build copies it into the app
bundle, so editing it and rebuilding is all it takes to ship a UI change.

## Running it

1. Open `ios/LiftTrack.xcodeproj`.
2. Change the bundle identifier. There are **two** targets, and iOS requires the
   widget's ID to be the app's ID plus a suffix — so they're both derived from a
   single project-level setting. Select the **project** (not a target) → **Build
   Settings** → search `APP_BUNDLE_ID` → change `com.example.lifttrack` to
   something you own. That updates both.
3. Select each target in turn → **Signing & Capabilities** → pick your Team.
4. Choose a simulator or your iPhone and press Run.

> If you change the Bundle Identifier in the Signing & Capabilities tab instead,
> Xcode writes a literal value into that one target and breaks the link — you'd
> then have to set the widget's to `<your id>.widgets` by hand. Editing
> `APP_BUNDLE_ID` avoids that.

Nothing else to install — no CocoaPods, no npm, no Capacitor. The only external
dependencies are WebKit, ActivityKit and WidgetKit, all part of iOS.

## How it fits together

| Piece | Job |
| --- | --- |
| `LiftTrack/WebViewController.swift` | Full-screen `WKWebView`, native message handlers, share sheet |
| `LiftTrack/Storage.swift` | Durable key/value store backing the web app's data |
| `LiftTrack/RestTimerController.swift` | Live Activity session + background chime for the rest timer |
| `LiftTrack/Bridge.js` | Injected before page load; swaps in native-backed web APIs |
| `Shared/RestActivityAttributes.swift` | Live Activity model, compiled into both targets |
| `Shared/RestTimerIntents.swift` | App Intents behind the Lock Screen buttons, compiled into both targets |
| `LiftTrackWidgets/` | Widget extension that draws the Dynamic Island / Lock Screen |
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

## Rest timer: Lock Screen session and chime

The web app's rest timer is a `setInterval`, which iOS freezes the instant the
app leaves the foreground — so a rest that ends while you're locked or in
another app never counts down and never beeps. Rather than fight that, the
bridge wraps the page's own `startRest`/`stopRest` (they're globals, because the
rest chips call them from inline `onclick` handlers) and hands the rest length
to native, which schedules both effects against the wall clock:

- **Lock Screen / Dynamic Island** — a Live Activity started via ActivityKit.
  The countdown and its ring are drawn with `Text(timerInterval:)` and
  `ProgressView(timerInterval:)`, so the *system* ticks them down; the app never
  pushes an update and doesn't need to be running. The last exercise name you
  typed is used as the label.
- **Chime** — a local notification scheduled for the end of the rest, so it
  fires with the app backgrounded or the phone locked. It's **on by default**,
  with a toggle in the rest card to turn it off; opening the Log page is what
  triggers the iOS notification permission prompt.

### The session, and the buttons on it

The activity is scoped to a *workout*, not to one rest. Opening the Log page
raises it; it then sits on the Lock Screen — idle between sets, counting down
during a rest — until the workout ends. That's what makes the buttons worth
having:

- **1 / 2 / 3 MIN** — start (or restart) a countdown without unlocking. The
  running length is filled in, so a glance tells you which rest you're on.
- **Complete Workout** — takes the activity down and opens the app on the Log
  page to write the sets down.

Both are `LiveActivityIntent`s in `Shared/RestTimerIntents.swift`, compiled into
both targets: the widget needs the types to build its buttons, the app runs the
`perform()`. iOS runs a `LiveActivityIntent` in the *app's* process — launching
it in the background if it isn't running — so the work itself lives behind a
small handler registry that `RestTimerController` fills in at launch, and that
stays empty (and unused) in the widget process.

A rest started from the Lock Screen leaves the page's own counter behind, since
its `setInterval` was frozen the whole time. `__ltRestSync` hands the page the
remaining seconds when the app comes back up, and `__ltCompleteWorkout` is the
Complete Workout button arriving on the JS side. The pending "open the Log page"
flag outlives the launch in `UserDefaults`, because tapping that button can be
what starts the app in the first place.

Two details the Lock Screen depends on:

- The activity's **stale date is the rest's end date**. That's what re-renders it
  as "REST OVER" when the countdown runs out with the app suspended — there's
  nothing running to push an update at that moment.
- The app **re-adopts** an existing activity at launch instead of clearing it,
  because tapping the activity is the usual way back into the app and the
  workout it belongs to is still going.

One wrinkle worth knowing about: when a rest ends while you're in another app,
the notification chimes there, and then the page's own `restBeep()` would fire a
second time the moment you switch back. The bridge suppresses exactly that one
duplicate — but only when the chime is on, since with it off the in-app beep is
the only feedback there is.

Live Activities need iOS 16.2+, and the buttons need iOS 17 (`Button(intent:)`
in a widget). The app itself still runs on iOS 15: below 16.2 it does without
the activity entirely, and on 16.2–16.x the activity appears with the countdown
but no buttons. If you've switched Live Activities off for LiftTrack in
Settings, the timer and chime still work.

The chime uses a normal-priority notification, so Focus modes can hold it back.
Making it break through requires Apple's Time Sensitive Notifications
entitlement, which is deliberately not requested here — it would add a
provisioning profile capability for a fairly small gain.

`lifttrack://log` is registered as a URL scheme so tapping the activity itself
lands on the Log page rather than wherever you last left the app.

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
