import { useState, useEffect } from 'react';
import { FileText, Plus, Printer, CreditCard, CheckCircle, Clock, AlertCircle, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/client';
import { PageHeader, Modal, EmptyState } from '../../components/ui';

const fmt = n => `Rs ${Number(n||0).toLocaleString('en-PK',{maximumFractionDigits:0})}`;
const statusBadge = { unpaid:'badge-red', partial:'badge-yellow', paid:'badge-green', cancelled:'badge-gray' };
const statusIcon  = { unpaid:<AlertCircle size={11}/>, partial:<Clock size={11}/>, paid:<CheckCircle size={11}/>, cancelled:<X size={11}/> };

/* ── PRINT HELPERS ── */
function printLedger(inv, detail) {
  const payments = detail?.payments || [];
  const balance = parseFloat(inv.total_amount) - parseFloat(inv.paid_amount);
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Ledger – ${inv.invoice_no}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif}
    body{padding:32px;color:#111;background:#fff}
    .header{background:#1e3a5f;color:#fff;padding:20px 28px;display:flex;justify-content:space-between;align-items:center;border-radius:8px 8px 0 0}
    .brand{font-size:15px;font-weight:800}.addr{font-size:10px;color:#93c5fd;margin-top:2px}
    .inv-no{text-align:right;font-size:20px;font-weight:900}.inv-meta{font-size:10px;color:#93c5fd;margin-top:4px;line-height:1.8}
    .body{border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:20px 28px}
    .row{display:flex;justify-content:space-between;font-size:13px;padding:5px 0;border-bottom:1px solid #f3f4f6}
    .row.total{font-size:15px;font-weight:700;border-top:2px solid #1e3a5f;border-bottom:none;margin-top:4px;padding-top:8px;color:#1e3a5f}
    .row.paid{color:#059669}.row.bal{color:#dc2626;font-weight:700}
    .ph{font-size:11px;font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:1px;margin:16px 0 6px}
    .ptable{width:100%;border-collapse:collapse;font-size:12px}
    .ptable th{background:#f8fafc;padding:6px 10px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;border-bottom:1px solid #e5e7eb}
    .ptable td{padding:6px 10px;border-bottom:1px solid #f3f4f6}
    .foot{margin-top:20px;font-size:10px;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb;padding-top:10px}
    @media print{body{padding:0}}
  </style></head><body>
  <div class="header">
    <div><div class="brand">Brimi Dairies Private Limited</div><div class="addr">P-45, Chak 214 TDA, Bhakkar</div></div>
    <div class="inv-no">LEDGER – ${inv.invoice_no}<div class="inv-meta">Customer: <b>${inv.cname||inv.customer_name||'—'}</b><br>Date: <b>${inv.invoice_date}</b></div></div>
  </div>
  <div class="body">
    <div class="row"><span>Total Amount</span><span style="font-weight:700">${fmt(inv.total_amount)}</span></div>
    <div class="row paid"><span>Amount Paid</span><span>${fmt(inv.paid_amount)}</span></div>
    <div class="row bal"><span>Balance Due</span><span>${fmt(balance)}</span></div>
    <div class="row"><span>Status</span><span style="font-weight:700;text-transform:capitalize">${inv.status}</span></div>
    ${payments.length > 0 ? `
    <div class="ph">Payment History</div>
    <table class="ptable">
      <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>${payments.map(p=>`<tr>
        <td>${p.payment_date}</td><td style="text-transform:capitalize">${p.method}</td>
        <td>${p.reference||'—'}</td><td style="text-align:right;font-weight:600;color:#059669">${fmt(p.amount)}</td>
      </tr>`).join('')}</tbody>
    </table>` : ''}
    <div class="foot">Software-generated ledger — no physical signature required. E&amp;OE: Please verify all figures.</div>
  </div>
  </body></html>`);
  w.document.close(); w.focus(); setTimeout(()=>w.print(), 400);
}

function printPaymentSlip(inv, payment) {
  // payment = latest payment or a specific one
  const p = payment || (inv._lastPayment) || {};
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Payment Receipt – ${inv.invoice_no}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif}
    body{padding:32px;background:#fff;display:flex;justify-content:center}
    .slip{width:100%;max-width:520px}
    .header{background:#1e3a5f;color:#fff;padding:20px 24px;display:flex;justify-content:space-between;align-items:center;border-radius:8px 8px 0 0}
    .brand{font-size:14px;font-weight:800}.addr{font-size:10px;color:#93c5fd;margin-top:2px}
    .title{text-align:right;font-size:18px;font-weight:900}.meta{font-size:10px;color:#93c5fd;margin-top:4px;line-height:1.8}
    .body{border:1px solid #e5e7eb;border-top:none;padding:20px 24px;border-radius:0 0 8px 8px}
    .field{margin-bottom:12px}
    .flabel{font-size:9px;font-weight:800;letter-spacing:1.5px;color:#2563eb;text-transform:uppercase;margin-bottom:3px}
    .fval{font-size:13px;font-weight:600;color:#111;padding:7px 10px;border:1px solid #e5e7eb;border-radius:5px;background:#f8fafc}
    .fval.big{font-size:20px;font-weight:900;color:#1e3a5f;background:#eff6ff;border-color:#1e3a5f}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .confirmed{display:inline-block;background:#d1fae5;color:#065f46;padding:4px 14px;border-radius:20px;font-size:11px;font-weight:800;margin-top:8px}
    .foot{margin-top:16px;font-size:10px;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb;padding-top:10px}
    @media print{body{padding:0;display:block}}
  </style></head><body>
  <div class="slip">
  <div class="header">
    <div><div class="brand">Brimi Dairies Private Limited</div><div class="addr">P-45, Chak 214 TDA, Bhakkar</div></div>
    <div><div class="title">PAYMENT RECEIPT</div><div class="meta">Receipt for: <b>${inv.invoice_no}</b><br>Printed: <b>${new Date().toLocaleDateString('en-PK')}</b></div></div>
  </div>
  <div class="body">
    <div class="grid">
      <div class="field"><div class="flabel">Received From</div><div class="fval">${inv.cname||inv.customer_name||'—'}</div></div>
      <div class="field"><div class="flabel">Invoice #</div><div class="fval">${inv.invoice_no}</div></div>
    </div>
    <div class="field"><div class="flabel">Amount Received (Rs)</div><div class="fval big">${fmt(p.amount||inv.paid_amount)}</div></div>
    <div class="grid">
      <div class="field"><div class="flabel">Payment Date</div><div class="fval">${p.payment_date||inv.invoice_date}</div></div>
      <div class="field"><div class="flabel">Method</div><div class="fval" style="text-transform:capitalize">${p.method||'—'}</div></div>
    </div>
    ${(p.reference) ? `<div class="field"><div class="flabel">Reference / TID</div><div class="fval">${p.reference}</div></div>` : ''}
    <div class="confirmed">✔ Payment Confirmed</div>
    <div class="foot">Software-generated receipt — no physical signature required. E&amp;OE.</div>
  </div>
  </div></body></html>`);
  w.document.close(); w.focus(); setTimeout(()=>w.print(), 400);
}

export default function Invoices() {
  const [invoices, setInvoices]   = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(null);
  const [selInv, setSelInv]       = useState(null);
  const [detailData, setDetail]   = useState(null);
  const [saving, setSaving]       = useState(false);

  const emptyCreate = {
    customer_id: '', customer_type: 'bulk',
    invoice_date: new Date().toISOString().slice(0,10),
    amount: '', method: 'cash', tid: '', notes: '',
  };
  const [form, setForm]       = useState(emptyCreate);
  const [payForm, setPayForm] = useState({
    amount: '', payment_date: new Date().toISOString().slice(0,10), method: 'cash', reference: ''
  });

  const load = () => {
    setLoading(true);
    Promise.all([api.get('/invoices'), api.get('/customers?limit=500')])
      .then(([inv,c])=>{ setInvoices(inv.data.data||[]); setCustomers(c.data.data||[]); })
      .finally(()=>setLoading(false));
  };
  useEffect(()=>{ load(); },[]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.customer_id) return toast.error('Select a customer');
    if (!form.amount)      return toast.error('Enter amount');
    setSaving(true);
    try {
      const selCust = customers.find(c => String(c.id) === String(form.customer_id));
      const payload = {
        customer_id: form.customer_id, customer_type: form.customer_type,
        customer_name: selCust?.name || null, invoice_date: form.invoice_date,
        discount: 0, tax_pct: 0, notes: form.notes,
        items: [{ description: 'Payment', qty: 1, unit: 'pcs', rate: parseFloat(form.amount) }],
        ...(form.method !== 'cash' && form.tid ? { notes: `${form.notes?form.notes+' | ':''}TID: ${form.tid}` } : {}),
      };
      const r = await api.post('/invoices', payload);
      const invId = r.data.data.id;
      if (form.method !== 'credit') {
        await api.post(`/invoices/${invId}/payment`, {
          amount: form.amount, payment_date: form.invoice_date,
          method: form.method, reference: form.tid || '',
        }).catch(()=>{});
      }
      toast.success(`Invoice created: ${r.data.data.invoice_no}`);
      setForm(emptyCreate); setModal(null); load();
    } catch(err){ toast.error(err.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  };

  const openDetail = async (inv) => {
    setSelInv(inv); setModal('detail'); setDetail(null);
    const { data } = await api.get(`/invoices/${inv.id}`);
    setDetail(data.data);
    setPayForm(p=>({...p, amount:(parseFloat(data.data.total_amount)-parseFloat(data.data.paid_amount)).toFixed(0)}));
  };

  const onPayment = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await api.post(`/invoices/${selInv.id}/payment`, payForm);
      toast.success('Payment recorded');
      openDetail(selInv); load();
    } catch(err){ toast.error(err.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  };

  const totalOut = invoices.filter(i=>i.status!=='paid')
    .reduce((s,i)=>s+parseFloat(i.total_amount)-parseFloat(i.paid_amount),0);

  return (
    <div className="space-y-5">
      <PageHeader title="Invoices" subtitle="Billing, payments and receivables"
        action={<button onClick={()=>{ setForm(emptyCreate); setModal('create'); }} className="btn-primary"><Plus size={16}/>New Invoice</button>}/>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label:'Total Invoices',  value: invoices.length,                                        color:'text-slate-700' },
          { label:'Pending Amount',  value: fmt(totalOut),                                          color:'text-red-500' },
          { label:'Paid This Month', value: invoices.filter(i=>i.status==='paid').length+' invoices', color:'text-emerald-600' },
        ].map(({label,value,color})=>(
          <div key={label} className="card">
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="table-auto w-full">
          <thead><tr><th>Invoice #</th><th>Customer</th><th>Date</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {loading
              ? <tr><td colSpan={8} className="py-8 text-center text-slate-400">Loading…</td></tr>
              : invoices.length===0
                ? <tr><td colSpan={8}><EmptyState icon={FileText} title="No invoices" description="Create your first invoice"/></td></tr>
                : invoices.map(inv=>(
                  <tr key={inv.id} className="cursor-pointer" onClick={()=>openDetail(inv)}>
                    <td><span className="font-mono text-xs text-[#1d6faa] font-semibold">{inv.invoice_no}</span></td>
                    <td><div className="font-medium text-sm">{inv.cname||inv.customer_name||'—'}</div></td>
                    <td className="text-xs text-slate-500">{inv.invoice_date}</td>
                    <td className="font-mono font-semibold">{fmt(inv.total_amount)}</td>
                    <td className="font-mono text-emerald-600">{fmt(inv.paid_amount)}</td>
                    <td className="font-mono text-red-500">{fmt(parseFloat(inv.total_amount)-parseFloat(inv.paid_amount))}</td>
                    <td><span className={`badge text-xs flex items-center gap-1 w-fit ${statusBadge[inv.status]||'badge-gray'}`}>{statusIcon[inv.status]}{inv.status}</span></td>
                    <td onClick={e=>e.stopPropagation()}>
                      <div className="flex gap-1">
                        <button title="Print Ledger"
                          className="btn-ghost p-1.5 text-xs"
                          onClick={async()=>{ const {data}=await api.get(`/invoices/${inv.id}`); printLedger(inv, data.data); }}>
                          <Printer size={13}/>
                        </button>
                        <button title="Print Payment Receipt"
                          className="btn-ghost p-1.5 text-xs"
                          onClick={async()=>{ const {data}=await api.get(`/invoices/${inv.id}`); const d=data.data; const last=d.payments?.[d.payments.length-1]; printPaymentSlip(inv, last); }}>
                          <CreditCard size={13}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>

      {/* CREATE MODAL */}
      <Modal isOpen={modal==='create'} onClose={()=>setModal(null)} title="New Invoice" size="sm">
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label">Customer *</label>
            <select className="input" value={form.customer_id} onChange={e=>setForm(p=>({...p,customer_id:e.target.value}))} required>
              <option value="">Select customer…</option>
              {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Amount (PKR) *</label>
            <input type="number" step="1" min="1" value={form.amount}
              onChange={e=>setForm(p=>({...p,amount:e.target.value}))}
              className="input font-mono text-lg" placeholder="0" required/>
          </div>
          <div>
            <label className="label">Invoice Date</label>
            <input type="date" value={form.invoice_date}
              onChange={e=>setForm(p=>({...p,invoice_date:e.target.value}))} className="input"/>
          </div>
          <div>
            <label className="label">Payment Method</label>
            <div className="grid grid-cols-3 gap-2">
              {[{value:'cash',label:'💵 Cash'},{value:'online',label:'📲 Online'},{value:'credit',label:'📋 Credit'}].map(({value,label})=>(
                <button key={value} type="button" onClick={()=>setForm(p=>({...p,method:value,tid:''}))}
                  className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition ${form.method===value?'border-[#1d6faa] bg-blue-50 text-[#1d6faa]':'border-slate-200 text-slate-500'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {form.method==='online' && (
            <div>
              <label className="label">Transaction ID (optional)</label>
              <input value={form.tid} onChange={e=>setForm(p=>({...p,tid:e.target.value}))} className="input font-mono" placeholder="TXN123456"/>
            </div>
          )}
          {form.method==='credit' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800">
              Invoice will be saved as <b>unpaid</b>. Record payment later from invoice detail.
            </div>
          )}
          <div>
            <label className="label">Notes (optional)</label>
            <input value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} className="input" placeholder="e.g. milk supply Oct"/>
          </div>
          {form.amount>0 && (
            <div className="bg-blue-50 rounded-xl px-4 py-3 flex justify-between items-center">
              <span className="text-slate-600 font-medium">Total</span>
              <span className="font-mono font-bold text-xl text-[#1d6faa]">{fmt(form.amount)}</span>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={()=>setModal(null)} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving?'Creating…':'Create Invoice'}</button>
          </div>
        </form>
      </Modal>

      {/* DETAIL MODAL */}
      <Modal isOpen={modal==='detail'} onClose={()=>setModal(null)} title={`Invoice ${selInv?.invoice_no||''}`} size="md">
        {detailData ? (
          <div className="space-y-5">
            <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Customer</span><span className="font-semibold">{detailData.cname||detailData.customer_name}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Date</span><span>{detailData.invoice_date}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Total</span><span className="font-mono font-bold text-[#1d6faa]">{fmt(detailData.total_amount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Paid</span><span className="font-mono text-emerald-600">{fmt(detailData.paid_amount)}</span></div>
              {parseFloat(detailData.total_amount)-parseFloat(detailData.paid_amount)>0 && (
                <div className="flex justify-between font-semibold text-red-600 border-t border-slate-200 pt-2">
                  <span>Balance Due</span>
                  <span className="font-mono">{fmt(parseFloat(detailData.total_amount)-parseFloat(detailData.paid_amount))}</span>
                </div>
              )}
              <div className="pt-1"><span className={`badge text-xs ${statusBadge[detailData.status]||'badge-gray'}`}>{detailData.status}</span></div>
            </div>

            {detailData.status !== 'paid' && (
              <form onSubmit={onPayment} className="border border-emerald-200 bg-emerald-50 rounded-xl p-4 space-y-3">
                <p className="font-semibold text-sm text-emerald-700 flex items-center gap-2"><CreditCard size={13}/>Record Payment</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="label">Amount</label><input type="number" step="0.01" value={payForm.amount} onChange={e=>setPayForm(p=>({...p,amount:e.target.value}))} className="input font-mono"/></div>
                  <div><label className="label">Date</label><input type="date" value={payForm.payment_date} onChange={e=>setPayForm(p=>({...p,payment_date:e.target.value}))} className="input"/></div>
                  <div><label className="label">Method</label>
                    <select value={payForm.method} onChange={e=>setPayForm(p=>({...p,method:e.target.value}))} className="input">
                      <option value="cash">Cash</option><option value="bank">Bank Transfer</option>
                      <option value="cheque">Cheque</option><option value="upi">Easypaisa/JazzCash</option>
                    </select>
                  </div>
                  <div><label className="label">Reference / TID</label><input value={payForm.reference} onChange={e=>setPayForm(p=>({...p,reference:e.target.value}))} className="input" placeholder="Optional"/></div>
                </div>
                <button type="submit" disabled={saving} className="btn-primary w-full">{saving?'…':'Record Payment'}</button>
              </form>
            )}

            {detailData.payments?.length > 0 && (
              <div>
                <p className="font-semibold text-sm text-slate-600 mb-2">Payment History</p>
                {detailData.payments.map(p=>(
                  <div key={p.id} className="flex justify-between text-sm border border-slate-100 rounded-lg px-3 py-2 mb-1">
                    <span className="text-slate-500">{p.payment_date} · {p.method}{p.reference?` · ${p.reference}`:''}</span>
                    <span className="font-mono font-semibold text-emerald-600">{fmt(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Print buttons */}
            <div className="flex gap-2">
              <button onClick={()=>printLedger(selInv, detailData)} className="btn-ghost flex-1 text-sm">
                <Printer size={14}/> Print Ledger
              </button>
              <button onClick={()=>{ const last=detailData.payments?.[detailData.payments.length-1]; printPaymentSlip(selInv, last); }} className="btn-ghost flex-1 text-sm">
                <CreditCard size={14}/> Print Payment
              </button>
            </div>
          </div>
        ) : <div className="py-8 text-center text-slate-400">Loading…</div>}
      </Modal>
    </div>
  );
}
