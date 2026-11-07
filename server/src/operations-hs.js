const compliance = require('./customer-compliance');
const {registerHsHelp} = require('./customer-hs-help');
// Keep internal uploads separate from customer data; never impersonate a customer account.
function scopedQuery(query) {
  return (sql,values)=>query(sql.replace(/\bcustomer_compliance_checks\b/g,'operations_hs_checks').replace(/\bcustomer_hs_help\b/g,'operations_hs_help'),values);
}
function operationsHsGuard(query,requireErpPortalAuth) {
  return (req,res,next)=>requireErpPortalAuth(req,res,()=>Promise.resolve().then(async()=>{
    const user=(await query('select user_name,role,account_status,erp_portal_access,section_access from app_users where lower(user_name)=lower($1)',[req.appSession?.userName||''])).rows[0];
    const admin=String(user?.role||'').toLowerCase()==='admin';
    const sections=String(user?.section_access||'').split(',').map(x=>x.trim().toLowerCase());
    if(!user||String(user.account_status).toLowerCase()!=='active'||(!admin&&(user.erp_portal_access===false||!sections.some(x=>['all','hs code check','shipment / airway','shipments / jobs'].includes(x)))))return res.status(403).json({ok:false,error:'Operations HS Code Check access is required.'});
    // Reuse the checker contract, but ownership is the authenticated staff username in its own table.
    req.customerSession={customerCode:user.user_name.toLowerCase(),userName:user.user_name};
    next();
  }).catch(next));
}
function registerOperationsHs({app,query,requireErpPortalAuth}) {
  const staffQuery=scopedQuery(query),guard=operationsHsGuard(query,requireErpPortalAuth);
  app.use('/api/operations/compliance',compliance.createCustomerComplianceRouter({query:staffQuery,requireCustomerPortalAuth:guard}));
  registerHsHelp({app,query:staffQuery,requireCustomerPortalAuth:guard,requireErpPortalAuth,...compliance,customerPrefix:'/api/operations/hs-help',reviewPrefix:'/api/operations/hs-review'});
}
module.exports={registerOperationsHs,operationsHsGuard,scopedQuery};
