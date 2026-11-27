/* External Files folder Auto Backup. Browser storage holds permission metadata only. */
(function () {
  'use strict';
  function db(name,legacy=false) {
    return new Promise((resolve,reject)=>{
      const r=indexedDB.open(name,1);
      r.onupgradeneeded=()=>{if(legacy)r.transaction.abort();else r.result.createObjectStore('apps');};
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('Storage unavailable'));
    });
  }
  const databases=new Map();
  function getDb(name,legacy) { if(!databases.has(name))databases.set(name,db(name,legacy));return databases.get(name); }
  async function access(name,key,write,value,legacy=false){
    const database=await getDb(name,legacy);
    return new Promise((resolve,reject)=>{
      const tx=database.transaction('apps',write?'readwrite':'readonly'),store=tx.objectStore('apps');
      const r=write?store.put(value,key):store.get(key);
      tx.oncomplete=()=>resolve(r.result);
      tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Storage unavailable'));
    });
  }
  const active='external-auto-backup-v2', old='local-auto-backup-v1';
  const makeId=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
  const node=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el;};
  function button(label,fn){const el=node('button',label);el.type='button';el.style.cssText='min-height:44px;color:#172327;background:#f0f4f3;border:1px solid #788;border-radius:8px;padding:7px 12px;margin:3px;';el.onclick=fn;return el;}
  function setup(adapter){
    const {id,read,write,validate}=adapter;
    if(!/^[a-z0-9-]{1,40}$/.test(id))throw new Error('Invalid app ID');
    const picker=typeof window.showDirectoryPicker==='function';
    let config=null, q=Promise.resolve(), notice='', dialog, body, status, revision=0, restoring=false;
    function report(message){notice=message;if(status)status.textContent=message;}
    const cfg=picker?access(active,id,false).then(x=>{config=x||null;}).catch(()=>report('Folder preferences could not be read.')):Promise.resolve();
    const pack=(serialized,savedAt)=>({format:'local-auto-backup',version:1,app:id,savedAt,data:JSON.parse(serialized)});
    function parse(text){
      const wrapper=JSON.parse(text);
      if(!wrapper||wrapper.format!=='local-auto-backup'||wrapper.version!==1||wrapper.app!==id||!Number.isFinite(Date.parse(wrapper.savedAt))||!validate(wrapper.data))throw new Error('Invalid backup');
      return {serialized:JSON.stringify(wrapper.data),savedAt:wrapper.savedAt};
    }
    function fileName(c,slot){return `${id}-auto-backup-${c.folderId}-${slot}.json`;}
    async function files(c){
      if(await c.directory.queryPermission({mode:'readwrite'})!=='granted')throw new Error('Reconnect the selected folder to resume automatic backups.');
      const list=[];
      for(const slot of [0,1]){
        try{
          const handle=await c.directory.getFileHandle(fileName(c,slot)), file=await handle.getFile();
          list.push({...parse(await file.text()),slot});
        }catch(error){if(error.name!=='NotFoundError')throw new Error('An existing backup file could not be read. It was not overwritten.');}
      }
      return list.sort((a,b)=>Date.parse(b.savedAt)-Date.parse(a.savedAt));
    }
    async function persist(c,serialized){
      const backups=await files(c);
      if(backups[0]?.serialized===serialized)return;
      const slot=backups.length?(1-backups[0].slot):0;
      const time=Math.max(Date.now(),(backups.length?Date.parse(backups[0].savedAt)+1:0));
      const savedAt=new Date(time).toISOString(), data=JSON.stringify(pack(serialized,savedAt));
      // Only our installation's alternate slot is written, never the newest file or any unrelated file.
      const handle=await c.directory.getFileHandle(fileName(c,slot),{create:true}),stream=await handle.createWritable();
      try{await stream.write(data);await stream.close();}
      catch(error){await stream.abort().catch(()=>{});throw error;}
      if((await(await handle.getFile()).text())!==data)throw new Error('The new backup could not be verified.');
      report('Saved to '+c.directory.name+'.');
    }
    function snapshot(){const value=read();if(value==null)return null;if(!validate(value))throw new Error('The app data could not be validated.');return JSON.stringify(value);}
    function serial(fn){const result=q.then(fn);q=result.catch(()=>{});return result;}
    function capture(){
      if(!picker||restoring||!config?.enabled)return Promise.resolve();
      let data;try{data=snapshot();}catch(e){report(e.message);return Promise.resolve();}
      if(data===null)return Promise.resolve();
      const target=config;
      return serial(async()=>{
        if(!config?.enabled||config!==target)return;
        const lockName='external-autobackup:'+id+':'+target.folderId;
        try {
          if(navigator.locks?.request)await navigator.locks.request(lockName,()=>persist(target,data)); else await persist(target,data);
          if(dialog?.open)void draw();
        } catch(e){report(e.message||'The selected folder could not be written. No browser copy was made.');}
      });
    }
    async function share(snap){
      const file=new File([JSON.stringify(pack(snap.serialized,snap.savedAt),null,2)],id+'-backup-'+snap.savedAt.replace(/[:.]/g,'-')+'.json',{type:'application/json'});
      try{
        if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'Backup'});return;}
        const url=URL.createObjectURL(file),link=node('a');link.href=url;link.download=file.name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      }catch(e){if(e.name!=='AbortError')report('Could not save to Files.');}
    }
    async function restore(serialized){
      try{
        const data=JSON.parse(serialized);
        if(!validate(data))throw new Error();
        if(!window.confirm('Replace the app data currently on this device with this backup?'))return;
        restoring=true;await write(data);restoring=false;
        if(adapter.reload!==false)window.location.reload();else{adapter.afterRestore?.();await draw();}
      }catch(e){restoring=false;report('Could not restore this backup. Existing data may be exported first.');}
    }
    async function saveConfig(value){await access(active,id,true,value);config=value;}
    async function draw(){
      const rev=++revision;await cfg;
      const c=config;let prior=[],folder=[];
      try{prior=(await access(old,id,false,null,true))?.copies||[];}catch{}
      if(picker&&c?.enabled)try{folder=await files(c);}catch(e){report(e.message);}
      if(rev!==revision||!dialog.open)return;
      body.replaceChildren();
      body.append(node('p',picker?'Auto Backup writes only to your chosen folder and keeps two files. No automatic copies are stored in the browser.':'This browser cannot write automatically to a Files folder. No automatic copies are made. Use Save to Files to export manually.'));
      if(picker){
        body.append(button(c?.directory?'Choose or reconnect folder':'Choose backup folder',async()=>{
          try{
            const directory=await window.showDirectoryPicker({mode:'readwrite',id:id+'-external-backup'});
            const saved=await access(old,id,false,null,true).catch(()=>null);
            let folderId=makeId();
            for(const x of [c,saved]){
              if(x?.directory&&/^[a-f0-9]{32}$/.test(x.folderId)&&await directory.isSameEntry(x.directory).catch(()=>false)){folderId=x.folderId;break;}
            }
            await saveConfig({enabled:true,directory,folderId});
            await capture();await draw();
          }catch(e){if(e.name!=='AbortError')report(e.message||'Could not connect the folder.');}
        }));
        if(c?.enabled){
          body.append(node('p','Selected folder: '+c.directory.name));
          body.append(button('Turn off Auto Backup',async()=>{try{await saveConfig({...c,enabled:false});report('Auto Backup is off. Your Files copies were kept.');await draw();}catch{report('Could not turn off the setting.');}}));
        }
      }
      body.append(button('Save to Files now',()=>{try{const serialized=snapshot();if(serialized===null){report('There is no saved app data to export yet.');return;}void share({serialized,savedAt:new Date().toISOString()});}catch(e){report(e.message);}}));
      const show=(title,copies)=>{if(!copies.length)return;body.append(node('h3',title));copies.forEach((snap,i)=>{
        const row=node('div'), label=node('p',(i===0?'Most recent: ':'Previous: ')+new Date(snap.savedAt).toLocaleString());
        row.append(label,button('Save to Files',()=>void share(snap)),button('Restore copy',()=>void restore(snap.serialized)));body.append(row);
      });};
      show('Copies in the selected folder',folder);show('Previous device copies (no longer updated)',prior);
      const input=node('input');input.type='file';input.accept='.json,application/json';input.hidden=true;
      input.onchange=async()=>{try{const file=input.files[0];if(!file)return;if(file.size>50*1024*1024)throw new Error();await restore(parse(await file.text()).serialized);}catch{report('That file is not a valid Auto Backup from this app.');}finally{input.value='';}};
      body.append(button('Restore from file',()=>input.click()),input);
    }
    function open(){
      if(!dialog){
        dialog=node('dialog');dialog.setAttribute('aria-label','Auto Backup');dialog.style.cssText='max-width:min(34rem,calc(100% - 24px));max-height:88dvh;border:1px solid #758482;border-radius:12px;padding:16px;background:#f8fbfa;color:#152422;overflow:auto;';
        body=node('div');status=node('p',notice);status.setAttribute('role','status');dialog.append(node('h2','Auto Backup'),body,status,button('Close',()=>dialog.close()));document.body.append(dialog);
      }
      if(!dialog.open)dialog.showModal();void draw().catch(()=>report('Backup settings could not be loaded.'));
    }
    return {open,capture};
  }
  window.TrackerBackup={setup};
})();
