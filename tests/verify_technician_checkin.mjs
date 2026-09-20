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


const coordinates={latitude:24.7,longitude:46.6,accuracyMeters:5};
async function fresh(id) {
  await repo.tickets.createTicket(ticket(id));
  await repo.tickets.assignTechnician(id,'tech-1',1,'TCK-'+id);
}
test('nearby assigned technician gets verified checkin and IN_PROGRESS',async()=>{
  await fresh('near');
  const result=await call('/technician/checkin',{token:token1,body:{ticketId:'near',machineToken:'QR-TEST',coordinates}});
  assert.equal(result.status,200); assert.equal(result.data.checkin.verified,true);
  assert.equal(result.data.checkin.ticketId,'near'); assert.equal(result.data.checkin.status,'VERIFIED');
  assert.equal(result.data.ticketStatus,'IN_PROGRESS');
  assert.equal((await repo.tickets.findById('near')).checkins.length,1);
  assert.equal(JSON.stringify(await repo.machines.findByIntegrationId('machine-1')),beforeMachine);
});
test('distant, inaccurate, missing and malformed GPS do not record attendance',async()=>{
  for(const [i,coords] of [undefined,{...coordinates,latitude:30},{...coordinates,accuracyMeters:100000},
    {...coordinates,accuracyMeters:undefined},{...coordinates,accuracyMeters:-1},
    {...coordinates,latitude:'24.7'},{...coordinates,latitude:91}].entries()) {
    const id='badgps'+i; await fresh(id);
    const result=await call('/technician/checkin',{token:token1,body:{ticketId:id,machineToken:'QR-TEST',coordinates:coords}});
    assert.equal(result.status,400,JSON.stringify(result.data));
    const saved=await repo.tickets.findById(id); assert.equal(saved.status,'OPEN'); assert.equal(saved.checkins.length,0);
  }
});
test('unknown, other-machine and inactive QR cannot fall back to ticket machine',async()=>{
  await repo.machines.bootstrapRegistry([JSON.parse(beforeMachine),{integrationMachineId:'machine-2',publicQrToken:'QR-OTHER',
    machineType:'fixture',publicDisplayName:'Other',buildingPublicName:'test',locationPublicName:'test',
    ...coordinates,active:true,version:1,lastSyncedAt:new Date().toISOString()},
    {integrationMachineId:'machine-3',publicQrToken:'QR-INACTIVE',machineType:'fixture',publicDisplayName:'Inactive',
    buildingPublicName:'test',locationPublicName:'test',...coordinates,active:false,version:1,lastSyncedAt:new Date().toISOString()}]);
  for(const [i,machineToken] of ['UNKNOWN','QR-OTHER','QR-INACTIVE'].entries()) {
    const id='badqr'+i; await fresh(id);
    const result=await call('/technician/checkin',{token:token1,body:{ticketId:id,machineToken,coordinates}});
    assert.equal(result.status,404); assert.equal((await repo.tickets.findById(id)).checkins.length,0);
  }
});
test('another technician is denied before attendance writes',async()=>{
  await fresh('wrongtech');
  const result=await call('/technician/checkin',{token:token2,body:{ticketId:'wrongtech',machineToken:'QR-TEST',coordinates}});
  assert.equal(result.status,403); assert.equal((await repo.tickets.findById('wrongtech')).checkins.length,0);
});
test('client exception text cannot authorize remote attendance',async()=>{
  await fresh('exception');
  const result=await call('/technician/checkin',{token:token1,body:{ticketId:'exception',machineToken:'QR-TEST',
    coordinates:{...coordinates,latitude:30},manualExceptionReason:'A client supplied explanation is not approval',
    manualException:{approvedBy:'admin',reason:'Client invented approval'},gpsVerified:true}});
  assert.equal(result.status,400); assert.equal((await repo.tickets.findById('exception')).checkins.length,0);
});
test('nonfinite GPS and missing accuracy cannot pass direct validation',()=>{
  const {GpsService}=load('cloud/src/services/gpsService.js');
  const machine={latitude:24.7,longitude:46.6};
  for(const bad of [NaN,Infinity,-Infinity]) {
    assert.equal(GpsService.validateFieldPresence({...coordinates,latitude:bad},machine).verified,false);
    assert.equal(GpsService.validateFieldPresence({...coordinates,accuracyMeters:bad},machine).verified,false);
    assert.equal(GpsService.validateFieldPresence(coordinates,{...machine,latitude:bad}).verified,false);
  }
});
test('portal sends nested GPS and consumes only a verified matching Cloud response',async()=>{
  const source=read('src/components/views/TechnicianMobilePortal.tsx');
  const body=source.slice(source.indexOf('  const handleCheckin ='),source.indexOf('  // Evidence File Selection'));
  let sent,record,error;
  const selectedTicket={id:'near',machine:{publicQrToken:'QR-TEST'}};
  const context={selectedTicket,token:'test-session',currentGps:{lat:24.7,lng:46.6,accuracy:5},
    machineTokenInput:'QR-TEST',manualReason:'',selectedTicketIdRef:{current:'near'},
    setIsCheckingIn(){},setCheckInError(v){error=v},setCheckInResult(v){record=v},loadTickets(){},
    fetch:async(url,opts)=>{sent=JSON.parse(opts.body);return {ok:true,json:async()=>({success:true,checkin:{ticketId:'near',verified:true,status:'VERIFIED'}})}}};
  vm.createContext(context);
  vm.runInContext(strip(body)+';globalThis.submit=handleCheckin;',context);
  await context.submit({preventDefault(){}});
  assert.deepEqual(sent.coordinates,coordinates); assert.equal(sent.latitude,undefined);
  assert.equal(record.status,'GPS_VERIFIED');
  for(const response of [{success:true,checkIn:{ticketId:'near',verified:true,status:'VERIFIED'}},
    {success:true,checkin:{ticketId:'different',verified:true,status:'VERIFIED'}},
    {success:true,checkin:{ticketId:'near',verified:false,status:'FAILED_DISTANCE'}}]) {
    record=null;context.fetch=async()=>({ok:true,json:async()=>response});
    await context.submit({preventDefault(){}});assert.equal(record,null);assert.ok(error);
  }
  record=null;context.selectedTicketIdRef.current='other';
  await context.submit({preventDefault(){}}); assert.equal(record,null);
});
