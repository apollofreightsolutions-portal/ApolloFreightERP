// Resume the same secure review after ERP or HR login. No GET performs a decision.
const pending=sessionStorage.getItem('apollo-hr-return');
if(pending && /^\/hr-approvals(?:\.html)?(?:\?|$)/.test(pending)) {
 const timer=setInterval(()=>{let s;try{s=JSON.parse(sessionStorage.getItem('apollofreighterp-session')||'null');}catch{}
   if(s?.token&&['employee','company','app'].includes(s.portal)){clearInterval(timer);sessionStorage.removeItem('apollo-hr-return');location.assign(pending);}
 },750);
}
