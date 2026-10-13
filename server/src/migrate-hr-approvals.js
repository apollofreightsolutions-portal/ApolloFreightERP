// V23 isolated additive migration. Do not replay historical data imports for this update.
const fs = require('fs');
const path = require('path');
const {getPool,closePool} = require('./db');
const {nodeEnv} = require('./config');
async function main() {
  if(String(nodeEnv).toLowerCase()==='production' && process.env.ALLOW_PRODUCTION_MIGRATIONS!=='true') throw new Error('Set ALLOW_PRODUCTION_MIGRATIONS=true on the reviewed isolated migration job.');
  const c=await getPool().connect();let locked=false;
  try {
    await c.query("set lock_timeout='10s'");
    await c.query("set statement_timeout='120s'");
    locked=(await c.query("select pg_try_advisory_lock(hashtext('apollo_freight_schema_migration')) as locked")).rows[0].locked;
    if(!locked)throw new Error('Another migration is running. Retry later.');
    await c.query(fs.readFileSync(path.join(__dirname,'../sql/047_hr_approval_workflow.sql'),'utf8'));
    console.log('047_hr_approval_workflow.sql applied. Existing requests preserved.');
  }catch(e){await c.query('rollback').catch(()=>{});throw e;}
  finally{if(locked)await c.query("select pg_advisory_unlock(hashtext('apollo_freight_schema_migration'))");c.release();}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(closePool);
module.exports={main};
