const vm=require('node:vm');const fs=require('node:fs');const assert=require('node:assert/strict');let requests=[];
const self={fetch:(input,options)=>{requests.push({input,options});return Promise.resolve('download')}};
vm.runInNewContext(fs.readFileSync(require.resolve('../voice-worker.js'),'utf8'),{self,URL});
(async()=>{
await self.fetch('https://huggingface.co/Xenova/whisper-tiny.en/config.json');assert.equal(requests.length,1);assert.equal(requests[0].options.credentials,'omit');
assert.throws(()=>self.fetch('https://example.com/transcribe',{method:'POST',body:'audio'}),/blocked/);
assert.throws(()=>self.fetch('https://huggingface.co/upload',{method:'POST',body:'transcript'}),/blocked/);
assert.throws(()=>self.fetch('https://example.com/track'),/blocked/);
assert.equal(requests.length,1);console.log('Voice privacy: download allowed; uploads and other hosts blocked');
})();
