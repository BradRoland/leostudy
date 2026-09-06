// Starts only the explicitly configured isolated stack. Stop with Ctrl+C.
import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import net from 'node:net'
import { parse } from 'dotenv'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')
const env=parse(await readFile(path.join(root,'.env.staging.local')))
if(env.SUPABASE_URL!=='http://127.0.0.1:55431'||env.SMTP_HOST!=='127.0.0.1')throw Error('Refusing to start: isolated localhost API and mail sink are required.')
for(const port of [5176,8789,55431,55432,55433]){
 const available=await new Promise(resolve=>{
  const server=net.createServer();server.once('error',()=>resolve(false))
  server.listen(port,'127.0.0.1',()=>server.close(()=>resolve(true)))
 })
 if(!available)throw Error(`Test port ${port} is already in use. Stop the previous local test processes before starting this helper.`)
}
const runtime=path.join(root,'.staging-runtime.local');await mkdir(runtime,{recursive:true,mode:0o700})
const askpass=path.join(runtime,'askpass.sh')
await writeFile(askpass,'#!/bin/sh\nexec /usr/bin/security find-generic-password -s "$CLASS180_TEST_KEYCHAIN_SERVICE" -a "$CLASS180_TEST_SSH_USER" -w\n',{mode:0o700})
const childEnv={...process.env,...env,HOST:'127.0.0.1',PORT:'8789',SSH_ASKPASS:askpass,SSH_ASKPASS_REQUIRE:'force',DISPLAY:'codex',CLASS180_TEST_KEYCHAIN_SERVICE:process.env.CLASS180_TEST_KEYCHAIN_SERVICE||'brads-lab-truenas-192.168.1.1',CLASS180_TEST_SSH_USER:process.env.CLASS180_TEST_SSH_USER||'truenas_admin'}
// Refresh the non-secret relay program through the authorized SSH session.
const upload=spawn('ssh',['-o','PreferredAuthentications=password','-o','PubkeyAuthentication=no','-o','NumberOfPasswordPrompts=1',childEnv.CLASS180_TEST_SSH_TARGET||'truenas_admin@192.168.1.1','umask 077; mkdir -p .cache/class180-ui-test; cat > .cache/class180-ui-test/relay.py'],{cwd:root,env:childEnv,stdio:['pipe','inherit','inherit']})
upload.stdin.end(await readFile(path.join(root,'scripts/staging/remote-relay.py')))
if(await new Promise(resolve=>upload.on('close',resolve))!==0)throw Error('Could not prepare the isolated SSH relay.')
const children=[]
const run=(file,args)=>{const child=spawn(file,args,{cwd:root,env:childEnv,stdio:'inherit'});children.push(child);child.on('error',error=>{console.error(error.message);stop(1)});child.on('exit',code=>{if(!stopping)stop(code||1)});return child}
let stopping=false
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');setTimeout(()=>process.exit(code),500).unref()}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop())
run(process.execPath,['scripts/staging/relay.mjs'])
let ready=false
for(let i=0;i<30;i++){
 try{const r=await fetch('http://127.0.0.1:55431/auth/v1/health');if(r.ok){ready=true;break}}catch{/* relay is starting */}
 await new Promise(resolve=>setTimeout(resolve,300))
}
if(!ready){console.error('Test API unavailable. Check the isolated server stack and relay file.');stop(1)}
else{
 run(process.execPath,['backend/coolify-server.mjs'])
 run(process.execPath,['node_modules/vite/bin/vite.js','--mode','staging','--host','127.0.0.1','--port','5176','--strictPort'])
 console.log('Test preview: http://127.0.0.1:5176 · Mail sink: http://127.0.0.1:55432 · Stop local processes with Ctrl+C. The cloned database is retained.')
}
