/* Two-device-local recovery checkpoints; optional folder storage needs explicit browser permission. */
(function () {
  'use strict';
  const startup = new Map();
  function database() {
    return new Promise((ok, fail) => {
      const pending = indexedDB.open('local-auto-backup-v1', 1);
      pending.onupgradeneeded = () => pending.result.createObjectStore('apps');
      pending.onsuccess = () => ok(pending.result);
      pending.onerror = () => fail(pending.error);
      pending.onblocked = () => fail(new Error('Close other app windows, then try again.'));
    });
  }
  function transaction(id, mode, operation) {
    const opened = startup.get('db') || database();
    startup.set('db', opened);
    return opened.then(db => new Promise((ok, fail) => {
      const tx = db.transaction('apps', mode), store = tx.objectStore('apps');
      const get = store.get(id);
      let result;
      get.onsuccess = () => {
        try {
          const data = get.result || { enabled: false, copies: [] };
          result = operation(data);
          if (mode === 'readwrite') store.put(data, id);
        } catch (error) { tx.abort(); fail(error); }
      };
      tx.oncomplete = () => ok(result);
      tx.onerror = tx.onabort = () => fail(tx.error || new Error('Device backup storage is unavailable.'));
    })).catch(error => { if (startup.get('db') === opened) startup.delete('db'); throw error; });
  }
  function node(tag, text) { const el = document.createElement(tag); if (text) el.textContent = text; return el; }
  function button(label, action) { const el = node('button',label); el.type = 'button'; el.addEventListener('click', action); el.style.cssText='min-height:44px;color:#172327;background:#f0f4f3;border:1px solid #788;border-radius:8px;padding:7px 12px;margin:3px;'; return el; }
  function validId(value) { return typeof value === 'string' && /^[a-z0-9-]{1,40}$/.test(value); }
  function identifier() { return Array.from(crypto.getRandomValues(new Uint8Array(16)), x => x.toString(16).padStart(2,'0')).join(''); }
  function setup(adapter) {
    const {id, read, write, validate} = adapter;
    if (!validId(id)) throw new Error('Invalid backup app ID.');
    const picker = typeof window.showDirectoryPicker === 'function';
    let enabled = false, revision = 0, queue = Promise.resolve(), dialog, body, notice, warning = '', restoring = false;
    const report = message => { warning = message; if (notice) notice.textContent = warning; };
    const init = transaction(id,'readonly',s => s.enabled).then(e => { enabled = e; }).catch(() => report('Device backup storage could not open.'));
    const safeRead = () => { const value = read(); if (value == null) return null; if (!validate(value)) throw new Error('App data did not pass backup validation. The previous copies are unchanged.'); return JSON.stringify(value); };
    function packageCopy(snapshot) {
      return {format:'local-auto-backup',version:1,app:id,savedAt:snapshot.savedAt,data:JSON.parse(snapshot.serialized)};
    }
    function asFile(snapshot) {
      return new File([JSON.stringify(packageCopy(snapshot),null,2)],id+'-auto-backup-'+snapshot.savedAt.replace(/[:.]/g,'-')+'.json',{type:'application/json'});
    }
    async function exportCopy(snapshot) {
      const file = asFile(snapshot);
      try {
        if (navigator.canShare && navigator.canShare({files:[file]})) {
          await navigator.share({files:[file],title:'Auto Backup'});
          return;
        }
        const url = URL.createObjectURL(file), link = node('a');
        link.href = url; link.download = file.name; document.body.append(link);
        link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url),30000);
      } catch(error) { if (error.name !== 'AbortError') report('Could not save the file. Your recovery copy is still on this device.'); }
    }
    async function writeFolder(folder, name, snapshot) {
      if ((await folder.queryPermission({mode:'readwrite'})) !== 'granted') throw new Error('Folder permission needs reconnecting. Device copies are current.');
      const handle = await folder.getFileHandle(name,{create:true});
      const stream = await handle.createWritable();
      try { await stream.write(JSON.stringify(packageCopy(snapshot))); await stream.close(); }
      catch(error) { await stream.abort().catch(()=>{}); throw error; }
    }
    async function mirror(state) {
      if (!state.directory || !state.copies.length) return;
      // These fixed slot names include an install-specific random ID. Never scan or remove anything in the chosen folder.
      if (state.copies[1]) await writeFolder(state.directory,`${id}-auto-backup-${state.folderId}-${state.copies[1].slot}.json`,state.copies[1]);
      await writeFolder(state.directory,`${id}-auto-backup-${state.folderId}-${state.copies[0].slot}.json`,state.copies[0]);
    }
    function serial(fn) { const task = queue.then(fn); queue = task.catch(()=>{}); return task; }
    function capture() {
      if (!enabled || restoring) return Promise.resolve();
      let serialized;
      try { serialized = safeRead(); }
      catch(error){ report(error.message); return Promise.resolve(); }
      if (serialized == null) return Promise.resolve();
      return serial(async () => {
        try {
          const state = await transaction(id,'readwrite',s => {
            if (!s.enabled || s.copies[0]?.serialized === serialized) return null;
            s.copies = [{serialized,savedAt:new Date().toISOString(),slot:1-(s.copies[0]?.slot ?? 1)},...s.copies.slice(0,1)];
            return s;
          });
          if(state) {
            await mirror(state).catch(error => {report(error.message);});
            if (dialog?.open) void draw();
          }
        } catch(error) { report('Could not create a recovery copy. Your app data and previous copies were not changed.'); }
      });
    }
    async function restore(serialized) {
      try {
        const value = JSON.parse(serialized);
        if (!validate(value)) throw new Error('Invalid backup.');
        if (!window.confirm('Restore this copy and replace the app data currently on this device?')) return;
        if (enabled) await capture(); // retain the state immediately before restoring
        restoring = true;
        await write(value);
        restoring = false;
        if (enabled) await capture();
        if (adapter.reload !== false) window.location.reload();
        else { adapter.afterRestore?.(); await draw(); }
      } catch(error) { restoring = false; report('Could not restore this backup. Check the file and available storage.'); }
    }
    async function draw() {
      const drawId = ++revision;
      const s = await transaction(id,'readonly',s=>s);
      if(drawId!==revision || !dialog.open) return;
      body.replaceChildren();
      const note = node('p',s.enabled ? 'On: saves the newest two distinct app states on this device. Clearing app or site data can erase these copies. Save a copy to Files for recovery outside the app.' : 'Turn on to keep the latest two recovery copies on this device. Nothing is uploaded.');
      body.append(note);
      body.append(button(s.enabled?'Turn off Auto Backup':'Turn on Auto Backup',async () => {
        try {
          enabled = await transaction(id,'readwrite',v=>v.enabled=!v.enabled);
          if (enabled) { await capture(); }
          await draw();
        } catch { report('Backup storage is unavailable.'); }
      }));
      if (picker && s.enabled) {
        body.append(button(s.directory ? 'Reconnect backup folder' : 'Choose backup folder',async () => {
          try {
            const directory = await window.showDirectoryPicker({mode:'readwrite',id:id+'-local-backup'});
            const state = await transaction(id,'readwrite',s => {
              s.directory = directory; s.folderId ||= identifier(); return s;
            });
            await serial(() => mirror(state));
            report('Folder connected. Only this installation’s two rotating backup files are written.');
            await draw();
          } catch(error) { if(error.name!=='AbortError')report('Could not write to this folder. Device copies remain available.'); }
        }));
        if(s.directory) body.append(node('p','Selected folder: '+s.directory.name));
      } else if (!picker) {
        body.append(node('p','This browser cannot write automatically to a Files folder. Use Save to Files on a recovery copy.'));
      }
      s.copies.forEach((snap,i) => {
        const row = node('div'), t = node('p',(i===0?'Most recent: ':'Previous: ')+new Date(snap.savedAt).toLocaleString());
        row.append(t,button('Save to Files',()=>{void exportCopy(snap);}),button('Restore copy',()=>{void restore(snap.serialized);}));
        body.append(row);
      });
      const input = node('input'); input.type='file'; input.accept='.json,application/json'; input.hidden=true;
      input.onchange = async () => {
        try {
          const [file] = input.files; if (!file) return;
          if (file.size > 50*1024*1024) throw new Error();
          const wrapper = JSON.parse(await file.text());
          if(wrapper.format!=='local-auto-backup'||wrapper.version!==1||wrapper.app!==id||!validate(wrapper.data))throw new Error();
          await restore(JSON.stringify(wrapper.data));
        } catch {report('That file is not a valid Auto Backup from this app.');}
        finally {input.value='';}
      };
      body.append(button('Restore from file',()=>input.click()),input);
    }
    function open() {
      if (!dialog) {
        dialog = node('dialog'); dialog.setAttribute('aria-label','Auto Backup');
        dialog.style.cssText='max-width:min(34rem,calc(100% - 24px));max-height:88dvh;border:1px solid #758482;border-radius:12px;padding:16px;background:#f8fbfa;color:#152422;overflow:auto;z-index:10000;';
        body = node('div'); notice = node('p'); notice.setAttribute('role','status'); notice.textContent = warning;
        dialog.append(node('h2','Auto Backup'),body,notice,button('Close',()=>dialog.close())); document.body.append(dialog);
      }
      if (!dialog.open) dialog.showModal();
      void draw().catch(()=>report('Backup storage is unavailable.'));
    }
    void init;
    return {open,capture};
  }
  window.TrackerBackup = {setup};
})();
