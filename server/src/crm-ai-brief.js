function bounds(message,now=new Date(),zone='Asia/Kuwait'){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);const d=new Date(today+'T12:00:00Z');const iso=x=>x.toISOString().slice(0,10);let from='',to='';
 if(/(?:next|coming) week/i.test(message)){d.setUTCDate(d.getUTCDate()-d.getUTCDay()+7);from=iso(d);d.setUTCDate(d.getUTCDate()+6);to=iso(d);}
 else if(/this week/i.test(message)){d.setUTCDate(d.getUTCDate()-d.getUTCDay());from=iso(d);d.setUTCDate(d.getUTCDate()+6);to=iso(d);}
 else if(/last week/i.test(message)){d.setUTCDate(d.getUTCDate()-d.getUTCDay()-7);from=iso(d);d.setUTCDate(d.getUTCDate()+6);to=iso(d);}
 else if(/today/i.test(message))from=to=today;
 else if(/yesterday/i.test(message)){d.setUTCDate(d.getUTCDate()-1);from=to=iso(d);}
 else if(/this month/i.test(message)){from=today.slice(0,7)+'-01';to=today;}
 else {const dates=message.match(/\d{4}-\d{2}-\d{2}/g)||[];if(dates.length){from=dates[0];to=dates[1]||dates[0];}}
 return {from,to,today};
}
async function crmBrief(query,user,message,crmScope,zone){
 if(!user.crm_portal_access&&String(user.role).toLowerCase()!=='admin')return {answer:'CRM access is not enabled for your account.'};
 const values=[];const scope=crmScope(user,values,'a');const condition=`a.archived_at is null and ${scope.sql}`;
 const data={};
 const definitions={accounts:`select a.id,a.company_name,a.assigned_to,a.branch,a.status,a.next_action,a.next_action_date from crm_accounts a where ${condition}`,opportunities:`select o.title,o.status,o.stage,o.owner_user_name,o.expected_close_date,o.next_step,a.company_name,a.branch,a.assigned_to from crm_opportunities o join crm_accounts a on a.id=o.account_id where ${condition}`,visits:`select v.visit_date,v.visit_time,v.actual_visit_date,v.visit_status,v.salesperson,v.created_by,v.purpose,v.outcome,v.next_step,a.company_name,a.branch from crm_visits v join crm_accounts a on a.id=v.account_id where ${condition}`,tasks:`select t.title,t.status,t.assigned_to,t.due_date,a.company_name,a.branch from crm_tasks t join crm_accounts a on a.id=t.account_id where ${condition}`};
 for(const [k,sql] of Object.entries(definitions)){data[k]=JSON.parse(JSON.stringify((await query(sql+' limit 10001',values)).rows));if(data[k].length>10000)return {answer:'The accessible CRM dataset exceeds this brief’s 10,000-record limit. Open CRM filters for this review; I will not report partial totals.'};}
 const names=[...new Set([...data.accounts.map(a=>a.assigned_to),...data.opportunities.map(a=>a.owner_user_name),...data.visits.map(a=>a.salesperson||a.created_by),...data.tasks.map(a=>a.assigned_to)].filter(Boolean))];
 const words=message.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').split(' ');const full=names.filter(n=>(' '+words.join(' ')+' ').includes(' '+n.toLowerCase()+' '));const matches=full.length?full:names.filter(n=>n.toLowerCase().split(/\s+/).some(w=>w.length>2&&words.includes(w)));
 if(matches.length>1)return {answer:'Which salesperson do you mean: '+matches.join(', ')+'? Please use the full name.'};
 const person=matches[0]||'';
 const requested=message.match(/(?:what(?:s|'s| is| are)?\s+)([\p{L}]+)(?:'s)?\s+visits|opportunities\s+(?:does\s+)?([\p{L}]+)\s+(?:has|have)|(?:for|by)\s+([\p{L}]+)(?:\s|$)/iu);
 const candidate=requested&&(requested[1]||requested[2]||requested[3]);
 if(!person&&candidate&&!/^(the|next|coming|this|last|all|me|my|team|sales)$/i.test(candidate))return {answer:`I could not match “${candidate}” to a salesperson in your accessible CRM records. Please use their full CRM name.`};
 const range=bounds(message,new Date(),zone);const dated=(r,field)=>{const d=String(r[field]||'').slice(0,10);return (!range.from||(d&&d>=range.from))&&(!range.to||(d&&d<=range.to));};
 const companies=data.accounts.filter(a=>message.toLowerCase().includes(a.company_name.toLowerCase()));
 if(companies.length>1)return {answer:'Please specify one customer company: '+companies.map(a=>a.company_name).join(', ')};
 const company=companies[0]?.company_name||'';
 const branch=/\b(dxb|dubai)\b/i.test(message)?'DXB':/\b(kwi|kuwait)\b/i.test(message)?'KWI':'';const branchOK=r=>(!company||r.company_name===company)&&(!branch||(branch==='DXB'?/DXB|DUBAI|UAE/i:/KWI|KUWAIT/i).test(r.branch||''));
 const ownerOK=(r,field)=>!person||String(r[field]||'').toLowerCase()===person.toLowerCase();
 let visits=data.visits.filter(r=>branchOK(r)&&ownerOK({...r,salesperson:r.salesperson||r.created_by},'salesperson'));
 const upcoming=/(next|coming) week|upcoming|scheduled|planned/i.test(message);const completed=/visited|completed/i.test(message);
 visits=visits.filter(r=>dated(r,completed?'actual_visit_date':'visit_date')&&(!upcoming||(r.visit_status==='Planned'&&(range.from||String(r.visit_date).slice(0,10)>=range.today)))&&(!completed||r.visit_status==='Completed'));
 if(/overdue/i.test(message))visits=visits.filter(r=>r.visit_status==='Planned'&&String(r.visit_date).slice(0,10)<range.today);
 visits.sort((a,b)=>String(a.visit_date).localeCompare(String(b.visit_date)));
 const opp=data.opportunities.filter(r=>branchOK(r)&&ownerOK({...r,owner:r.owner_user_name||r.assigned_to},'owner')&&dated(r,'expected_close_date'));
 const tasks=data.tasks.filter(r=>branchOK(r)&&ownerOK(r,'assigned_to')&&dated(r,'due_date'));
 const accounts=data.accounts.filter(r=>branchOK(r)&&ownerOK(r,'assigned_to'));
 const header=`${person||'Accessible sales team'}${company?' · '+company:''}${branch?' · '+branch:''}${range.from?' · '+range.from+' to '+range.to+' (Sunday–Saturday weeks)':' · all recorded dates'}`;
 let lines=[header];const visitsOnly=/visits?|visited|schedule/i.test(message)&&!/brief|summary|overview/i.test(message);const oppOnly=/opportunit|pipeline/i.test(message)&&!/brief|summary|overview/i.test(message);
 if(!visitsOnly)lines.push(`${opp.length} opportunities: ${opp.filter(o=>String(o.status).toLowerCase()==='open').length} open, ${opp.filter(o=>String(o.status).toLowerCase()==='won').length} won, ${opp.filter(o=>String(o.status).toLowerCase()==='lost').length} lost.${range.from?' Date filter uses expected close date.':''}`);
 if(!oppOnly){lines.push(`${visits.length} matching visits: ${visits.filter(v=>v.visit_status==='Planned').length} planned, ${visits.filter(v=>v.visit_status==='Completed').length} completed, ${visits.filter(v=>v.visit_status==='Unclassified').length} historical/unclassified.`);for(const v of visits.slice(0,20))lines.push(`• ${String(v.visit_date).slice(0,10)} ${v.visit_time||''} — ${v.company_name} — ${v.salesperson||v.created_by} — ${v.visit_status}${v.purpose?': '+String(v.purpose).slice(0,160):''}${v.visit_status==='Completed'?' | Actual '+String(v.actual_visit_date).slice(0,10)+' | '+String(v.outcome||'').slice(0,200):''}`);if(visits.length>20)lines.push(`Showing first 20 of ${visits.length}; open Visits with the same filters for the full list.`);}
 if(oppOnly)for(const o of opp.slice(0,15))lines.push(`• ${o.company_name} — ${o.title} — ${o.stage} / ${o.status}`);
 if(!visitsOnly&&!oppOnly)lines.push(`${accounts.length} assigned accounts (current ownership). ${tasks.filter(t=>t.status!=='Completed').length} open follow-ups in the selected period; ${tasks.filter(t=>t.status!=='Completed'&&t.due_date&&String(t.due_date).slice(0,10)<range.today).length} overdue.`);
 if(!visits.length&&!oppOnly)lines.push('No matching visits are recorded. This does not establish whether unrecorded visits took place.');
 return {answer:lines.join('\n'),label:'CRM · '+scope.label,sourceSummary:'Live CRM database · exact counts; limited detail list'};
}
module.exports={crmBrief,bounds};
