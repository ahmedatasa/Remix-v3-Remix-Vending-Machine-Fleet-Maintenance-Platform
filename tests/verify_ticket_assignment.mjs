import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// All data, compiled modules and storage stay in a disposable OS temp directory.
const root = fileURLToPath(new URL('../', import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-ticket-assignment-'));
const requireHere = createRequire(import.meta.url);
fs.symlinkSync(path.dirname(requireHere.resolve('typescript/package.json')).replace(/[/\\]typescript$/, ''), path.join(tmp, 'node_modules'), 'junction');
process.env.NODE_ENV = 'test';
process.env.CLOUD_DATABASE_URL = '';
process.env.CLOUD_DATABASE_FILE = path.join(tmp, 'unused-cloud.json');
process.env.CLOUD_STORAGE_DIR = path.join(tmp, 'storage');
process.env.CLOUD_STORAGE_PROVIDER = 'local';
process.env.CLOUD_MANAGEMENT_CLIENT_ID = 'test-manager';
process.env.CLOUD_MANAGEMENT_CLIENT_SECRET = 'test-only-management-secret';
const strip = source => ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true
} }).outputText;
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
function compileFolder(relative) {
  for (const entry of fs.readdirSync(path.join(root, relative), {withFileTypes:true})) {
    const rel = path.join(relative, entry.name);
    if (entry.isDirectory()) compileFolder(rel);
    else if (rel.endsWith('.ts')) {
      const output = path.join(tmp, rel.replace(/\.ts$/, '.js'));
      fs.mkdirSync(path.dirname(output), { recursive:true }); fs.writeFileSync(output, strip(read(rel)));
    }
  }
}
compileFolder('cloud/src');
for (const name of ['mainTicketAssignment', 'cloudTicketAssignmentClient']) {
  const dir = path.join(tmp, 'src/server'); fs.mkdirSync(dir, {recursive:true});
  fs.writeFileSync(path.join(dir, name+'.js'), strip(read('src/server/'+name+'.ts')));
}
const load = rel => requireHere(path.join(tmp, rel));
const { CloudDatabase } = load('cloud/src/db/cloudDb.js');
const { JsonCloudRepositoryManager } = load('cloud/src/repositories/jsonRepository.js');
const { setActiveRepository } = load('cloud/src/repositories/index.js');
const { createCloudApp } = load('cloud/src/app.js');
const { createMainTicketAssignmentHandler } = load('src/server/mainTicketAssignment.js');
const { syncCloudTicketAssignment } = load('src/server/cloudTicketAssignmentClient.js');
const { listTechnicianTickets } = load('cloud/src/services/ticketAssignmentService.js');
const databaseFile = path.join(tmp, 'fixture.json');
let repo = new JsonCloudRepositoryManager(new CloudDatabase(databaseFile));
setActiveRepository(repo);
const tech = id => ({id, employeeCode:id, fullName:id, email:id+'@example.test', passwordHash:'fixture-unused', status:'ACTIVE'});
const ticket = id => ({id, cloudReportId:'report-'+id, trackingToken:'track-'+id,
  integrationMachineId:'machine-1', publicQrToken:'QR-TEST', category:'CARD_POS', description:'fixture report',
  reporterName:'private-customer', reporterPhone:'private-phone', reporterEmail:'private-email',
  status:'OPEN', syncStatus:'PENDING', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(),
  checkins:[], actions:[], evidence:[], functionalTests:[], partRequests:[]});
await repo.technicians.saveTechnician(tech('tech-1')); await repo.technicians.saveTechnician(tech('tech-2'));
await repo.machines.bootstrapRegistry([{integrationMachineId:'machine-1', publicQrToken:'QR-TEST', machineNumber:'1',
  publicDisplayName:'Machine 1', machineType:'fixture', buildingPublicName:'building', locationPublicName:'location',
  latitude:24.7, longitude:46.6, active:true, version:1, lastSyncedAt:new Date().toISOString()}]);
for (const id of ['t1','t2','t3','done']) await repo.tickets.createTicket(ticket(id));
await repo.tickets.updateTicketStatus('done','RESOLVED');
const beforeMachine = JSON.stringify(await repo.machines.findByIntegrationId('machine-1'));
async function session(id, expiresAt=new Date(Date.now()+60000).toISOString()) {
  const raw=crypto.randomBytes(24).toString('hex');
  await repo.sessions.createSession({sessionId:crypto.randomUUID(),tokenHash:crypto.createHash('sha256').update(raw).digest('hex'),
    technicianId:id,employeeCode:id,fullName:id,createdAt:new Date().toISOString(),expiresAt});
  return raw;
}
const token1=await session('tech-1'), token2=await session('tech-2');
const app=createCloudApp();
const server=await new Promise(resolve=>{ const s=app.listen(0,'127.0.0.1',()=>resolve(s)); });
const base=`http://127.0.0.1:${server.address().port}`;
const management=(role='ADMIN')=>({'x-management-client-id':'test-manager','x-management-client-secret':'test-only-management-secret',
  'x-management-actor-id':'admin-1','x-management-actor-name-b64':Buffer.from('Test Admin').toString('base64url'),'x-management-actor-role':role});
async function call(route, {token, body, headers={}}={}) {
  const res=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{...headers,...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:res.status, data:await res.json(), headers:res.headers};
}
const assignment=(technicianId='tech-1',revision=1)=>({technicianId,revision,mainTicketNumber:'TCK-TEST'});
after(async()=>{ await new Promise(resolve=>server.close(resolve)); setActiveRepository(null); fs.rmSync(tmp,{recursive:true,force:true}); });

test('Cloud assignment requires M2M credentials and an authorized manager role',async()=>{
  assert.equal((await call('/api/tickets/t1/assignment',{body:assignment()})).status,403);
  assert.equal((await call('/api/tickets/t1/assignment',{body:assignment(),headers:management('TECHNICIAN')})).status,403);
  assert.equal((await call('/api/tickets/t1/assignment',{body:assignment(),headers:management()})).status,200);
});
test('assignment validates technician, revision, ticket existence and terminal status',async()=>{
  for (const [id,body,status] of [['missing',assignment(),404],['t2',assignment('missing'),409],['done',assignment(),409],['t2',assignment('tech-1',0),400]]) {
    assert.equal((await call(`/api/tickets/${id}/assignment`,{body,headers:management()})).status,status);
  }
});
test('technician list requires a valid nonexpired session',async()=>{
  assert.equal((await call('/technician/tickets')).status,401);
  assert.equal((await call('/technician/tickets',{token:'invalid'})).status,401);
  const expired=await session('tech-1',new Date(Date.now()-1000).toISOString());
  assert.equal((await call('/technician/tickets',{token:expired})).status,401);
});
test('list uses session identity, includes only own active tickets and returns safe DTO',async()=>{
  const result=await call('/technician/tickets?technicianId=tech-2',{token:token1});
  assert.equal(result.status,200); assert.equal(result.headers.get('cache-control'),'no-store');
  assert.deepEqual(result.data.map(t=>t.id),['t1']);
  const row=result.data[0];assert.equal(row.ticketNumber,'TCK-TEST');assert.equal(row.machine.publicQrToken,'QR-TEST');
  for (const key of ['reporterPhone','reporterEmail','reporterName','trackingToken','passwordHash','tokenHash']) assert.equal(row[key],undefined);
  assert.deepEqual((await call('/technician/tickets',{token:token2})).data,[]);
});
test('retry is idempotent, delayed revision cannot overwrite reassignment',async()=>{
  const original=await repo.tickets.findById('t1');
  assert.equal((await call('/api/tickets/t1/assignment',{body:assignment(),headers:management()})).status,200);
  assert.equal((await repo.tickets.findById('t1')).assignedAt,original.assignedAt);
  assert.equal((await call('/api/tickets/t1/assignment',{body:assignment('tech-2',2),headers:management()})).status,200);
  assert.equal((await call('/api/tickets/t1/assignment',{body:assignment(),headers:management()})).status,409);
  assert.equal((await call('/api/tickets/t1/assignment',{body:assignment('tech-1',2),headers:management()})).status,409);
  assert.deepEqual((await call('/technician/tickets',{token:token1})).data,[]);
  assert.deepEqual((await call('/technician/tickets',{token:token2})).data.map(t=>t.id),['t1']);
});
test('direct field mutations reject another technician or an unassigned ticket before storage',async()=>{
  for (const route of ['checkin','evidence','action','test','part-request','resolve']) {
    for (const id of ['t1','t2']) assert.equal((await call('/technician/'+route,{token:token1,body:{ticketId:id,imageBase64:'abcd'}})).status,403);
  }
  assert.equal(fs.readdirSync(path.join(tmp,'storage')).length,0);
});
test('disabled or deleted technician accounts cannot list tickets',async()=>{
  const account=tech('tech-2');account.status='DISABLED';await repo.technicians.saveTechnician(account);
  assert.equal((await call('/technician/tickets',{token:token2})).status,403);
  await repo.technicians.saveTechnician(tech('tech-2'));
  const orphan=await session('missing-tech');assert.equal((await call('/technician/tickets',{token:orphan})).status,403);
});
test('assignment survives JSON repository recreation and leaves fleet and ticket counts unchanged',async()=>{
  repo=new JsonCloudRepositoryManager(new CloudDatabase(databaseFile));setActiveRepository(repo);
  assert.equal((await repo.tickets.findById('t1')).assignedTechnicianId,'tech-2');
  assert.equal(await repo.tickets.count(),4);assert.equal(JSON.stringify(await repo.machines.findByIntegrationId('machine-1')),beforeMachine);
});
test('logout revokes the server session',async()=>{
  const token=await session('tech-1');assert.equal((await call('/technician/logout',{token,body:{}})).status,200);
  assert.equal((await call('/technician/tickets',{token})).status,401);
});
function response(){return {code:200,status(n){this.code=n;return this;},json(data){this.data=data;return this;}};}
function mainFixture(){return {tickets:[{id:'main-1',ticketNumber:'TCK-TEST',cloudTicketId:'t3',status:'OPEN'}],technicians:[{id:'tech-1',fullName:'one',status:'AVAILABLE',isActive:true},{id:'tech-2',status:'AVAILABLE',isActive:true}],machines:[{id:'PROTECTED'}],auditLogs:[]};}
const req=(id='tech-1')=>({params:{id:'main-1'},body:{technician_id:id},user:{id:'admin-1',role:'ADMIN',fullName:'Test Admin'}});
test('Main rejects unknown/inactive technician and unauthorized caller without mutations',async()=>{
  const store=mainFixture(), original=JSON.stringify(store);let sends=0;
  const handler=createMainTicketAssignmentHandler({getStore:()=>store,saveStore:()=>{},sync:async()=>{sends++;}});
  let res=response();await handler(req('missing'),res);assert.equal(res.code,400);
  res=response();await handler({...req(),user:{id:'tech-1',role:'TECHNICIAN'}},res);assert.equal(res.code,403);
  assert.equal(sends,0);assert.equal(JSON.stringify(store),original);
});
test('Main partial failure persists intent; same-technician retry keeps revision/history',async()=>{
  const store=mainFixture();let failure=true,saves=0;
  const handler=createMainTicketAssignmentHandler({getStore:()=>store,saveStore:()=>saves++,sync:async()=>failure?{status:'FAILED',reason:'CLOUD_HTTP_502'}:{status:'SYNCED'}});
  let res=response();await handler(req(),res);assert.equal(res.data.cloudAssignmentSync.status,'FAILED');assert.equal(res.data.assignmentRevision,1);
  failure=false;res=response();await handler(req(),res);assert.equal(res.data.cloudAssignmentSync.status,'SYNCED');
  assert.equal(store.tickets[0].timeline.length,1);assert.equal(store.tickets[0].assignmentRevision,1);assert.equal(saves,4);
});
test('Main per-ticket concurrency guard prevents overlapping assignment writes',async()=>{
  const store=mainFixture();let release;const waiting=new Promise(r=>release=r);
  const handler=createMainTicketAssignmentHandler({getStore:()=>store,saveStore:()=>{},sync:async()=>{await waiting;return {status:'SYNCED'};}});
  const first=handler(req(),response());const second=response();await handler(req('tech-2'),second);assert.equal(second.code,409);release();await first;
});
test('Main does not downgrade active work or reopen terminal tickets',async()=>{
  const store=mainFixture();store.tickets[0].status='IN_PROGRESS';const handler=createMainTicketAssignmentHandler({getStore:()=>store,saveStore:()=>{},sync:async()=>({status:'SYNCED'})});
  await handler(req(),response());assert.equal(store.tickets[0].status,'IN_PROGRESS');store.tickets[0].status='CLOSED';const res=response();await handler(req(),res);assert.equal(res.code,409);
});
test('real Main client sends targeted assignment to Cloud and verifies confirmation',async()=>{
  process.env.CLOUD_API_URL=base;
  const ticket={cloudTicketId:'t3',assignedTechnicianId:'tech-1',assignmentRevision:1,ticketNumber:'TCK-TEST'};
  assert.equal((await syncCloudTicketAssignment(req(),ticket)).status,'SYNCED');
  assert.equal((await repo.tickets.findById('t3')).assignedTechnicianId,'tech-1');
  process.env.CLOUD_MANAGEMENT_CLIENT_SECRET='wrong';assert.equal((await syncCloudTicketAssignment(req(),ticket)).reason,'CLOUD_HTTP_403');
  process.env.CLOUD_MANAGEMENT_CLIENT_SECRET='test-only-management-secret';
  assert.equal((await syncCloudTicketAssignment(req(),{})).status,'NOT_REQUIRED');
});
test('API assignment failure propagates instead of mutating browser store',async()=>{
  const source=read('src/services/api.ts');const block=source.slice(source.indexOf('  async assignTicket('),source.indexOf('  async triageTicket('));
  const ctx={apiFetch:async()=>{throw new Error('NETWORK_FAILED');}};vm.createContext(ctx);
  vm.runInContext(strip('const api={'+block+'};')+'\nglobalThis.api=api;',ctx);
  await assert.rejects(ctx.api.assignTicket('t','tech'),/NETWORK_FAILED/);
  ctx.apiFetch=async()=>({cloudAssignmentSync:{status:'FAILED',reason:'CLOUD_HTTP_502'}});
  await assert.rejects(ctx.api.assignTicket('t','tech'),/Main.*Cloud/);
});
test('portal distinguishes HTTP/format failures from genuine empty list',async()=>{
  const source=read('src/components/views/TechnicianMobilePortal.tsx');const block=source.slice(source.indexOf('  const loadTickets ='),source.indexOf('\n  useEffect(() => {',source.indexOf('  const loadTickets =')));
  const state={};const ctx={token:'test',ticketRequest:{current:0},setIsLoadingTickets:x=>state.loading=x,setTicketsError:x=>state.error=x,setTickets:x=>state.tickets=x,fetch:async()=>({ok:false,status:404,json:async()=>({message:'ROUTE_NOT_FOUND'})})};vm.createContext(ctx);
  vm.runInContext(strip(block)+'\nglobalThis.load=loadTickets;',ctx);await ctx.load();assert.equal(state.error,'ROUTE_NOT_FOUND');
  ctx.fetch=async()=>({ok:true,json:async()=>({tickets:[]})});await ctx.load();assert.ok(state.error);
  ctx.fetch=async()=>({ok:true,json:async()=>[]});await ctx.load();assert.equal(state.error,null);assert.equal(state.tickets.length,0);
});
test('portal logout calls server before clearing local session',async()=>{
  const source=read('src/components/views/TechnicianMobilePortal.tsx');const block=source.slice(source.indexOf('  const handleLogout ='),source.indexOf('\n  // Request GPS'));
  let removed=0,called='';const ctx={token:'test',ticketRequest:{current:0},window:{},localStorage:{removeItem:()=>removed++},setToken:()=>{},setTechnician:()=>{},setTickets:()=>{},setSelectedTicket:()=>{},setTicketsError:()=>{},setLogoutError:()=>{},fetch:async(url)=>{called=url;return {ok:true};}};vm.createContext(ctx);
  vm.runInContext(strip(block)+'\nglobalThis.logout=handleLogout;',ctx);await ctx.logout();assert.equal(called,'/technician/logout');assert.equal(removed,2);
});

// Optional local verification on an isolated PostgreSQL WASM engine, never a remote database.
if (process.env.V3_TEST_PGLITE === '1') {
  test('PostgreSQL migration/repository: additive, repeatable, durable, isolated and monotonic',async()=>{
    const {PGlite}=requireHere('@electric-sql/pglite');
    const location=path.join(tmp,'postgres');let db=new PGlite(location);
    for (const name of fs.readdirSync(path.join(root,'cloud/src/db/migrations')).filter(n=>n.endsWith('.sql')&&!n.startsWith('005_')).sort()) await db.exec(read('cloud/src/db/migrations/'+name));
    await db.query("INSERT INTO technician_accounts (id,employee_code,full_name,email,password_hash) VALUES ('p1','p1','one','one@example.test','fake'),('p2','p2','two','two@example.test','fake')");
    await db.query("INSERT INTO cloud_tickets(id,cloud_report_id,tracking_token,integration_machine_id,public_qr_token,category,description) VALUES ('pg1','r1','tr1','m1','q1','CARD_POS','original')");
    const old=(await db.query('SELECT * FROM cloud_tickets')).rows[0];
    const sql=read('cloud/src/db/migrations/005_ticket_technician_assignment.sql');await db.exec(sql);await db.exec(sql);
    const after=(await db.query('SELECT * FROM cloud_tickets')).rows[0];for(const key of Object.keys(old))assert.deepEqual(after[key],old[key]);
    const {PostgresCloudTicketRepository}=load('cloud/src/repositories/postgresRepository.js');let tickets=new PostgresCloudTicketRepository({query:(...args)=>db.query(...args)});
    assert.equal(await tickets.assignTechnician('pg1','p1',1,'TCK-PG'),true);
    const assigned=(await tickets.findById('pg1')).assignedAt;
    assert.equal(await tickets.assignTechnician('pg1','p1',1,'TCK-PG'),true);assert.equal((await tickets.findById('pg1')).assignedAt,assigned);
    assert.equal(await tickets.assignTechnician('pg1','p2',2,'TCK-PG'),true);
    assert.equal(await tickets.assignTechnician('pg1','p1',1,'TCK-PG'),false);
    assert.equal((await tickets.findAssignedActive('p1')).length,0);assert.equal((await tickets.findAssignedActive('p2')).length,1);
    await db.close();db=new PGlite(location);tickets=new PostgresCloudTicketRepository({query:(...args)=>db.query(...args)});
    assert.equal((await tickets.findById('pg1')).assignedTechnicianId,'p2');
    await tickets.updateTicketStatus('pg1','RESOLVED');assert.equal((await tickets.findAssignedActive('p2')).length,0);
    assert.equal(await tickets.assignTechnician('pg1','p1',3,'TCK-PG'),false);await db.close();
  });
}
