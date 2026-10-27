// Explicit additive deployment setup, never executed by web requests.
const fs=require('fs'),path=require('path');
const {getPool,closePool}=require('./db');
async function main(){
 const apply=process.argv.includes('--apply');
 if(apply&&process.env.ALLOW_PRODUCTION_MIGRATIONS!=='true')throw Error('Review SQL 042 and 051, back up the database, then set ALLOW_PRODUCTION_MIGRATIONS=true for this command only.');
 const c=await getPool().connect();
 try{
  if(apply){await c.query('BEGIN');try{
   await c.query("set local lock_timeout='5s'");
   for(const file of ['042_customer_compliance.sql','051_shipment_reporting.sql'])await c.query(fs.readFileSync(path.join(__dirname,'../sql',file),'utf8'));
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}}
  await c.query('select reporting_mode,created_at from shipments limit 0');
  await c.query('select analysis_id,customer_code,customer_user,destination,status,input_sha256,result_json,expires_at,created_at,updated_at from customer_compliance_checks limit 0');
  await c.query('BEGIN');
  try{
   await c.query("insert into customer_compliance_checks(analysis_id,customer_code,expires_at) values($1,'__setup_probe__',now())",['setup-'+require('crypto').randomUUID()]);
   await c.query("insert into audit_log(user_name,action,reference,details) values('setup','V292_PROBE','setup','{}')");
   await c.query('update shipments set reporting_mode=reporting_mode where false');
  }finally{await c.query('ROLLBACK');}
  const counts=(await c.query("select count(*)::int as total_shipments,count(*) filter(where created_at < timestamptz '2026-09-01 00:00:00+03' and reporting_mode <> 'live')::int as prelive_shipments from shipments")).rows[0];
  console.log('V29.2 schema/access checks passed. Temporary probes rolled back.',counts);
  console.log('No jobs, statuses, amounts or import records reset. PDF/image cloud access and live email delivery still require end-to-end deployment tests.');
 }finally{c.release();}
}
main().catch(e=>{console.error('V29.2 setup failed:',e.code||e.message);process.exitCode=1;}).finally(()=>closePool());
