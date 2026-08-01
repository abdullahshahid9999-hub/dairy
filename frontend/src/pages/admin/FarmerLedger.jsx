import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import api from '../../api/client';

const fmt  = n => `Rs ${Number(n||0).toLocaleString('en-PK',{maximumFractionDigits:0})}`;
const fmtL = n => `${Number(n||0).toFixed(1)}L`;
const PERIODS = [{l:'All',v:''},{l:'This Month',v:'1m'},{l:'3 Months',v:'3m'},{l:'6 Months',v:'6m'},{l:'1 Year',v:'1y'}];

function dateRange(p){
  const now=new Date(),fmt=d=>d.toISOString().slice(0,10),e=fmt(now);
  if(!p)return{};
  if(p==='1m')return{date_from:fmt(new Date(now.getFullYear(),now.getMonth(),1)),date_to:e};
  if(p==='3m')return{date_from:fmt(new Date(now.getFullYear(),now.getMonth()-2,1)),date_to:e};
  if(p==='6m')return{date_from:fmt(new Date(now.getFullYear(),now.getMonth()-5,1)),date_to:e};
  if(p==='1y')return{date_from:fmt(new Date(now.getFullYear()-1,now.getMonth(),1)),date_to:e};
  return{};
}

export default function FarmerLedger(){
  const {id}=useParams();const nav=useNavigate();
  const [data,setData]=useState(null);const [period,setPeriod]=useState('1m');const [loading,setLoading]=useState(true);

  useEffect(()=>{
    setLoading(true);
    const r=dateRange(period);
    const q=new URLSearchParams(r).toString();
    api.get(`/farmers/${id}/ledger?${q}`).then(r=>setData(r.data.data)).finally(()=>setLoading(false));
  },[id,period]);

  if(loading)return<div className="flex items-center justify-center h-64 text-slate-400">Loading…</div>;
  if(!data)return<div className="text-center text-slate-400 py-20">Farmer not found</div>;

  const {farmer,records,bills,totalEarned,totalPaid,pending}=data;

  return(
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <button onClick={()=>nav(-1)} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={18}/></button>
        <div>
          <h1 className="text-xl font-bold text-slate-800">{farmer.name}</h1>
          <p className="text-xs text-slate-400">{farmer.farmer_code} · {farmer.phone||'—'}</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {l:'Total Earned',v:fmt(totalEarned),c:'text-emerald-600'},
          {l:'Total Paid',  v:fmt(totalPaid),  c:'text-blue-600'},
          {l:'Pending',     v:fmt(pending),     c:pending>0?'text-red-600':'text-emerald-600'},
        ].map(({l,v,c})=>(
          <div key={l} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center">
            <p className="text-xs text-slate-400 mb-1">{l}</p>
            <p className={`font-bold text-base font-mono ${c}`}>{v}</p>
          </div>
        ))}
      </div>

      {/* Period filter */}
      <div className="flex gap-2 flex-wrap">
        {PERIODS.map(p=>(
          <button key={p.v} onClick={()=>setPeriod(p.v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition
              ${period===p.v?'bg-[#1d6faa] text-white border-[#1d6faa]':'bg-white border-slate-200 text-slate-500'}`}>
            {p.l}
          </button>
        ))}
      </div>

      {/* Milk records */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
          <p className="font-semibold text-slate-700 text-sm">Milk Records ({records.length})</p>
          <p className="text-xs text-slate-400">{fmtL(records.reduce((s,r)=>s+parseFloat(r.quantity_liters||0),0))} · {fmt(totalEarned)}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead><tr className="bg-slate-50 text-xs text-slate-400 uppercase">
              <th className="px-4 py-2.5 text-left">Date</th>
              <th className="px-4 py-2.5 text-right">Qty(L)</th>
              <th className="px-4 py-2.5 text-right">FAT%</th>
              <th className="px-4 py-2.5 text-right">LR</th>
              <th className="px-4 py-2.5 text-right">TS</th>
              <th className="px-4 py-2.5 text-right">Std.Qty</th>
              <th className="px-4 py-2.5 text-right">Rate</th>
              <th className="px-4 py-2.5 text-right">Amount</th>
            </tr></thead>
            <tbody>
              {records.length===0
                ? <tr><td colSpan={8} className="text-center text-slate-400 py-8 text-xs">No records in this period</td></tr>
                : records.map((r,i)=>(
                <tr key={r.id} className={i%2===0?'':'bg-slate-50/40'}>
                  <td className="px-4 py-2.5 text-xs text-slate-600">{r.collection_date}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{fmtL(r.quantity_liters)}</td>
                  <td className="px-4 py-2.5 text-right text-xs">{parseFloat(r.fat_percentage||0).toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right text-xs">{r.lactometer_reading||'—'}</td>
                  <td className="px-4 py-2.5 text-right text-xs">{r.ts_value?parseFloat(r.ts_value).toFixed(3):'—'}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-violet-600">{r.standardised_ts?parseFloat(r.standardised_ts).toFixed(2):'—'}</td>
                  <td className="px-4 py-2.5 text-right text-xs">{r.computed_rate?parseFloat(r.computed_rate).toFixed(2):'—'}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-emerald-600 text-xs">{fmt(r.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bills */}
      {bills.length>0&&(
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="font-semibold text-slate-700 text-sm">Bills ({bills.length})</p>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-xs text-slate-400 uppercase">
              <th className="px-4 py-2.5 text-left">Bill #</th>
              <th className="px-4 py-2.5 text-left">Period</th>
              <th className="px-4 py-2.5 text-right">Liters</th>
              <th className="px-4 py-2.5 text-right">Net Payable</th>
              <th className="px-4 py-2.5 text-center">Status</th>
            </tr></thead>
            <tbody>
              {bills.map((b,i)=>(
                <tr key={i} className={i%2===0?'':'bg-slate-50/40'}>
                  <td className="px-4 py-2.5 font-mono text-xs text-[#1d6faa]">{b.bill_number}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{b.period_month}/{b.period_year}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{fmtL(b.total_liters)}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-emerald-600 text-xs">{fmt(b.net_payable)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
                      ${b.status==='paid'?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}`}>
                      {b.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
