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
      'input,textarea,select,[contenteditable]{-webkit-user-select:auto;user-select:auto;}';
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyShellStyles, { once: true });
  } else {
    applyShellStyles();
  }

  define(window, '__ltNative', true);
})();
