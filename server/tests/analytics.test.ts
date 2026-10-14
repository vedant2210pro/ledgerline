import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import request from 'supertest';
import type {Connection,RowDataPacket} from 'mysql2/promise';
import {connect,safeError} from '../../database/config.ts';
import {migrate} from '../../database/migrate.ts';
import {grantAdmin} from '../scripts/admin-grants.ts';
import {grantFinance} from '../scripts/grants.ts';
import {config} from '../src/config.ts';
import {createPool} from '../src/db.ts';
import {createApp} from '../src/app.ts';
import {hashPassword,verifyPassword} from '../src/crypto.ts';
import {csvCell} from '../src/analytics.ts';
const c={...config(),database:'banking_payroll_test',secret:randomBytes(48).toString('base64url')},pool=createPool(c),app=createApp(pool,c),tag='P89-'+randomBytes(4).toString('hex');
const today=new Date().toISOString().slice(0,10),range='date_from='+today+'&date_to='+today;
let db:Connection,account:string,branch:string,created:string;
const password=randomBytes(24).toString('base64url');
type Actor={id:string;cookie:string;csrf:string};
const actors:Record<string,Actor>={},createdIds:string[]=[];
const get=(role:string,path:string)=>request(app).get('/api/v1'+path).set('Cookie',actors[role].cookie);
const send=(role:string,path:string,body:object,method:'post'|'patch'='post')=>request(app)[method]('/api/v1'+path).set('Origin',c.origin).set('Cookie',actors[role].cookie).set('X-CSRF-Token',actors[role].csrf).send(body);
async function insert(sql:string,values:(string|number)[]){await db.execute(sql,values);const [r]=await db.query<RowDataPacket[]>('SELECT CAST(LAST_INSERT_ID() AS CHAR) id');return String(r[0].id);}
async function login(email:string,pw=password){return request(app).post('/api/v1/auth/login').set('Origin',c.origin).send({email,password:pw});}
before(async()=>{try{
 db=await connect('banking_payroll_test');await migrate(db,'banking_payroll_test');await grantFinance(db,'banking_payroll_test',process.env.MYSQL_RUNTIME_USER!);await grantAdmin(db,'banking_payroll_test',process.env.MYSQL_RUNTIME_USER!);
 const hash=await hashPassword(password);
 for(const role of ['administrator','banking_staff','payroll_manager','auditor']){const email=tag+'-'+role+'@example.test',id=await insert("INSERT INTO users(name,email,password_hash,account_status) VALUES (?,?,?,'active')",[tag+' '+role,email,hash]);await db.execute('INSERT INTO user_roles(user_id,role_id) SELECT ?,role_id FROM roles WHERE role_name=?',[id,role]);const r=await login(email);assert.equal(r.status,200);actors[role]={id,cookie:String(r.headers['set-cookie'][0]).split(';')[0],csrf:r.body.csrfToken};}
 const customer=await insert("INSERT INTO customers(name,email,phone,address) VALUES (?,?,'TEST','Test address')",['=FORMULA '+tag,tag+'@example.test']);
 const employee=await insert("INSERT INTO employees(employee_code,name,department,phone,email,designation,date_of_joining) VALUES (?,'Report test','Test','TEST',?,'Tester','2026-01-01')",[tag,tag+'-e@example.test']);
 branch=await insert("INSERT INTO branches(branch_code,name,address,phone) VALUES (?,'Report test branch','Test','TEST')",[tag]);
 account=await insert("INSERT INTO accounts(account_number,customer_id,employee_id,account_type,open_date) VALUES (?,?,?,'savings','2026-01-01')",[tag,customer,employee]);
 assert.equal((await send('banking_staff','/transactions/deposit',{account_id:account,branch_id:branch,amount:'123.45',description:'Report test',idempotency_key:randomUUID()})).status,201);
 }catch(e){
 // eslint-disable-next-line preserve-caught-error -- Do not log driver SQL or credentials.
 throw new Error(safeError(e));
}});
after(async()=>{await pool.end();if(db){for(const id of [...Object.values(actors).map(a=>a.id),...createdIds]){await db.execute("UPDATE users SET account_status='disabled' WHERE user_id=?",[id]);await db.execute('UPDATE sessions SET revoked_at=UTC_TIMESTAMP(6) WHERE user_id=? AND revoked_at IS NULL',[id]);}await db.end();}});
test('all module list routes enforce the four-role access matrix',async()=>{
 const routes:Record<string,string[]>={
  '/customers':['administrator','banking_staff','auditor'],
  '/accounts':['administrator','banking_staff','auditor'],
  '/branches':['administrator','banking_staff','auditor'],
  '/transactions':['administrator','banking_staff','auditor'],
  '/employees':['administrator','payroll_manager','auditor'],
  '/payroll':['administrator','payroll_manager','auditor'],
  '/reports/banking':['administrator','banking_staff','auditor'],
  '/reports/accounts':['administrator','banking_staff','auditor'],
  '/reports/branches':['administrator','banking_staff','auditor'],
  '/reports/payroll':['administrator','payroll_manager','auditor'],
  '/users':['administrator'],'/roles':['administrator'],
  '/audit-logs':['administrator','auditor'],'/system':['administrator'],
 };
 for(const [path,allowed] of Object.entries(routes)){
  assert.equal((await request(app).get('/api/v1'+path)).status,401,path+' anonymous');
  for(const role of ['administrator','banking_staff','payroll_manager','auditor']){
   assert.equal((await get(role,path)).status,allowed.includes(role)?200:403,path+' '+role);
  }
 }
});
test('dashboard never leaks payroll to banking staff or banking data to payroll managers',async()=>{
 const bank=await get('banking_staff','/dashboard?'+range),pay=await get('payroll_manager','/dashboard?'+range),admin=await get('administrator','/dashboard?'+range);
 assert.equal(bank.status,200);assert(bank.body.banking);assert.equal(bank.body.payroll,undefined);assert.equal(pay.status,200);assert(pay.body.payroll);assert.equal(pay.body.banking,undefined);assert(admin.body.banking&&admin.body.payroll);
});
test('dashboard amounts and counts equal real MySQL aggregates',async()=>{
 const r=await get('administrator','/dashboard?'+range);assert.equal(r.status,200);
 const [current]=await db.query<RowDataPacket[]>('SELECT COUNT(*) accounts,SUM(balance) balance FROM accounts');assert.equal(r.body.banking.accounts,Number(current[0].accounts));assert.equal(r.body.banking.balance,current[0].balance);
 const [postings]=await db.execute<RowDataPacket[]>("SELECT SUM(amount) amount FROM banking_transactions WHERE transaction_type='deposit' AND transaction_date>=? AND transaction_date<DATE_ADD(?,INTERVAL 1 DAY)",[today,today]);assert.equal(r.body.banking.deposits,postings[0].amount);
 assert(r.body.banking.trend.some((v:{day:string})=>v.day===today));assert(r.body.banking.recent.length<=6);
});
test('empty date windows return honest zeros and reject reversed or excessive ranges',async()=>{
 const r=await get('administrator','/dashboard?date_from=1900-01-01&date_to=1900-01-31');assert.equal(r.status,200);assert.equal(r.body.banking.deposits,'0.00');assert.deepEqual(r.body.banking.trend,[]);assert.equal(r.body.payroll.processed,'0.00');
 for(const q of ['date_from=2026-12-01&date_to=2026-01-01','date_from=2000-01-01&date_to=2026-01-01','date_from=2026-02-30'])assert.equal((await get('auditor','/dashboard?'+q)).status,422);
});
test('reports filter and paginate actual ledger entries and reconcile account snapshots',async()=>{
 const r=await get('auditor','/reports/banking?'+range+'&search='+tag+'&pageSize=1');assert.equal(r.status,200);assert.equal(r.body.total,1);assert.equal(r.body.items[0].amount,'123.45');assert.equal(r.body.items[0].account_number,tag);
 const next=await get('auditor','/reports/banking?'+range+'&search='+tag+'&pageSize=1&page=2');assert.equal(next.body.items.length,0);assert.equal(next.body.total,1);
 const accountReport=await get('auditor','/reports/accounts?search='+tag);assert.equal(accountReport.status,200);assert.equal(accountReport.body.items[0].discrepancy,'0.00');assert.equal(accountReport.body.items[0].balance,'123.45');
 const branchReport=await get('auditor','/reports/branches?'+range+'&search='+tag);assert.equal(branchReport.status,200);assert.equal(String(branchReport.body.items[0].posting_count),'1');assert.equal(branchReport.body.items[0].credits,'123.45');
});
test('report access and CSV export permissions are enforced independently',async()=>{
 assert.equal((await get('banking_staff','/reports/payroll')).status,403);assert.equal((await get('payroll_manager','/reports/accounts/export')).status,403);
 const [permission]=await db.query<RowDataPacket[]>("SELECT p.permission_id,r.role_id FROM permissions p JOIN roles r ON r.role_name='banking_staff' WHERE p.permission_code='reports.banking.export'");
 try{await db.execute('DELETE FROM role_permissions WHERE role_id=? AND permission_id=?',[permission[0].role_id,permission[0].permission_id]);assert.equal((await get('banking_staff','/reports/banking')).status,200);assert.equal((await get('banking_staff','/reports/banking/export')).status,403);}finally{await db.execute('INSERT INTO role_permissions(role_id,permission_id) VALUES (?,?)',[permission[0].role_id,permission[0].permission_id]);}
});
test('CSV includes all filtered rows, escapes formula text and records an export audit',async()=>{
 const r=await get('auditor','/reports/accounts/export?search='+tag);assert.equal(r.status,200);assert.match(r.headers['content-type'],/text\/csv/);assert(r.text.includes('"\'=FORMULA '+tag+'"'));assert(r.text.includes('"123.45"'));assert.match(r.headers['content-disposition'],/attachment/);
 assert.equal(csvCell('a,"b"\nc'),'"a,""b""\nc"');assert.equal(csvCell('\t=1+1'),'"\'\t=1+1"');
 const [events]=await db.execute<RowDataPacket[]>("SELECT after_values FROM audit_logs WHERE actor_id=? AND action='reports.export'",[actors.auditor.id]);assert.equal(events.length,1);assert.equal(events[0].after_values.rows,1);
});
test('nonadministrators and missing CSRF cannot create users or alter roles',async()=>{
 const body={name:'Test reviewer',email:tag+'-new@example.test',password,roles:['payroll_manager']};
 assert.equal((await send('auditor','/users',body)).status,403);assert.equal((await get('banking_staff','/roles')).status,403);
 assert.equal((await request(app).post('/api/v1/users').set('Origin',c.origin).set('Cookie',actors.administrator.cookie).send(body)).status,403);
 assert.equal((await send('administrator','/users',{...body,roles:['invented']})).status,422);
 assert.equal((await send('administrator','/users',{...body,password:'short'})).status,422);
});
test('administrator creates an actual reviewer without exposing credentials in responses or audits',async()=>{
 const body={name:'Test reviewer',email:tag+'-new@example.test',password,roles:['payroll_manager']};const r=await send('administrator','/users',body);assert.equal(r.status,201);created=r.body.id;createdIds.push(created);assert.deepEqual(r.body.roles,['payroll_manager']);assert.equal(r.body.password_hash,undefined);assert.equal(r.body.password,undefined);
 const [rows]=await db.execute<RowDataPacket[]>('SELECT password_hash FROM users WHERE user_id=?',[created]);assert(await verifyPassword(password,rows[0].password_hash));
 const [audit]=await db.execute<RowDataPacket[]>("SELECT before_values,after_values FROM audit_logs WHERE entity_type='users' AND entity_id=?",[created]);const text=JSON.stringify(audit);assert(!text.includes(password));assert(!text.includes('scrypt$'));
 const signed=await login(body.email);assert.equal(signed.status,200);actors.reviewer={id:created,cookie:String(signed.headers['set-cookie'][0]).split(';')[0],csrf:signed.body.csrfToken};
 assert.equal((await get('reviewer','/payroll')).status,200);assert.equal((await get('reviewer','/users')).status,403);
});
test('role/status changes use optimistic versions and revoke existing sessions',async()=>{
 const before=await get('administrator','/users/'+created);const body={name:before.body.name,email:before.body.email,account_status:'active',roles:['auditor'],row_version:before.body.row_version};
 const results=await Promise.all([send('administrator','/users/'+created,body,'patch'),send('administrator','/users/'+created,body,'patch')]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal((await get('reviewer','/payroll')).status,401);
 const current=await get('administrator','/users/'+created);assert.deepEqual(current.body.roles,['auditor']);
});
test('own administrator access cannot be removed or disabled',async()=>{
 const r=await get('administrator','/users/'+actors.administrator.id);const body={name:r.body.name,email:r.body.email,account_status:'active',roles:['administrator'],row_version:r.body.row_version};
 assert.equal((await send('administrator','/users/'+actors.administrator.id,{...body,roles:['auditor']},'patch')).status,409);assert.equal((await send('administrator','/users/'+actors.administrator.id,{...body,account_status:'disabled'},'patch')).status,409);assert.equal((await get('administrator','/roles')).status,200);
});
test('password reset revokes old logins and never logs the password',async()=>{
 const r=await get('administrator','/users/'+created),next=randomBytes(24).toString('base64url');const reset=await send('administrator','/users/'+created+'/password',{password:next,row_version:r.body.row_version});assert.equal(reset.status,200);
 assert.equal((await login(r.body.email,password)).status,401);assert.equal((await login(r.body.email,next)).status,200);
 const audit=await get('administrator','/audit-logs?'+range+'&search=users.password_reset');assert.equal(audit.status,200);assert(audit.body.items.some((v:{entity_id:string})=>v.entity_id===created));assert(!JSON.stringify(audit.body).includes(next));assert(!JSON.stringify(audit.body).includes('scrypt$'));
});
test('audit browsing and system reconciliation are protected and filterable',async()=>{
 assert.equal((await get('banking_staff','/audit-logs')).status,403);assert.equal((await get('auditor','/system')).status,403);
 const audit=await get('auditor','/audit-logs?'+range+'&search='+tag+'&pageSize=1');assert.equal(audit.status,200);assert(audit.body.total>0);assert.equal(audit.body.items.length,1);
 const system=await get('administrator','/system');assert.equal(system.status,200);assert.equal(system.body.discrepancies,0);assert.equal(system.body.currency,'INR');assert(!JSON.stringify(system.body).includes(process.env.MYSQL_RUNTIME_PASSWORD!));
});
test('failed administrative audit rolls back user creation and releases its administration lock',async()=>{
 const trigger='test_admin_'+tag.replaceAll('-','_'),email=tag+'-rollback@example.test';
 await db.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON audit_logs FOR EACH ROW BEGIN IF NEW.actor_id=${actors.administrator.id} AND NEW.action='users.create' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected administration failure'; END IF; END`);
 try{assert.equal((await send('administrator','/users',{name:'Rollback user',email,password,roles:['auditor']})).status,500);const [rows]=await db.execute<RowDataPacket[]>('SELECT COUNT(*) n FROM users WHERE email=?',[email]);assert.equal(Number(rows[0].n),0);const [locks]=await db.query<RowDataPacket[]>("SELECT IS_FREE_LOCK(CONCAT('ledgerline:admin:',DATABASE())) available");assert.equal(Number(locks[0].available),1);}finally{await db.query(`DROP TRIGGER ${trigger}`);}
});
test('concurrent administrators cannot demote each other and leave the workspace without administration',async()=>{
 const email=tag+'-admin2@example.test',created=await send('administrator','/users',{name:'Second test administrator',email,password,roles:['administrator']});assert.equal(created.status,201);createdIds.push(created.body.id);
 const signed=await login(email);assert.equal(signed.status,200);actors.admin2={id:created.body.id,cookie:String(signed.headers['set-cookie'][0]).split(';')[0],csrf:signed.body.csrfToken};
 const first=await get('administrator','/users/'+actors.administrator.id),second=await get('administrator','/users/'+actors.admin2.id);
 const form=(v:Record<string,unknown>)=>({name:v.name,email:v.email,account_status:'active',roles:['auditor'],row_version:v.row_version});
 const results=await Promise.all([send('administrator','/users/'+actors.admin2.id,form(second.body),'patch'),send('admin2','/users/'+actors.administrator.id,form(first.body),'patch')]);assert.equal(results.filter(r=>r.status===200).length,1);assert(results.some(r=>[401,403].includes(r.status)));
 const [remaining]=await db.execute<RowDataPacket[]>("SELECT COUNT(*) n FROM users u JOIN user_roles ur USING(user_id) JOIN roles r USING(role_id) WHERE u.user_id IN (?,?) AND u.account_status='active' AND r.role_name='administrator'",[actors.administrator.id,actors.admin2.id]);assert.equal(Number(remaining[0].n),1);
});
