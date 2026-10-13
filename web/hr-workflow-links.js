// Resume the same secure review after an Employee Portal login. No GET performs a decision.
const pending=sessionStorage.getItem('apollo-hr-return');
if(pending && /^\/hr-approvals\.html(?:\?|$)/.test(pending)) {
 const timer=setInterval(()=>{let s;try{s=JSON.parse(sessionStorage.getItem('apollofreighterp-session')||'null');}catch{}
   if(s?.token&&s.portal==='employee'){clearInterval(timer);sessionStorage.removeItem('apollo-hr-return');location.assign(pending);}
 },750);
}
