// Narrow, explicit maintenance command; never runs automatically on web requests.
const fs=require('fs');
const path=require('path');
const {getPool,closePool}=require('./db');
async function main(){
 const apply=process.argv.includes('--apply');
 if(apply&&process.env.ALLOW_PRODUCTION_MIGRATIONS!=='true')throw Error('Review SQL 042 and set ALLOW_PRODUCTION_MIGRATIONS=true for this isolated command only.');
 const c=await getPool().connect();
 try{
  if(apply){await c.query('BEGIN');try{await c.query("set local lock_timeout='5s'");await c.query(fs.readFileSync(path.join(__dirname,'../sql/042_customer_compliance.sql'),'utf8'));await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}}
  await c.query('select analysis_id,customer_code,customer_user,destination,status,input_sha256,result_json,expires_at,created_at,updated_at from customer_compliance_checks limit 0');
  await c.query('BEGIN');
  try{await c.query("insert into customer_compliance_checks(analysis_id,customer_code,expires_at) values($1,'__setup_probe__',now())",['setup-'+require('crypto').randomUUID()]);}finally{await c.query('ROLLBACK');}
  console.log('Customer compliance table readable and writable with this DATABASE_URL and role. Probe rolled back.');
  const provider=process.env.APOLLO_COMPLIANCE_PROVIDER||'vertex';
  console.log('Provider:',provider,'; project configured:',Boolean(process.env.GOOGLE_CLOUD_PROJECT||process.env.GCLOUD_PROJECT),'; explicit model:',Boolean(process.env.APOLLO_COMPLIANCE_MODEL));
  console.log('Recognized Excel invoices do not need AI. PDF/images and unrecognized layouts require a separate live provider test. This command does NOT verify AI authorization.');
 }finally{c.release();}
}
main().catch(e=>{console.error('Customer compliance setup failed:',e.code||e.message);process.exitCode=1;}).finally(()=>closePool());
