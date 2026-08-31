/* ─────────────────────────────────────────────────────────────────────────
   LiftTrack native bridge
   Injected at document start, before index.html runs any of its own code.

   Replaces three web APIs that either don't exist or aren't durable inside
   a WKWebView, so index.html can stay completely unmodified:

     • localStorage  → in-memory mirror seeded from native, write-through to
                       a JSON file in Application Support (iCloud-backed-up)
     • navigator.share / canShare
                     → UIActivityViewController (WKWebView has no Web Share)
     • navigator.vibrate
                     → UIFeedbackGenerator (never existed on iOS at all)
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var seed = window.__LT_SEED__ || {};
  try { delete window.__LT_SEED__; } catch (e) { window.__LT_SEED__ = undefined; }

  function post(channel, payload) {
    try {
      window.webkit.messageHandlers[channel].postMessage(payload);
      return true;
    } catch (e) {
      console.warn('[LiftTrack] bridge channel unavailable:', channel, e);
      return false;
    }
  }

  function define(target, name, value) {
    try {
      Object.defineProperty(target, name, {
        value: value,
        configurable: true,
        enumerable: false,
        writable: true,
      });
      return true;
    } catch (e) {
      try { target[name] = value; return true; } catch (_) { return false; }
    }
  }

  /* ── Durable localStorage ───────────────────────────────────────────────
     The page's storage helpers are synchronous, and the native channel is
     not — so we keep the whole store in memory (it is a few KB of JSON) and
     write through to disk on every mutation. Reads never touch native.     */

  var data = {};
  Object.keys(seed).forEach(function (k) { data[k] = String(seed[k]); });

  var shim = {
    getItem: function (key) {
      key = String(key);
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem: function (key, value) {
      key = String(key);
      data[key] = String(value);
      post('store', { op: 'set', key: key, value: data[key] });
    },
    removeItem: function (key) {
      key = String(key);
      delete data[key];
      post('store', { op: 'remove', key: key });
    },
    clear: function () {
      data = {};
      post('store', { op: 'clear' });
    },
    key: function (index) {
      var keys = Object.keys(data);
      index = Number(index);
      return index >= 0 && index < keys.length ? keys[index] : null;
    },
  };

  try {
    Object.defineProperty(shim, 'length', {
      get: function () { return Object.keys(data).length; },
      enumerable: false,
      configurable: true,
    });
  } catch (e) { /* non-fatal: nothing in index.html reads .length */ }

  define(window, 'localStorage', shim);

  /* ── Web Share ──────────────────────────────────────────────────────────
     index.html hands us a File for both the JSON backup and the .xlsx
     export, and treats a rejection named 'AbortError' as "user cancelled",
     so the rejection name has to survive the round trip.                   */

  var shareSeq = 0;
  var sharePending = {};

  define(window, '__ltShareResult', function (id, ok, errName, errMessage) {
    var pending = sharePending[id];
    if (!pending) return;
    delete sharePending[id];
    if (ok) { pending.resolve(); return; }
    var err;
    try {
      err = new DOMException(errMessage || 'Share failed', errName || 'AbortError');
    } catch (e) {
      err = new Error(errMessage || 'Share failed');
      err.name = errName || 'AbortError';
    }
    pending.reject(err);
  });

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result || '');
        var comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : '');
      };
      reader.onerror = function () { reject(reader.error || new Error('Could not read file')); };
      reader.readAsDataURL(file);
    });
  }

  define(navigator, 'canShare', function (payload) {
    if (!payload) return false;
    if (payload.files && payload.files.length) return true;
    return !!(payload.url || payload.text || payload.title);
  });

  define(navigator, 'share', function (payload) {
    payload = payload || {};
    var files = payload.files ? Array.prototype.slice.call(payload.files) : [];

    return Promise.all(files.map(function (file) {
      return fileToBase64(file).then(function (base64) {
        return {
          name: file.name || 'LiftTrack',
          type: file.type || 'application/octet-stream',
          data: base64,
        };
      });
    })).then(function (encoded) {
      return new Promise(function (resolve, reject) {
        var id = ++shareSeq;
        sharePending[id] = { resolve: resolve, reject: reject };
        var sent = post('share', {
          id: id,
          title: payload.title || '',
          text: payload.text || '',
          url: payload.url || '',
          files: encoded,
        });
        if (!sent) {
          delete sharePending[id];
          var err = new Error('Share unavailable');
          err.name = 'NotAllowedError';
          reject(err);
        }
      });
    });
  });

  /* ── Haptics ────────────────────────────────────────────────────────── */

  define(navigator, 'vibrate', function (pattern) {
    var list = Array.isArray(pattern) ? pattern : [pattern];
    post('haptics', { pattern: list });
    return true;
  });

  /* ── Rest timer: Lock Screen session + background chime ────────────────
     The page drives its rest timer with setInterval, which iOS freezes the
     moment the app leaves the foreground — so a rest that ends while the
     phone is locked never counts down and never beeps. We wrap the page's
     own global timer functions (they're globals because the rest chips call
     them from inline onclick handlers) and hand the end time to native,
     which runs a Live Activity and a local notification against the wall
     clock instead.

     Native owns the session too: opening the Log page raises a Live Activity
     that stays on the Lock Screen with its own 1 / 2 / 3 minute buttons and a
     "Complete Workout" button, and those call back down here.              */

  var CHIME_KEY = 'lt_native_chime';
  var restEndsAt = null;
  var suppressNextBeep = false;
  var chimeAuthResolve = null;
  var sessionLive = false;
  var lastExercise = '';

  // Absent means on: the chime is the default, the toggle opts out of it.
  function chimeEnabled() { return shim.getItem(CHIME_KEY) !== '0'; }

  define(window, '__ltChimeAuth', function (granted) {
    var resolve = chimeAuthResolve;
    chimeAuthResolve = null;
    if (resolve) resolve(!!granted);
  });

  function requestChimePermission() {
    return new Promise(function (resolve) {
      chimeAuthResolve = resolve;
      if (!post('restTimer', { op: 'requestChime' })) {
        chimeAuthResolve = null;
        resolve(false);
      }
    });
  }

  /// How many exercises on the Log page actually have a name typed in.
  function namedExerciseCount() {
    var count = 0;
    try {
      var inputs = document.querySelectorAll('#page-log .ex-inp');
      for (var i = 0; i < inputs.length; i++) {
        if ((inputs[i].value || '').trim()) count++;
      }
    } catch (e) { /* treat as none */ }
    return count;
  }

  /// Best-effort label for the Lock Screen: the last exercise the user named.
  function currentExercise() {
    try {
      var inputs = document.querySelectorAll('#page-log .ex-inp');
      for (var i = inputs.length - 1; i >= 0; i--) {
        var value = (inputs[i].value || '').trim();
        if (value) return value.slice(0, 40);
      }
    } catch (e) { /* fall through to no label */ }
    return '';
  }

  function logPageOpen() {
    var page = document.getElementById('page-log');
    return !!(page && page.classList.contains('active'));
  }

  /* ── Session ────────────────────────────────────────────────────────────
     The Live Activity is up for as long as the user is on the Log page, so
     the rest buttons are one glance away even mid-set.                     */

  function startSession() {
    if (sessionLive) return;
    sessionLive = true;
    lastExercise = currentExercise();
    post('restTimer', { op: 'session', exercise: lastExercise });
  }

  function endSession() {
    if (!sessionLive) return;
    sessionLive = false;
    restEndsAt = null;
    lastExercise = '';
    post('restTimer', { op: 'endSession' });
  }

  function syncExercise() {
    if (!sessionLive) return;
    var name = currentExercise();
    if (name === lastExercise) return;
    lastExercise = name;
    post('restTimer', { op: 'exercise', exercise: name });
  }

  /* ── Callbacks from native ───────────────────────────────────────────── */

  define(window, '__ltShowLog', function () {
    try {
      if (typeof window.goTab === 'function' && !logPageOpen()) window.goTab('log');
      startSession();
    } catch (e) { /* nothing sensible to do */ }
  });

  /// "Complete Workout" on the Lock Screen: the session is over and the user
  /// is back in the app to write the sets down.
  define(window, '__ltCompleteWorkout', function () {
    restEndsAt = null;
    lastExercise = '';
    // Native has already taken the activity down. Held "live" across the hop to
    // the Log page so the wrapped goTab below doesn't put a fresh one straight
    // back up; the next rest the user starts raises it again.
    sessionLive = true;
    try {
      if (typeof window.stopRest === 'function') window.stopRest();
      if (typeof window.goTab === 'function') window.goTab('log');
      if (typeof window.toast === 'function') window.toast('✓ Workout done — log your sets');
    } catch (e) { /* nothing sensible to do */ }
    sessionLive = false;
  });

  /// A rest was started (or ran out) on the Lock Screen while the page was
  /// frozen — put the in-app counter back on the same clock.
  define(window, '__ltRestSync', function (seconds) {
    var remain = Math.max(0, Math.round(Number(seconds) || 0));
    try {
      if (remain > 0) {
        if (typeof window.__ltStartRestLocal === 'function') {
          suppressNextBeep = false;
          restEndsAt = Date.now() + remain * 1000;
          window.__ltStartRestLocal(remain);
        }
      } else if (restEndsAt && typeof window.stopRest === 'function') {
        // Ran out while we were away: native already chimed for it.
        restEndsAt = null;
        suppressNextBeep = true;
        window.stopRest();
      }
    } catch (e) { /* nothing sensible to do */ }
  });

  var restWrapped = false;
  var sessionWrapped = false;

  function wrapRestTimer() {
    if (restWrapped) return true;
    if (typeof window.startRest !== 'function' || typeof window.stopRest !== 'function') return false;
    restWrapped = true;

    var originalStart = window.startRest;
    var originalStop = window.stopRest;
    var originalBeep = typeof window.restBeep === 'function' ? window.restBeep : null;

    // Lets __ltRestSync restart the page's own counter without reporting a
    // rest back to native that native started itself.
    define(window, '__ltStartRestLocal', function (seconds) {
      return originalStart.call(window, seconds);
    });

    window.startRest = function (seconds) {
      var result = originalStart.apply(this, arguments);
      var duration = Number(seconds) || 0;
      restEndsAt = Date.now() + duration * 1000;
      suppressNextBeep = false;
      startSession();
      lastExercise = currentExercise();
      post('restTimer', {
        op: 'start',
        seconds: duration,
        exercise: lastExercise,
        chime: chimeEnabled(),
      });
      return result;
    };

    window.stopRest = function () {
      restEndsAt = null;
      post('restTimer', { op: 'stop' });
      return originalStop.apply(this, arguments);
    };

    // If the rest expired while we were backgrounded the native chime has
    // already sounded — don't play the in-app beep again on return.
    if (originalBeep) {
      window.restBeep = function () {
        if (suppressNextBeep) { suppressNextBeep = false; return; }
        return originalBeep.apply(this, arguments);
      };
    }

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' &&
          chimeEnabled() && restEndsAt && Date.now() >= restEndsAt) {
        suppressNextBeep = true;
      }
    });

    return true;
  }

  /// The session follows the Log page: opening it raises the Live Activity,
  /// saving the workout takes it down.
  function wrapSession() {
    if (sessionWrapped) return true;
    if (typeof window.goTab !== 'function') return false;
    sessionWrapped = true;

    var originalGoTab = window.goTab;
    window.goTab = function (tab) {
      var result = originalGoTab.apply(this, arguments);
      if (tab === 'log') startSession();
      return result;
    };

    if (typeof window.saveWorkout === 'function') {
      var originalSave = window.saveWorkout;
      window.saveWorkout = function () {
        var before = namedExerciseCount();
        var result = originalSave.apply(this, arguments);
        // A successful save empties the log and re-renders it with one blank
        // card; a rejected one leaves what the user typed alone. That's the
        // only signal saveWorkout gives us that the workout is in the books.
        if (before && !namedExerciseCount()) endSession();
        return result;
      };
    }

    document.addEventListener('input', function (event) {
      var target = event.target;
      if (target && target.classList && target.classList.contains('ex-inp')) syncExercise();
    }, true);

    if (logPageOpen()) startSession();
    return true;
  }

  function injectChimeToggle() {
    var card = document.querySelector('.rest-card');
    if (!card || document.getElementById('lt-chime-row')) return;

    var row = document.createElement('div');
    row.id = 'lt-chime-row';
    row.className = 'lt-chime-row';
    row.innerHTML =
      '<span class="lt-chime-lbl">Chime when time’s up</span>' +
      '<button class="lt-chime-sw" id="lt-chime-sw" type="button" role="switch" ' +
      'aria-label="Chime when rest timer ends"><span></span></button>';
    card.appendChild(row);

    var toggle = row.querySelector('#lt-chime-sw');

    function paint() {
      var on = chimeEnabled();
      toggle.setAttribute('aria-checked', on ? 'true' : 'false');
      toggle.classList.toggle('on', on);
    }

    toggle.addEventListener('click', function () {
      if (chimeEnabled()) {
        shim.setItem(CHIME_KEY, '0');
        paint();
        return;
      }
      shim.setItem(CHIME_KEY, '1');
      paint();
      requestChimePermission().then(function (granted) {
        if (granted) {
          if (typeof window.toast === 'function') window.toast('🔔 Chime on');
        } else if (typeof window.toast === 'function') {
          window.toast('Allow notifications in Settings to use the chime');
        }
      });
    });

    paint();
  }

  /* ── App-shell polish ───────────────────────────────────────────────────
     Kill the long-press callout and stray text selection that make a
     WKWebView feel like a web page, while leaving inputs fully usable.    */

  function applyShellStyles() {
    if (!document.head || document.getElementById('lt-native-shell')) return;
    var style = document.createElement('style');
    style.id = 'lt-native-shell';
    style.textContent =
      'body{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;' +
      '-webkit-tap-highlight-color:transparent;overscroll-behavior:none;}' +
      'input,textarea,select,[contenteditable]{-webkit-user-select:auto;user-select:auto;}' +
      '.lt-chime-row{display:flex;align-items:center;gap:10px;margin-top:11px;' +
      'padding-top:11px;border-top:1.5px solid var(--border);}' +
      '.lt-chime-lbl{flex:1;font-size:10px;font-weight:800;text-transform:uppercase;' +
      'letter-spacing:.9px;color:var(--muted);}' +
      '.lt-chime-sw{width:42px;height:25px;flex:none;padding:0;border:1.5px solid var(--border);' +
      'border-radius:50px;background:var(--bg);cursor:pointer;position:relative;' +
      'transition:background .18s,border-color .18s;}' +
      '.lt-chime-sw span{position:absolute;top:2px;left:2px;width:17px;height:17px;' +
      'border-radius:50%;background:var(--muted);transition:transform .18s,background .18s;}' +
      '.lt-chime-sw.on{background:var(--core);border-color:transparent;}' +
      '.lt-chime-sw.on span{transform:translateX(17px);background:#fff;}';
    document.head.appendChild(style);
  }

  function setUp() {
    applyShellStyles();
    injectChimeToggle();
    if (!wrapRestTimer() || !wrapSession()) {
      // Page script hasn't defined its globals yet — try again once it has.
      window.addEventListener('load', function () {
        wrapRestTimer();
        wrapSession();
      }, { once: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setUp, { once: true });
  } else {
    setUp();
  }

  define(window, '__ltNative', true);
})();
