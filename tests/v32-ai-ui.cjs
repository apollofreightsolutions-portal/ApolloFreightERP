const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const d=new JSDOM('<div id="appShell"></div>',{url:'https://example.test',runScripts:'outside-only'}),w=d.window;
w.sessionStorage.setItem('apollofreighterp-session',JSON.stringify({portal:'company',token:'TEST',role:'Admin'}));
const calls=[];let reject=false;
w.confirm=()=>true;w.prompt=()=> 'KWI';
w.fetch=async(url,opts={})=>{
 calls.push({url,opts});
 const response=url.endsWith('/me')?{enabled:true,provider:'OpenAI API',model:'gpt-5.4-mini'}:
 url.includes('/account/customer/')?{answer:'Sun and Sand',accountReference:{kind:'customer',id:'10'}}:
 url.endsWith('/prepare')?{answer:'Confirm block KWI; portal login also blocked',actions:[{type:'account-confirm',token:'test-token',label:'Confirm'}]}:
 url.endsWith('/confirm')?(reject?{error:'Confirmation expired'}:{answer:'Saved: Blocked'}):
 {answer:'Search results',actions:[{type:'account',kind:'customer',id:'11',label:'Open other'}]};
 return {ok:!(reject&&url.endsWith('/confirm')),status:reject?409:200,json:async()=>response};
};
const src=fs.readFileSync(path.join(__dirname,'../web/apollo-ai.js'),'utf8');
w.eval(src+'\nwindow.testAi={handleAction,sendMessage,getState:()=>aiState};');
function button(item){const b=w.document.createElement('button');b.dataset.aiAction=encodeURIComponent(JSON.stringify(item));return b;}
(async()=>{try{
 await new Promise(r=>setTimeout(r,5));
 await w.testAi.handleAction(button({type:'account',kind:'customer',id:'10'}));
 assert.equal(w.testAi.getState().accountReference.id,'10');
 await w.testAi.handleAction(button({type:'account-change',id:'10',operation:'block'}));
 assert.equal(JSON.parse(calls.at(-1).opts.body).branch,'Kuwait HO');
 assert(!calls.some(c=>c.url.endsWith('/confirm')));
 await w.testAi.handleAction(button({type:'account-confirm',token:'test-token'}));
 assert.match(w.document.querySelector('#apolloAiMessages').textContent,/Saved: Blocked/);
 reject=true;await w.testAi.handleAction(button({type:'account-confirm',token:'test-token'}));
 assert.equal(w.testAi.getState().messages.at(-1).text,'Confirmation expired');
 await w.testAi.sendMessage('find Other customer');
 assert.equal(w.testAi.getState().accountReference,null);
 w.document.querySelector('.apollo-ai-clear').click();assert.equal(w.testAi.getState().messages.length,0);
 console.log('PASS V32 AI UI: authenticated detail, branch preparation, explicit confirmation, honest failure, stale-reference reset');
}finally{w.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
