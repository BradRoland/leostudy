import socket,sys,selectors,os,json,base64
sel=selectors.DefaultSelector();sel.register(0,selectors.EVENT_READ)
sockets={};input_buffer=b''
os.set_blocking(0,False)
def output(msg):
 sys.stdout.buffer.write(json.dumps(msg,separators=(',',':')).encode()+b'\n');sys.stdout.buffer.flush()
def close(ident):
 s=sockets.pop(ident,None)
 if s:
  try:sel.unregister(s)
  except Exception:pass
  s.close()
 output({'id':ident,'event':'close'})
while True:
 for key,_ in sel.select():
  if key.fileobj==0:
   chunk=os.read(0,65536)
   if not chunk:raise SystemExit(0)
   input_buffer+=chunk
   while b'\n' in input_buffer:
    line,input_buffer=input_buffer.split(b'\n',1)
    m=json.loads(line);ident=m['id'];event=m['event']
    try:
     if event=='connect':
      port=int(m['port'])
      if port not in (55431,55432,55433) or len(sockets)>=128:raise ValueError('Test relay boundary')
      s=socket.create_connection(('127.0.0.1',port),timeout=10);s.setblocking(False);sockets[ident]=s;sel.register(s,selectors.EVENT_READ,ident)
      output({'id':ident,'event':'ready'})
     elif event=='data' and ident in sockets:
      s=sockets[ident];s.setblocking(True);s.sendall(base64.b64decode(m['data']));s.setblocking(False)
     elif event=='close':close(ident)
    except Exception:close(ident)
  else:
   ident=key.data
   try:
    data=key.fileobj.recv(65536)
    if data:output({'id':ident,'event':'data','data':base64.b64encode(data).decode()})
    else:close(ident)
   except Exception:close(ident)
