import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
const strip = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const helper = strip(read('src/server/cloudTechnicianCredentials.ts'));
const { createTechnicianCredentialSync } = await import('data:text/javascript;base64,' + Buffer.from(helper).toString('base64'));
const HASH = '$2b$10$' + 'a'.repeat(53);
const config = { cloudApiUrl: 'https://cloud.example', syncClientId: 'test-client', syncClientSecret: 'test-secret' };
function fixture() {
  return { users: [{id:'u1', role:'TECHNICIAN', status:'ACTIVE', isActive:true, passwordHash:HASH}],
    technicians: [{id:'t1', userId:'u1', employeeCode:'TECH-1', status:'AVAILABLE', isActive:true}],
    machines: [{id:'PROTECTED'}] };
}
function client(store, impl, cfg=config, timeoutMs=100) {
  return createTechnicianCredentialSync({getStore:()=>store, getConfig:()=>cfg, fetchImpl:impl, timeoutMs});
}
const ok = async () => ({ok:true, json:async()=>({success:true})});
test('sends exactly one linked account, hash only, no fleet fields, no store mutation', async()=>{
  const store=fixture(), original=JSON.stringify(store); let sent;
  const sync=client(store,async(url,req)=>{sent={url,req};return ok();});
  assert.equal((await sync('u1')).status,'SYNCED');
  const payload=JSON.parse(sent.req.body);
  assert.deepEqual(Object.keys(payload),['technicians']);
  assert.equal(payload.technicians.length,1); assert.equal(payload.technicians[0].id,'t1');
  assert.equal(payload.technicians[0].passwordHash,HASH);
  assert.equal(payload.technicians[0].password,undefined);
  assert.equal(sent.req.headers['x-sync-client-secret'],'test-secret');
  assert.equal(sent.req.redirect,'error'); assert.equal(JSON.stringify(store),original);
});
test('ordinary non-technician reset needs no Cloud request',async()=>{
  const s=fixture();s.users[0].role='VIEWER';s.technicians=[];
  assert.equal((await client(s,()=>assert.fail('must not call Cloud'))('u1')).status,'NOT_REQUIRED');
});
test('missing/ambiguous links and invalid hashes do not send credentials',async()=>{
  for(const change of [s=>s.technicians=[],s=>s.technicians.push({...s.technicians[0],id:'t2'}),
    s=>s.users[0].passwordHash='',s=>s.technicians[0].employeeCode='',
    s=>s.technicians.push({...s.technicians[0],id:'t2',userId:'u2'})]){
    const s=fixture();change(s);
    assert.equal((await client(s,()=>assert.fail('unexpected send'))('u1')).status,'FAILED');
  }
});
test('disabled/deleted accounts are never reactivated in Cloud',async()=>{
  for(const change of [s=>s.users[0].isActive=false,s=>s.users[0].isDeleted=true,
    s=>s.technicians[0].isActive=false,s=>s.technicians[0].status='DISABLED',s=>s.users[0].role='VIEWER']){
    const s=fixture();change(s);
    await client(s,async(_,r)=>{assert.equal(JSON.parse(r.body).technicians[0].status,'DISABLED');return ok();})('u1');
  }
});
test('configuration/auth/network failures return safe failure codes',async()=>{
  assert.equal((await client(fixture(),ok,{...config,syncClientSecret:''})('u1')).reason,'SYNC_NOT_CONFIGURED');
  assert.equal((await client(fixture(),()=>assert.fail(),{...config,cloudApiUrl:'http://external.example'})('u1')).reason,'UNSAFE_CLOUD_URL');
  const r=await client(fixture(),async()=>({ok:false,status:403,json:async()=>({secret:HASH})}))('u1');
  assert.deepEqual(r,{status:'FAILED',reason:'CLOUD_HTTP_403'});
  assert.equal((await client(fixture(),async()=>{throw new Error(HASH);})('u1')).reason,'CLOUD_REQUEST_FAILED');
  assert.equal((await client(fixture(),async()=>({ok:true,json:async()=>({success:false})}))('u1')).reason,'INVALID_CLOUD_RESPONSE');
});
test('timeout stops hung Cloud calls',async()=>{
  const sync=client(fixture(),(_,r)=>new Promise((resolve,reject)=>r.signal.addEventListener('abort',()=>reject(new Error('abort')))),config,5);
  assert.equal((await sync('u1')).reason,'CLOUD_REQUEST_FAILED');
});
test('concurrent deliveries serialize and use latest hash',async()=>{
  const s=fixture();let release;const gate=new Promise(r=>release=r);const hashes=[];
  const sync=client(s,async(_,r)=>{hashes.push(JSON.parse(r.body).technicians[0].passwordHash);if(hashes.length===1)await gate;return ok();});
  const first=sync('u1');await new Promise(r=>setImmediate(r));
  const second=sync('u1');s.users[0].passwordHash='$2b$10$'+'b'.repeat(53);
  release();await Promise.all([first,second]);assert.deepEqual(hashes,[HASH,s.users[0].passwordHash]);
});
const server=read('server.ts');
function resetHarness(role='SUPER_ADMIN',targetRole='TECHNICIAN',syncStatus='SYNCED'){
  const target={id:'u1',role:targetRole,passwordHash:HASH,password:'legacy'};
  const store={users:[target],auditLogs:[]};const revoked=[];let saves=0,calls=0;
  const start=server.indexOf('  const handleAdminPasswordReset =');
  const end=server.indexOf('  // Explicit Authenticated Admin Password Reset Endpoints',start);
  const context={getStore:()=>store,validatePasswordStrength:p=>({valid:typeof p==='string'&&p.length>=10,error:'weak'}),
    hashPassword:()=>'$2b$10$'+'c'.repeat(53),invalidateUserSessions:id=>revoked.push(id),
    saveStore:()=>saves++,sanitizeUserForClient:u=>({id:u.id}),syncTechnicianCredentials:async()=>{calls++;return {status:syncStatus};}};
  vm.createContext(context);vm.runInContext(strip(server.slice(start,end))+'\nglobalThis.handler=handleAdminPasswordReset;',context);
  const req={params:{id:'u1'},body:{newPassword:'New-password123'},user:{id:'admin',role}};
  let status=200,body;const res={status:n=>{status=n;return res;},json:b=>{body=b;return res;}};
  return {req,res,target,revoked,context,run:async()=>{await context.handler(req,res);return {status,body,saves,calls};}};
}
test('real reset handler enforces target role authorization',async()=>{
  for(const targetRole of ['ADMIN','SUPER_ADMIN']){
    const h=resetHarness('ADMIN',targetRole);const r=await h.run();assert.equal(r.status,403);assert.equal(r.calls,0);assert.equal(h.target.passwordHash,HASH);
  }
});
test('real reset handler rejects short and edge-space passwords',async()=>{
  for(const password of ['short',' New-password123']){const h=resetHarness();h.req.body.newPassword=password;assert.equal((await h.run()).status,400);assert.equal(h.target.passwordHash,HASH);}
});
test('reset saves locally, revokes Main sessions, reports partial Cloud failure',async()=>{
  const h=resetHarness('SUPER_ADMIN','TECHNICIAN','FAILED');const r=await h.run();
  assert.equal(r.body.success,true);assert.equal(r.body.passwordChanged,true);assert.equal(r.body.cloudSync.status,'FAILED');
  assert.equal(h.target.password,undefined);assert.deepEqual(h.revoked,['u1']);assert.equal(r.saves,1);assert.equal(r.calls,1);
  assert.equal(JSON.stringify(r.body).includes(HASH),false);
});
test('retry endpoint is admin protected and does not reset password',()=>{
  const a=server.indexOf("  apiRouter.post('/users/:id/sync-technician-credentials'");
  const b=server.indexOf('\n  });',a)+7;const src=server.slice(a,b);
  assert.match(src,/requireEnterpriseRole\(\['SUPER_ADMIN', 'ADMIN'\]\)/);
  assert.match(src,/target.role !== 'TECHNICIAN'/);assert.doesNotMatch(src,/hashPassword\(|passwordHash\s*=/);
});
const apiSource=read('src/services/api.ts');
const apiBlock=apiSource.slice(apiSource.indexOf('  async updateUser(id:'),apiSource.indexOf('\n  async deleteUser('));
test('API update errors propagate, never return local fake success',async()=>{
  const context={apiFetch:async()=>{throw new Error('SERVER_REJECTED');}};vm.createContext(context);
  vm.runInContext(strip('const api={'+apiBlock+'};')+'\nglobalThis.api=api;',context);
  await assert.rejects(context.api.updateUser('u1',{}),/SERVER_REJECTED/);
});
test('API password reset uses dedicated authenticated endpoint',async()=>{
  let call;const context={apiFetch:async(...args)=>{call=args;return {success:true};}};vm.createContext(context);
  vm.runInContext(strip('const api={'+apiBlock+'};')+'\nglobalThis.api=api;',context);
  await context.api.resetUserPassword('u1','New-password123');assert.equal(call[0],'/users/u1/reset-password');
  assert.equal(JSON.parse(call[1].body).newPassword,'New-password123');
});
const ui=read('src/components/views/UsersView.tsx');
function uiHarness(api){
  const results=[],toasts=[];const ctx={isUpdating:false,editingUser:{id:'u1',role:'TECHNICIAN'},editFullName:'ATASA',editEmail:'a@example.test',editPhone:'',editRole:'TECHNICIAN',editIsActive:true,editPassword:'New-password123',
    setEditingUser:()=>{},setIsUpdating:()=>{},setEditResult:m=>results.push(m),setEditPassword:()=>{},api,showToast:(...a)=>toasts.push(a),t:x=>x,loadUsers:async()=>{}};
  vm.createContext(ctx);const block=ui.slice(ui.indexOf('  const handleUpdateUser ='),ui.indexOf('\n  const handleOpenDelete'));
  vm.runInContext(strip(block)+'\nglobalThis.submit=handleUpdateUser;globalThis.retry=handleRetryCredentialSync;',ctx);
  return {ctx,results,toasts};
}
test('UI does not submit reset when profile save fails',async()=>{
  const h=uiHarness({updateUser:async()=>{throw new Error('Rejected');},resetUserPassword:()=>assert.fail()});
  await h.ctx.submit({preventDefault(){}});assert.equal(h.toasts.at(-1)[2],'error');assert.match(h.results.at(-1),/Rejected/);
});
test('UI separates password from profile and shows Cloud partial success',async()=>{
  const h=uiHarness({updateUser:async(_,u)=>{assert.equal(u.password,undefined);return {};},resetUserPassword:async()=>({success:true,passwordChanged:true,cloudSync:{status:'FAILED',reason:'CLOUD_HTTP_403'}})});
  await h.ctx.submit({preventDefault(){}});assert.equal(h.toasts.at(-1)[2],'warning');assert.match(h.results.at(-1),/CLOUD_HTTP_403/);
});
test('UI retry does not reset password or update profile',async()=>{
  const h=uiHarness({syncTechnicianCredentials:async id=>{assert.equal(id,'u1');return {success:true,cloudSync:{status:'SYNCED'}};}});
  await h.ctx.retry();assert.match(h.results.at(-1),/Cloud/);
});
