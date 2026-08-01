import { useState, useEffect } from 'react';
import { FileText, Plus, Printer, CreditCard, CheckCircle, Clock, AlertCircle, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/client';
import { PageHeader, Modal, EmptyState } from '../../components/ui';

const fmt = n => `Rs ${Number(n||0).toLocaleString('en-PK',{maximumFractionDigits:0})}`;
const statusBadge = { unpaid:'badge-red', partial:'badge-yellow', paid:'badge-green', cancelled:'badge-gray' };
const statusIcon  = { unpaid:<AlertCircle size={11}/>, partial:<Clock size={11}/>, paid:<CheckCircle size={11}/>, cancelled:<X size={11}/> };

export default function Invoices() {
  const [invoices, setInvoices]   = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(null);
  const [selInv, setSelInv]       = useState(null);
  const [detailData, setDetail]   = useState(null);
  const [saving, setSaving]       = useState(false);

  // Simplified create form
  const emptyCreate = {
    customer_id: '',
    customer_type: 'bulk',
    invoice_date: new Date().toISOString().slice(0,10),
    amount: '',
    method: 'cash',
    tid: '',
    notes: '',
  };
  const [form, setForm]       = useState(emptyCreate);

  // Pay form
  const [payForm, setPayForm] = useState({
    amount: '', payment_date: new Date().toISOString().slice(0,10), method: 'cash', reference: ''
  });

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/invoices'),
      api.get('/customers?limit=500'),
    ]).then(([inv,c])=>{
      setInvoices(inv.data.data||[]);
      setCustomers(c.data.data||[]);
    }).finally(()=>setLoading(false));
  };
  useEffect(()=>{ load(); },[]);

  const onCustomerSelect = (id) => {
    setForm(p=>({...p, customer_id:id}));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.customer_id) return toast.error('Select a customer');
    if (!form.amount)      return toast.error('Enter amount');
    setSaving(true);
    try {
      // Build a simple single-item invoice
      const selCust = customers.find(c => String(c.id) === String(form.customer_id));
      const payload = {
        customer_id:   form.customer_id,
        customer_type: form.customer_type,
        customer_name: selCust?.name || null,
        invoice_date:  form.invoice_date,
        discount: 0, tax_pct: 0,
        notes: form.notes,
        items: [{ description: 'Payment', qty: 1, unit: 'pcs', rate: parseFloat(form.amount) }],
        // If paid immediately via online, record payment info in notes
        ...(form.method !== 'cash' && form.tid
          ? { notes: `${form.notes ? form.notes+' | ':'' }TID: ${form.tid}` }
          : {}),
      };
      const r = await api.post('/invoices', payload);
      const invId = r.data.data.id;

      // If method is not credit (i.e. paying now), auto-record payment
      if (form.method !== 'credit') {
        await api.post(`/invoices/${invId}/payment`, {
          amount: form.amount,
          payment_date: form.invoice_date,
          method: form.method,
          reference: form.tid || '',
        }).catch(()=>{}); // ignore if fails — invoice still created
      }

      toast.success(`Invoice created: ${r.data.data.invoice_no}`);
      setForm(emptyCreate); setCustCat('');
      setModal(null); load();
    } catch(err){ toast.error(err.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  };

  const openDetail = async (inv) => {
    setSelInv(inv); setModal('detail'); setDetail(null);
    const { data } = await api.get(`/invoices/${inv.id}`);
    setDetail(data.data);
    setPayForm(p=>({
      ...p,
      amount: (parseFloat(data.data.total_amount)-parseFloat(data.data.paid_amount)).toFixed(0)
    }));
  };

  const onPayment = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/invoices/${selInv.id}/payment`, payForm);
      toast.success('Payment recorded');
      openDetail(selInv); load();
    } catch(err){ toast.error(err.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  };

  const totalOut = invoices
    .filter(i=>i.status!=='paid')
    .reduce((s,i)=>s+parseFloat(i.total_amount)-parseFloat(i.paid_amount),0);

  return (
    <div className="space-y-5">
      <PageHeader title="Invoices" subtitle="Billing, payments and receivables"
        action={<button onClick={()=>{ setForm(emptyCreate); setModal('create'); }} className="btn-primary"><Plus size={16}/>New Invoice</button>}/>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label:'Total Invoices',  value: invoices.length,                                   color:'text-slate-700' },
          { label:'Pending Amount',  value: fmt(totalOut),                                     color:'text-red-500' },
          { label:'Paid This Month', value: invoices.filter(i=>i.status==='paid').length+' invoices', color:'text-emerald-600' },
        ].map(({label,value,color})=>(
          <div key={label} className="card">
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* List */}
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
                    <td><button className="btn-ghost p-1.5" onClick={e=>{e.stopPropagation();}}><Printer size={13}/></button></td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>

      {/* ── CREATE INVOICE MODAL (simplified) ── */}
      <Modal isOpen={modal==='create'} onClose={()=>setModal(null)} title="New Invoice" size="sm">
        <form onSubmit={onSubmit} className="space-y-4">

          {/* Customer */}
          <div>
            <label className="label">Customer *</label>
            <select className="input" value={form.customer_id} onChange={e=>onCustomerSelect(e.target.value)} required>
              <option value="">Select customer…</option>
              {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Step 2: Amount */}
          <div>
            <label className="label">Amount (PKR) *</label>
            <input
              type="number" step="1" min="1"
              value={form.amount}
              onChange={e=>setForm(p=>({...p,amount:e.target.value}))}
              className="input font-mono text-lg"
              placeholder="0"
              required
            />
          </div>

          {/* Step 3: Invoice Date */}
          <div>
            <label className="label">Invoice Date</label>
            <input type="date" value={form.invoice_date}
              onChange={e=>setForm(p=>({...p,invoice_date:e.target.value}))} className="input"/>
          </div>

          {/* Step 4: Payment Method */}
          <div>
            <label className="label">Payment Method</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value:'cash',   label:'💵 Cash' },
                { value:'online', label:'📲 Online' },
                { value:'credit', label:'📋 Credit' },
              ].map(({value,label})=>(
                <button key={value} type="button" onClick={()=>setForm(p=>({...p,method:value,tid:''}))}
                  className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition
                    ${form.method===value?'border-[#1d6faa] bg-blue-50 text-[#1d6faa]':'border-slate-200 text-slate-500'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* TID only for online */}
          {form.method==='online' && (
            <div>
              <label className="label">Transaction ID (optional)</label>
              <input
                value={form.tid}
                onChange={e=>setForm(p=>({...p,tid:e.target.value}))}
                className="input font-mono"
                placeholder="TXN123456"
              />
            </div>
          )}

          {form.method==='credit' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800">
              Invoice will be saved as <b>unpaid</b>. Record payment later from the invoice detail.
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

      {/* ── DETAIL MODAL ── */}
      <Modal isOpen={modal==='detail'} onClose={()=>setModal(null)} title={`Invoice ${selInv?.invoice_no||''}`} size="md">
        {detailData ? (
          <div className="space-y-5">
            {/* Summary */}
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
              <div className="pt-1">
                <span className={`badge text-xs ${statusBadge[detailData.status]||'badge-gray'}`}>{detailData.status}</span>
              </div>
            </div>

            {/* Record Payment */}
            {detailData.status !== 'paid' && (
              <form onSubmit={onPayment} className="border border-emerald-200 bg-emerald-50 rounded-xl p-4 space-y-3">
                <p className="font-semibold text-sm text-emerald-700 flex items-center gap-2"><CreditCard size={13}/>Record Payment</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">Amount</label>
                    <input type="number" step="0.01" value={payForm.amount}
                      onChange={e=>setPayForm(p=>({...p,amount:e.target.value}))} className="input font-mono"/>
                  </div>
                  <div>
                    <label className="label">Date</label>
                    <input type="date" value={payForm.payment_date}
                      onChange={e=>setPayForm(p=>({...p,payment_date:e.target.value}))} className="input"/>
                  </div>
                  <div>
                    <label className="label">Method</label>
                    <select value={payForm.method} onChange={e=>setPayForm(p=>({...p,method:e.target.value}))} className="input">
                      <option value="cash">Cash</option>
                      <option value="bank">Bank Transfer</option>
                      <option value="cheque">Cheque</option>
                      <option value="upi">Easypaisa/JazzCash</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Reference / TID</label>
                    <input value={payForm.reference} onChange={e=>setPayForm(p=>({...p,reference:e.target.value}))} className="input" placeholder="Optional"/>
                  </div>
                </div>
                <button type="submit" disabled={saving} className="btn-primary w-full">{saving?'…':'Record Payment'}</button>
              </form>
            )}

            {/* Payment history */}
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

            <button onClick={()=>window.print()} className="btn-ghost w-full text-sm"><Printer size={14}/>Print Invoice</button>
          </div>
        ) : <div className="py-8 text-center text-slate-400">Loading…</div>}
      </Modal>
    </div>
  );
}
