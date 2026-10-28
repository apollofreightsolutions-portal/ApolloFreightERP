/* Reporting classification only: never deletes, closes or changes financial values. */
(function(root){
  const cutoff='2026-09-01', boundary=Date.parse('2026-09-01T00:00:00+03:00');
  function beforeCutoff(row){
    const value=row?.createdAt||row?.created_at;
    if(!value)return false; // Unknown creation dates are not silently classified as tests.
    if(/^\d{4}-\d{2}-\d{2}$/.test(String(value)))return String(value)<cutoff;
    const time=Date.parse(value);return Number.isFinite(time)&&time<boundary;
  }
  function prelive(row){return (row?.reportingMode||row?.reporting_mode)!=='live'&&beforeCutoff(row);}
  function classification(row,shipments=[]){
    if(row?.jobNo||row?.job_no)return {excluded:prelive(row),label:prelive(row)?'Pre-live / testing period':beforeCutoff(row)?'Live — management restored':'Live'};
    const reference=row?.shipmentNo||row?.shipment_no||row?.jobNumbers||row?.job_numbers||'';
    const refs=String(reference).split(/[,;\n]+/).map(s=>s.trim().toLowerCase()).filter(Boolean);
    const linked=shipments.filter(s=>refs.includes(String(s.jobNo||s.job_no||'').toLowerCase()));
    if(linked.length){
      const old=linked.filter(prelive).length;
      const mixed=old>0&&old<linked.length;
      return {excluded:old>0&&!(row.loadNo&&mixed),label:old===linked.length?'Pre-live / testing period':mixed?(row.loadNo?'Mixed live/pre-live — contains historical jobs':'Mixed live/pre-live — billing review required'):'Live'};
    }
    const excluded=beforeCutoff(row);
    return {excluded,label:excluded?'Pre-live / testing period':'Live'};
  }
  function page(total,requested=1,size=15){
    size=[15,30,50,100].includes(Number(size))?Number(size):15;
    const pages=Math.max(1,Math.ceil(total/size));
    const current=Math.min(pages,Math.max(1,Math.floor(Number(requested)||1)));
    return {size,pages,current,start:(current-1)*size,end:Math.min(current*size,total)};
  }
  function branchForShipment(row){
    const markers=String(row?.jobNo||row?.job_no||'').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
    if(markers.includes('KWI'))return 'Kuwait HO';
    if(markers.includes('DBX'))return 'Dubai';
    // AFS is shared by both branch serial formats; legacy numbers use the saved branch.
    return String(row?.branch||row?.branch_name||'');
  }
  const api={cutoff,beforeCutoff,prelive,classification,page,branchForShipment};
  root.ApolloShipmentReporting=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
