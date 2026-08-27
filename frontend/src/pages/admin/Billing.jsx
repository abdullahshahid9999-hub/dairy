import { useState, useEffect } from 'react';
import { FileText, Plus, Zap, CreditCard, ChevronRight, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/client';
import { PageHeader, Modal, SkeletonRow, EmptyState } from '../../components/ui';

const STATUS_BADGE={generated:'badge-yellow',paid:'badge-green',cancelled:'badge-red',open:'badge-blue',closed:'badge-gray'};
const fmtPKR=n=>`Rs ${Number(n||0).toLocaleString('en-PK',{maximumFractionDigits:0})}`;
const MONTHS=['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function printLedger(b, period) {
  const w = window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ledger – ${b.bill_number}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif}
  body{padding:32px;background:#fff}
  .header{background:#1e3a5f;color:#fff;padding:20px 28px;display:flex;justify-content:space-between;align-items:center;border-radius:8px 8px 0 0}
  .brand{font-size:15px;font-weight:800}.addr{font-size:10px;color:#93c5fd;margin-top:2px}
  .title{text-align:right;font-size:18px;font-weight:900}.meta{font-size:10px;color:#93c5fd;margin-top:4px;line-height:1.8}
  .body{border:1px solid #e5e7eb;border-top:none;padding:20px 28px;border-radius:0 0 8px 8px}
  .row{display:flex;justify-content:space-between;font-size:13px;padding:6px 0;border-bottom:1px solid #f3f4f6}
  .row.total{font-size:15px;font-weight:700;border-top:2px solid #1e3a5f;border-bottom:none;margin-top:4px;padding-top:8px;color:#1e3a5f}
  .foot{margin-top:16px;font-size:10px;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb;padding-top:10px}
  @media print{body{padding:0}}</style></head><body>
  <div class="header">
    <div><div class="brand">Brimi Dairies Private Limited</div><div class="addr">P-45, Chak 214 TDA, Bhakkar</div></div>
    <div><div class="title">FARMER LEDGER</div><div class="meta">Bill #: <b>${b.bill_number}</b><br>Period: <b>${MONTHS[period?.period_month]} ${period?.period_year}</b></div></div>
  </div>
  <div class="body">
    <div class="row"><span>Farmer</span><span style="font-weight:700">${b.farmer_name} (${b.farmer_code})</span></div>
    <div class="row"><span>Total Liters</span><span>${Number(b.total_liters).toFixed(1)} L</span></div>
    <div class="row"><span>Total Amount</span><span style="font-weight:700">${fmtPKR(b.total_amount)}</span></div>
    <div class="row"><span>Deductions</span><span>${fmtPKR(parseFloat(b.total_amount)-parseFloat(b.net_payable))}</span></div>
    <div class="row total"><span>Net Payable</span><span>${fmtPKR(b.net_payable)}</span></div>
    <div class="row"><span>Status</span><span style="text-transform:capitalize;font-weight:600">${b.status}</span></div>
    <div class="foot">Software-generated ledger — no physical signature required. E&amp;OE.</div>
  </div></body></html>`);
  w.document.close(); w.focus(); setTimeout(()=>w.print(),400);
}

function printPaymentSlip(b, period) {
  const w = window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Payment – ${b.bill_number}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif}
  body{padding:32px;background:#fff;display:flex;justify-content:center}
  .slip{width:100%;max-width:500px}
  .header{background:#1e3a5f;color:#fff;padding:20px 24px;display:flex;justify-content:space-between;align-items:center;border-radius:8px 8px 0 0}
  .brand{font-size:14px;font-weight:800}.addr{font-size:10px;color:#93c5fd;margin-top:2px}
  .title{text-align:right;font-size:18px;font-weight:900}.meta{font-size:10px;color:#93c5fd;margin-top:4px;line-height:1.8}
  .body{border:1px solid #e5e7eb;border-top:none;padding:20px 24px;border-radius:0 0 8px 8px}
  .fl{font-size:9px;font-weight:800;letter-spacing:1.5px;color:#2563eb;text-transform:uppercase;margin-bottom:3px}
  .fv{font-size:13px;font-weight:600;padding:7px 10px;border:1px solid #e5e7eb;border-radius:5px;background:#f8fafc;margin-bottom:12px}
  .fv.big{font-size:20px;font-weight:900;color:#1e3a5f;background:#eff6ff;border-color:#1e3a5f}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .confirmed{display:inline-block;background:#d1fae5;color:#065f46;padding:4px 14px;border-radius:20px;font-size:11px;font-weight:800;margin-top:4px}
  .foot{margin-top:16px;font-size:10px;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb;padding-top:10px}
  @media print{body{padding:0;display:block}}</style></head><body>
  <div class="slip">
  <div class="header">
    <div><div class="brand">Brimi Dairies Private Limited</div><div class="addr">P-45, Chak 214 TDA, Bhakkar</div></div>
    <div><div class="title">PAYMENT RECEIPT</div><div class="meta">Bill #: <b>${b.bill_number}</b><br>Period: <b>${MONTHS[period?.period_month]} ${period?.period_year}</b></div></div>
  </div>
  <div class="body">
    <div class="fl">Paid To (Farmer)</div><div class="fv">${b.farmer_name} — ${b.farmer_code}</div>
    <div class="fl">Amount Paid (Rs)</div><div class="fv big">${fmtPKR(b.net_payable)}</div>
    <div class="grid">
      <div><div class="fl">Payment Date</div><div class="fv">${new Date().toLocaleDateString('en-PK')}</div></div>
      <div><div class="fl">Status</div><div class="fv" style="text-transform:capitalize">${b.status}</div></div>
    </div>
    <div class="confirmed">✔ Payment Confirmed</div>
    <div class="foot">Software-generated receipt — no physical signature required. E&amp;OE.</div>
  </div></div></body></html>`);
  w.document.close(); w.focus(); setTimeout(()=>w.print(),400);
}

export default function Billing() {
  const [periods,setPeriods]=useState([]); const [bills,setBills]=useState([]);
  const [selPeriod,setSelPeriod]=useState(null); const [loadP,setLoadP]=useState(true);
  const [loadB,setLoadB]=useState(false); const [generating,setGenerating]=useState(false);
  const [npm,setNpm]=useState(false); const [saving,setSaving]=useState(false);
  const [pf,setPf]=useState({period_month:new Date().getMonth()+1,period_year:new Date().getFullYear()});

  const loadPeriods=()=>{setLoadP(true);api.get('/billing/periods').then(r=>setPeriods(r.data.data||[])).finally(()=>setLoadP(false));};
  useEffect(()=>{loadPeriods();},[]);

  const loadBills=(p)=>{setSelPeriod(p);setLoadB(true);api.get(`/billing/bills?period_id=${p.id}`).then(r=>setBills(r.data.data||[])).finally(()=>setLoadB(false));};

  const createPeriod=async(e)=>{e.preventDefault();setSaving(true);try{await api.post('/billing/periods',pf);toast.success('Period created');setNpm(false);loadPeriods();}catch(err){toast.error(err.response?.data?.message||'Failed');}finally{setSaving(false);}};

  const generateBills=async()=>{if(!selPeriod)return;setGenerating(true);try{const r=await api.post('/billing/generate',{billing_period_id:selPeriod.id});toast.success(r.data.message);loadBills(selPeriod);}catch(err){toast.error(err.response?.data?.message||'Failed');}finally{setGenerating(false);}};

  const markPaid=async(id)=>{try{await api.patch(`/billing/bills/${id}/pay`);toast.success('Marked paid');loadBills(selPeriod);}catch(err){toast.error(err.response?.data?.message||'Failed');}};

  return (
    <div className="space-y-5">
      <PageHeader title="Billing" subtitle="Farmer payment billing periods"
        action={<button onClick={()=>setNpm(true)} className="btn-primary"><Plus size={16}/>New Period</button>}/>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Periods</p>
          {loadP?[...Array(4)].map((_,i)=><div key={i} className="card animate-pulse h-16"/>):
           periods.length===0?<div className="card"><EmptyState icon={FileText} title="No periods"/></div>:
           periods.map(p=>(
            <button key={p.id} onClick={()=>loadBills(p)} className={`card w-full text-left hover:shadow-md transition ${selPeriod?.id===p.id?'ring-2 ring-[#1d6faa]':''}`}>
              <div className="flex items-center justify-between">
                <div><p className="font-semibold">{MONTHS[p.period_month]} {p.period_year}</p>
                <p className="text-xs text-slate-400">{p.bill_count||0} bills · {fmtPKR(p.total_payable)}</p></div>
                <div className="flex items-center gap-2"><span className={`badge text-xs ${STATUS_BADGE[p.status]||'badge-gray'}`}>{p.status}</span><ChevronRight size={14} className="text-slate-300"/></div>
              </div>
            </button>
          ))}
        </div>
        <div className="lg:col-span-2 space-y-4">
          {selPeriod?(
            <>
              <div className="card flex flex-wrap items-center gap-3">
                <div className="flex-1"><p className="font-semibold">{MONTHS[selPeriod.period_month]} {selPeriod.period_year}</p><p className="text-xs text-slate-400">{bills.length} bills</p></div>
                <button onClick={generateBills} disabled={generating||selPeriod.status==='closed'} className="btn-primary text-sm"><Zap size={14}/>{generating?'Generating…':'Generate Bills'}</button>
              </div>
              <div className="card p-0 overflow-hidden">
                <table className="table-auto w-full">
                  <thead><tr><th>Bill #</th><th>Farmer</th><th>Liters</th><th>Amount</th><th>Net Payable</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {loadB?[...Array(5)].map((_,i)=><SkeletonRow key={i} cols={7}/>):
                     bills.length===0?<tr><td colSpan={7}><EmptyState icon={FileText} title="No bills" description="Generate bills first"/></td></tr>:
                     bills.map(b=>(
                      <tr key={b.id}>
                        <td className="font-mono text-xs text-[#1d6faa]">{b.bill_number}</td>
                        <td><div className="font-medium text-sm">{b.farmer_name}</div><div className="text-xs text-slate-400">{b.farmer_code}</div></td>
                        <td className="font-mono">{Number(b.total_liters).toFixed(1)}</td>
                        <td className="font-mono">{fmtPKR(b.total_amount)}</td>
                        <td className="font-mono font-semibold text-[#1d6faa]">{fmtPKR(b.net_payable)}</td>
                        <td><span className={`badge text-xs ${STATUS_BADGE[b.status]||'badge-gray'}`}>{b.status}</span></td>
                        <td>
                          <div className="flex gap-1 items-center">
                            {b.status==='generated'&&<button onClick={()=>markPaid(b.id)} className="btn-ghost text-xs py-1 px-2"><CreditCard size={12}/>Pay</button>}
                            <button title="Print Ledger" onClick={()=>printLedger(b,selPeriod)} className="btn-ghost p-1.5"><Printer size={13}/></button>
                            <button title="Print Payment" onClick={()=>printPaymentSlip(b,selPeriod)} className="btn-ghost p-1.5"><CreditCard size={13}/></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {bills.length>0&&<div className="card flex justify-between font-semibold text-sm">
                <span>Total Payable</span><span className="font-mono text-[#1d6faa] text-lg">{fmtPKR(bills.reduce((s,b)=>s+parseFloat(b.net_payable||0),0))}</span>
              </div>}
            </>
          ):<div className="card h-48 flex items-center justify-center text-slate-400 text-sm">← Select a period</div>}
        </div>
      </div>
      <Modal isOpen={npm} onClose={()=>setNpm(false)} title="New Billing Period" size="sm">
        <form onSubmit={createPeriod} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Month (1-12)</label><input type="number" min="1" max="12" value={pf.period_month} onChange={e=>setPf(p=>({...p,period_month:+e.target.value}))} className="input font-mono"/></div>
            <div><label className="label">Year</label><input type="number" min="2020" value={pf.period_year} onChange={e=>setPf(p=>({...p,period_year:+e.target.value}))} className="input font-mono"/></div>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={()=>setNpm(false)} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving?'Creating…':'Create'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
