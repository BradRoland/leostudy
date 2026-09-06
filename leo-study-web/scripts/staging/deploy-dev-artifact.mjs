// Deploy only an explicitly approved artifact to the isolated development stack.
// Neither the production checkout nor its Coolify application is used.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

assert.ok(process.argv.includes('--deploy-approved-dev'), 'Explicit development deployment authorization is required.')
const release = process.argv[process.argv.indexOf('--release') + 1]
const artifactPath = process.argv[process.argv.indexOf('--artifact') + 1]
assert.match(release || '', /^[a-z0-9][a-zA-Z0-9-]{3,80}$/)
assert.ok(artifactPath && process.argv.includes('--artifact'))
const root = fileURLToPath(new URL('../../', import.meta.url))
assert.equal(spawnSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).stdout.trim(), 'codex/class180-ui-overhaul-test', 'Use the approved test worktree.')
const artifact = await readFile(artifactPath)
const artifactSha256 = createHash('sha256').update(artifact).digest('hex')
const dockerfile = await readFile(new URL('../../ops/dev-preview/Dockerfile.runtime', import.meta.url), 'utf8')
const environment = {
  ...process.env,
  SSH_ASKPASS: fileURLToPath(new URL('../../.staging-runtime.local/askpass.sh', import.meta.url)),
  SSH_ASKPASS_REQUIRE: 'force', DISPLAY: 'codex',
  CLASS180_TEST_KEYCHAIN_SERVICE: 'brads-lab-truenas-192.168.1.1',
  CLASS180_TEST_SSH_USER: 'truenas_admin',
}
const credential = spawnSync('/usr/bin/security', ['find-generic-password', '-s', environment.CLASS180_TEST_KEYCHAIN_SERVICE, '-a', environment.CLASS180_TEST_SSH_USER, '-w'], { encoding: 'utf8' })
assert.equal(credential.status, 0, 'Existing server credential is unavailable.')
const source = `import base64,hashlib,io,json,os,pathlib,subprocess,tarfile
root=pathlib.Path('/mnt/tank2/stacks/class180-ui-test-20260906');compose_path=root/'compose.json';compose=json.loads(compose_path.read_text())
assert compose['name']=='class180-ui-test-20260906'
assert 'codex_class180_ui_test_20260906' in compose['services']['auth']['environment']['GOTRUE_DB_DATABASE_URL']
runtime=(root/'web/runtime.env').read_text();assert 'DISABLE_LIVE_INTEGRATIONS=true' in runtime and 'SUPABASE_URL=http://gateway' in runtime
release_id=${JSON.stringify(release)};release=root/'web/releases'/release_id;release.mkdir(parents=True,exist_ok=False,mode=0o700)
payload=base64.b64decode(${JSON.stringify(artifact.toString('base64'))});assert hashlib.sha256(payload).hexdigest()==${JSON.stringify(artifactSha256)}
with tarfile.open(fileobj=io.BytesIO(payload),mode='r:gz') as tar:
 for entry in tar.getmembers():
  path=pathlib.PurePosixPath(entry.name)
  assert not path.is_absolute() and '..' not in path.parts and not entry.issym() and not entry.islnk()
  assert path.parts and path.parts[0] in {'dist','backend','package.json','package-lock.json'} and '.env' not in entry.name
 tar.extractall(release,filter='data')
(release/'Dockerfile.runtime').write_text(${JSON.stringify(dockerfile)})
old_image=compose['services']['web']['image']
compose['services']['web']['build']={'context':'./web/releases/'+release_id,'dockerfile':'Dockerfile.runtime'}
compose['services']['web']['image']='180-academy-dev:'+release_id.lower()
compose_path.write_text(json.dumps(compose,indent=2)+'\\n');os.chmod(compose_path,0o600)
subprocess.run(['docker','compose','-f',str(compose_path),'build','web'],check=True)
subprocess.run(['docker','compose','-f',str(compose_path),'up','-d','--no-deps','web'],check=True)
metadata=json.loads((root/'web/deployment-metadata.json').read_text())
metadata.update({'previousImage':old_image,'releaseId':release_id,'artifactSha256':hashlib.sha256(payload).hexdigest(),'origin':'http://192.168.1.1:55434'})
(root/'web/deployment-metadata.json').write_text(json.dumps(metadata,indent=2)+'\\n')
print(json.dumps({'deployedRelease':release_id,'artifactSha256':metadata['artifactSha256'],'previousImage':old_image}))
`
const child = spawn('ssh', ['-o', 'PreferredAuthentications=password', '-o', 'PubkeyAuthentication=no', '-o', 'NumberOfPasswordPrompts=1', 'truenas_admin@192.168.1.1', "sudo -S -p '' python3 -"], { cwd: root, env: environment, stdio: ['pipe', 'inherit', 'inherit'] })
child.stdin.end(credential.stdout.trim() + '\n' + source)
child.on('error', error => { console.error(error.message); process.exit(1) })
child.on('exit', code => process.exit(code ?? 1))
