function registerShipmentReporting({app,requireErpPortalAuth,getPool}){
 app.put('/api/shipments/:id/reporting',requireErpPortalAuth,async(req,res,next)=>{
  if(String(req.appSession?.role||'').trim().toLowerCase()!=='admin')return res.status(403).json({ok:false,error:'Only management administrators may change reporting classification.'});
  const mode=req.body?.mode,reason=String(req.body?.reason||'').trim();
  if(!['auto','live'].includes(mode)||reason.length<5||reason.length>1000)return res.status(400).json({ok:false,error:'Choose auto or live and give a reason (5–1000 characters).'});
  let c;
  try{
   c=await getPool().connect();await c.query('BEGIN');
   const current=(await c.query('select job_no,created_at,reporting_mode from shipments where job_no=$1 for update',[req.params.id])).rows[0];
   if(!current){await c.query('ROLLBACK');return res.status(404).json({ok:false,error:'Shipment not found.'});}
   if(!current.created_at||Date.parse(current.created_at)>=Date.parse('2026-09-01T00:00:00+03:00')){await c.query('ROLLBACK');return res.status(400).json({ok:false,error:'This override is only for shipments created before 1 September 2026 (Kuwait time).'});}
   await c.query('update shipments set reporting_mode=$2 where job_no=$1',[req.params.id,mode]);
   if(current.reporting_mode!==mode)await c.query('insert into audit_log(user_name,action,reference,details) values($1,$2,$3,$4)',[req.appSession.userName,'SHIPMENT_REPORTING_CLASSIFICATION',req.params.id,JSON.stringify({previous:current.reporting_mode,next:mode,reason})]);
   await c.query('COMMIT');res.json({ok:true,jobNo:req.params.id,reportingMode:mode});
  }catch(e){if(c)await c.query('ROLLBACK');if(e.code==='42703')return res.status(503).json({ok:false,error:'Reporting setup required: apply SQL 051 before deployment.'});next(e);}
  finally{c?.release();}
 });
}
module.exports={registerShipmentReporting};
