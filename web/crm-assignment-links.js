// Keep the assignment URL through sign-in; never bypass server authorization.
if(new URLSearchParams(location.search).has('crmAssignment')){
 let switching=false,loginSelected=false;
 const timer=setInterval(()=>{
  const login=document.querySelector('[data-login-mode-option="crm"]');
  if(login&&!loginSelected){login.click();loginSelected=true;}
  let session;try{session=JSON.parse(sessionStorage.getItem('apollofreighterp-session')||'null');}catch{}
  if(!session?.token)return;
  if(session.portal!=='crm'){
   const switcher=document.querySelector('[data-portal-switch="crm"]');
   if(switcher&&!switching&&session.crmPortalAccess){switching=true;switcher.click();setTimeout(()=>switching=false,3000);}
   return;
  }
  const accounts=document.querySelector('#moduleNav [data-module="Accounts"]');
  if(accounts&&window.ApolloCRM){accounts.click();clearInterval(timer);}
 },500);
}
