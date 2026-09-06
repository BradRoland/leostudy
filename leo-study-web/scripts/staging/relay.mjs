import net from 'node:net';import {spawn} from 'node:child_process';
const child=spawn('ssh',['-o','PreferredAuthentications=password','-o','PubkeyAuthentication=no','-o','NumberOfPasswordPrompts=1','-o','ServerAliveInterval=30',process.env.CLASS180_TEST_SSH_TARGET || 'truenas_admin@192.168.1.1','python3','.cache/class180-ui-test/relay.py'],{stdio:['pipe','pipe','pipe']});
const sockets=new Map();let next=0,buffer='';
const servers=[];let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const server of servers)server.close();for(const socket of sockets.values())socket.destroy();child.kill('SIGTERM');setTimeout(()=>process.exit(code),100).unref()}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
const send=m=>child.stdin.write(JSON.stringify(m)+'\n');
child.stderr.on('data',d=>process.stderr.write(d));
child.stdout.on('data',chunk=>{buffer+=chunk;let at;while((at=buffer.indexOf('\n'))>=0){const m=JSON.parse(buffer.slice(0,at));buffer=buffer.slice(at+1);const socket=sockets.get(m.id);if(!socket)continue;if(m.event==='data')socket.write(Buffer.from(m.data,'base64'));if(m.event==='ready')socket.resume();if(m.event==='close'){sockets.delete(m.id);socket.destroy();}}});
child.on('close',code=>{if(!stopping)console.error('Test relay ended',code);stop(code||0)});
child.stdin.on('error',()=>stop(1));
for(const port of [55431,55432,55433]){
 const server=net.createServer(socket=>{const id=String(++next);sockets.set(id,socket);socket.pause();send({id,event:'connect',port});socket.on('data',data=>send({id,event:'data',data:data.toString('base64')}));socket.on('close',()=>{sockets.delete(id);if(!stopping)send({id,event:'close'})});socket.on('error',()=>socket.destroy());});
 server.on('error',error=>{console.error(error.message);stop(1)});servers.push(server);
 server.listen(port,'127.0.0.1',()=>console.log('Isolated multiplexed relay ready on 127.0.0.1:'+port));
}
