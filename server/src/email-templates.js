'use strict';
const fs=require('fs'),path=require('path');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TRACK='https://www.apollo-freight.com/tracking.html';
const PORTAL='https://www.apollo-freight.com/customer.html';
const NAFL='https://www.nafl.ae/downloads/NAFL-STC.pdf';
const logo=fs.readFileSync(path.join(__dirname,'../assets/email/apollo-brand.png'));
function emailAttachments(){return [{name:'apollo-brand.png',contentType:'image/png',contentId:'apollo-brand',isInline:true,contentBytes:logo.toString('base64')}];}
function button(url,label,color='#0A1C2E') {return `<a href="${esc(url)}" style="display:inline-block;background:${color};color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;text-decoration:none;padding:12px 8px;margin:3px 0">${esc(label)}</a>`;}
// Shipment CTAs must never share the narrow logo column. Each has its own
// full-width row with HTML nowrap as well as inline CSS (no media-query dependency).
function shipmentSignatureButton(url,label,color) {
 return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;table-layout:fixed;margin:0"><tr><td align="center" bgcolor="${color}" nowrap style="background:${color};text-align:center;white-space:nowrap;word-break:normal;overflow-wrap:normal"><a href="${esc(url)}" style="display:block;padding:12px 8px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;font-weight:bold;text-decoration:none;white-space:nowrap;word-break:normal;overflow-wrap:normal">${esc(label).replace(/ /g,'&nbsp;')}</a></td></tr><tr><td height="8" style="height:8px;line-height:8px;font-size:1px">&nbsp;</td></tr></table>`;
}
function signature(kind='shipment') {
 return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:28px;color:#0A1C2E"><tr>
 <td valign="top" style="padding:4px 12px 4px 0;width:52%;font-size:13px;line-height:20px"><p style="margin:0 0 10px">Best regards,</p><strong>Apollo Freight Solutions</strong><br><span style="color:#F15A24;font-weight:bold">Apollo Connected${kind==='hr'?' · HR Portal':''}</span><br><a href="https://www.apollo-freight.com/" style="color:#F15A24;font-size:11px">www.apollo-freight.com</a></td>
 <td valign="top" style="border-left:1px solid #D7DDE3;padding:3px 0 0 10px;width:48%"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="border-top:2px solid #F15A24;padding:8px 0"><a href="https://www.apollo-freight.com/"><img src="cid:apollo-brand" alt="Apollo Freight Solutions — Apollo.Connected." width="218" height="55" style="display:block;width:100%;max-width:218px;height:auto;border:0"></a></td></tr></table>
 </td></tr>${kind==='shipment'?`<tr><td colspan="2" style="padding:16px 0 0">${shipmentSignatureButton(TRACK,'TRACK SHIPMENT','#F15A24')}${shipmentSignatureButton(PORTAL,'CUSTOMER PORTAL','#0A1C2E')}</td></tr>`:''}</table>`;
}
function footer(kind) {
 return kind==='shipment'
 ? `<p style="margin:0 0 9px">APOLLO FREIGHT SOLUTIONS CO., (A.F.S) FZCO is a member of the National Association of Freight &amp; Logistics, Dubai (NAFL). All business is carried out subject to <a href="${NAFL}" style="color:#566474">NAFL standard Trading Conditions</a>.</p><p style="margin:0 0 9px"><strong>INSURANCE:</strong> Your shipments are not automatically insured. Insurance can be arranged against extra cost; contact your Apollo representative for details.</p><p style="margin:0">This is an automated shipment update. Please do not reply to this email, as this mailbox is not monitored. For assistance, contact your Apollo representative and quote your shipment or tracking number.</p>`
 : '<p style="margin:0 0 9px"><strong>CONFIDENTIAL:</strong> This HR notification is intended only for the employee and authorised reviewers. Do not forward personal leave details to unauthorised recipients.</p><p style="margin:0">This is an automated Apollo Connected HR notification. Please do not reply to this email; this mailbox is not monitored. Review and comment securely in the HR Portal, or contact HR for assistance.</p>';
}
function frame(title,body,kind='shipment') {
 return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"></head><body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#172033"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8"><tr><td align="center" style="padding:20px 8px"><table role="presentation" width="620" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;text-align:left;background:#ffffff;border:1px solid #e5e7eb"><tr><td style="background:#101827;padding:24px;color:#ffffff;border-bottom:3px solid #F15A24"><div style="font-size:23px;font-weight:bold">Apollo Connected</div><div style="font-size:13px;margin-top:6px;color:#cbd5e1">${esc(title)}</div></td></tr><tr><td style="padding:24px;font-size:15px;line-height:1.5">${body}${signature(kind)}</td></tr><tr><td style="padding:18px 24px;color:#647180;font-size:10px;line-height:15px;border-top:1px solid #D7DDE3">${footer(kind)}</td></tr></table></td></tr></table></body></html>`;
}
function details(rows){return `<table role="presentation" width="100%" cellspacing="0" cellpadding="8" style="border-collapse:collapse;font-size:14px">${rows.map(([label,value])=>`<tr><td style="width:42%;font-weight:bold;border-bottom:1px solid #eef0f2;vertical-align:top">${esc(label)}</td><td style="border-bottom:1px solid #eef0f2;overflow-wrap:anywhere">${esc(value)}</td></tr>`).join('')}</table>`;}
function shipmentUpdateEmailHtml({shipment,latestHistory}) {
 const date=new Date(latestHistory?.updated_at||shipment.updated_at||Date.now());
 const rows=[['Shipment No.',shipment.job_no]];
 if(shipment.airway_bill_no)rows.push(['Tracking / AWB',shipment.airway_bill_no]);
 rows.push(['Origin',shipment.origin],['Destination',shipment.destination],['Current Status',shipment.status||'Updated'],['POD Status',shipment.pod_status||'Not available'],['Updated (Dubai time)',Number.isNaN(date.getTime())?'Not available':date.toLocaleString('en-GB',{timeZone:'Asia/Dubai'})]);
 // Internal history notes are never customer-facing. Do not guess using keyword filters.
 return frame('Shipment status update',`<p style="margin:0 0 16px">Dear ${esc(String(shipment.customer_name||'').trim()||'Customer')},</p><p>Your shipment status has been updated.</p><p style="background:#f4f6f8;border-left:3px solid #F15A24;padding:12px 16px;font-size:19px;font-weight:bold">${esc(shipment.status||'Updated')}</p>${details(rows)}`);
}
function hrEmailHtml(row,event,events) {
 const origin=String(process.env.APP_PUBLIC_URL||'https://connected.apollo-freight.com').replace(/\/$/,'');
 const url=new URL('/hr-approvals.html',origin);url.searchParams.set('request',row.request_no);
 const link=action=>{const u=new URL(url);u.searchParams.set('action',action);return u.href;};
 const date=v=>v instanceof Date?v.toISOString().slice(0,10):String(v||'').slice(0,10);
 return frame('HR Portal · Leave '+event,`<p><strong>${esc(row.employee_name||row.user_name)}</strong> · ${esc(row.request_no)}</p>${details([['Leave type',row.leave_type],['Dates',date(row.start_date)+' to '+date(row.end_date)],['Days',row.actual_leave_days??row.total_days],['Status',row.status],['Review stage',row.approval_stage]])}<p><strong>Employee reason:</strong><br>${esc(row.reason)}</p>${events.map(e=>`<p style="padding:10px 12px;background:#f4f6f8;border-left:3px solid #F15A24"><strong>${esc(e.actor)} — ${esc(e.action)}</strong><br>${esc(e.comment)}</p>`).join('')}<p>${['approve','reject','sendback','forward'].map((a,i)=>button(link(a),['Approve','Deny','Return with comments','Forward'][i],i===0?'#F15A24':'#0A1C2E')).join(' ')}</p><p style="font-size:12px;color:#647180">Sign in with your own Employee/HR account. Links only open the request; nothing is decided until you confirm. The portal always shows the current status and the actions permitted for your account.</p>`,'hr');
}
module.exports={shipmentUpdateEmailHtml,hrEmailHtml,emailAttachments,signature};
