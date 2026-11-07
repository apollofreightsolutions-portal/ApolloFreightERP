// Language layer only. Database access and mutations remain server-authorized.
async function callOpenAI({model, instructions, message, context, timeoutMs=25000}) {
  const key=String(process.env.OPENAI_API_KEY||'').trim();
  if(!key){const e=new Error('OpenAI is not configured. IT must set OPENAI_API_KEY on the server. Account searches still work without it.');e.status=503;throw e;}
  const response=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',signal:AbortSignal.timeout(timeoutMs),
    headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify({model,store:false,instructions,input:JSON.stringify({question:message,authorizedRecords:context||null}),max_output_tokens:2200})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const e=new Error(response.status===429?'OpenAI usage limit reached. IT should check API billing and limits.':[401,403].includes(response.status)?'OpenAI credentials or model access need attention. Contact IT.':'OpenAI could not complete the response. Please retry.');e.status=502;throw e;}
  const answer=(data.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('\n').trim();
  if(!answer||data.status==='incomplete')throw new Error('OpenAI returned an incomplete response. Please narrow the question and retry.');
  return answer;
}
module.exports={callOpenAI};
