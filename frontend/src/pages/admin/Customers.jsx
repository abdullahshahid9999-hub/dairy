import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Search, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/client';
import { PageHeader, Modal, EmptyState } from '../../components/ui';

const fmt = n => `Rs ${Number(n||0).toLocaleString('en-PK',{maximumFractionDigits:0})}`;

const defaultForm = { name:'', phone:'', address:'', customer_type:'bulk', company_name:'', credit_limit:'', payment_terms:'monthly' };

function today() { return new Date().toISOString().slice(0,10); }

export default function Customers() {
  const nav = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [modal, setModal]         = useState(null);
  const [detail, setDetail]       = useState(null);
  const [selC, setSelC]           = useState(null);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState(defaultForm);
  const [bulkEntry, setBulkEntry] = useState({ qty_liters:'', rate:'', entry_date: today(), notes:'' });
  const [bulkBill, setBulkBill]   = useState({ date_from:'', date_to:'' });

  const loadAll = () => {
    setLoading(true);
    api.get(`/customers?search=${encodeURIComponent(search)}&type=bulk`)
      .then(r=>setCustomers(r.data.data||[])).finally(()=>setLoading(false));
  };
  useEffect(()=>{ loadAll(); }, [search]);

  const openDetail = async (c) => {
    setSelC(c); setModal('detail');
    const { data } = await api.get(`/customers/${c.id}`);
    setDetail(data.data);
  };

  const onAdd = async (e) => {
    e.preventDefault();
    if (!form.name) return toast.error('Name required');
    setSaving(true);
    try {
      await api.post('/customers', form);
      toast.success('Customer added');
      setModal(null); setForm(defaultForm); loadAll();
    } catch (err) { toast.error(err.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  };

  const [stockWarn, setStockWarn] = useState(null);

  const onBulkEntry = async (e) => {
    e.preventDefault();
    setStockWarn(null);
    setSaving(true);
    try {
      const r = await api.post(`/customers/${selC.id}/bulk-entry`, bulkEntry);
      toast.success(`Rs ${r.data.data.amount} added to account`);
      setBulkEntry({ qty_liters:'', rate:'', entry_date:today(), notes:'' });
      openDetail(selC);
    } catch (err) {
      const d = err.response?.data;
      if (d?.data?.available !== undefined) {
        setStockWarn({ available: d.data.available, requested: d.data.requested });
      }
      toast.error(d?.message || 'Failed');
    } finally { setSaving(false); }
  };

  const onBulkBill = async () => {
    setSaving(true);
    try {
      const r = await api.post(`/customers/${selC.id}/bulk-bill`, bulkBill);
      toast.success(`Bill generated: ${r.data.data.receipt_no}`);
      openDetail(selC);
    } catch (err) { toast.error(err.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  };

  const markPaid = async (cid, rid) => {
    await api.patch(`/customers/${cid}/receipts/${rid}/pay`);
    toast.success('Marked as paid'); openDetail(selC);
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Customers" subtitle="Bulk sale accounts"
        action={<button onClick={()=>setModal('add')} className="btn-primary"><Plus size={14}/>Add Customer</button>}/>

      <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name or phone…" className="input pl-9"/></div>

      <div className="card p-0 overflow-hidden">
        <table className="table-auto w-full">
          <thead><tr><th>Customer</th><th>Phone</th><th>Rate/L</th><th>Outstanding</th><th></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="py-8 text-center text-slate-400">Loading…</td></tr>
            : customers.length===0 ? <tr><td colSpan={5}><EmptyState icon={Users} title="No customers" description="Add your first customer"/></td></tr>
            : customers.map(c=>(
              <tr key={c.id} className="cursor-pointer" onClick={()=>openDetail(c)}>
                <td><div className="font-medium">{c.name}</div><div className="text-xs text-slate-400">{c.customer_code}{c.company_name?` · ${c.company_name}`:''}</div></td>
                <td className="text-sm text-slate-500">{c.phone||'—'}</td>
                <td className="font-mono text-sm">{parseFloat(c.rate_per_liter)>0?`${fmt(c.rate_per_liter)}/L`:'—'}</td>
                <td>{parseFloat(c.outstanding)>0?<span className="text-red-600 font-semibold font-mono">{fmt(c.outstanding)}</span>:<span className="text-emerald-500 text-xs">Clear</span>}</td>
                <td>
                <button onClick={(e)=>{ e.stopPropagation(); openDetail(c); }}
                  className="text-xs font-medium text-[#1d6faa] hover:underline">Sale →</button>
                <button onClick={(e)=>{ e.stopPropagation(); nav(`/admin/customers/${c.id}/ledger`); }}
                  className="text-xs font-medium text-slate-400 hover:underline ml-2">Ledger</button>
              </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── ADD CUSTOMER MODAL ─────────────────── */}
      <Modal isOpen={modal==='add'} onClose={()=>setModal(null)} title="Add Customer" size="md">
        <form onSubmit={onAdd} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="label">Name *</label><input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} className="input"/></div>
            <div><label className="label">Phone</label><input value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))} className="input"/></div>
            <div><label className="label">Rate/Liter (PKR)</label><input type="number" step="0.01" value={form.rate_per_liter} onChange={e=>setForm(p=>({...p,rate_per_liter:e.target.value}))} className="input font-mono"/></div>
            <div><label className="label">Company Name</label><input value={form.company_name} onChange={e=>setForm(p=>({...p,company_name:e.target.value}))} className="input"/></div>
            <div><label className="label">Credit Limit</label><input type="number" value={form.credit_limit} onChange={e=>setForm(p=>({...p,credit_limit:e.target.value}))} className="input font-mono"/></div>
            <div className="col-span-2"><label className="label">Payment Terms</label>
              <select value={form.payment_terms} onChange={e=>setForm(p=>({...p,payment_terms:e.target.value}))} className="input">
                <option value="weekly">Weekly</option><option value="monthly">Monthly</option>
              </select></div>
            <div className="col-span-2"><label className="label">Address</label><input value={form.address} onChange={e=>setForm(p=>({...p,address:e.target.value}))} className="input"/></div>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={()=>setModal(null)} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving?'Saving…':'Add Customer'}</button>
          </div>
        </form>
      </Modal>

      {/* ── CUSTOMER DETAIL MODAL ─────────────── */}
      <Modal isOpen={modal==='detail'} onClose={()=>{setModal(null);setDetail(null);}} title={selC?.name||''} size="md">
        {detail ? (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-400 mb-1">Type</p><p className="font-semibold flex items-center gap-1"><Building2 size={13}/>Bulk</p></div>
              <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-400 mb-1">Phone</p><p className="font-semibold">{detail.phone||'—'}</p></div>
              <div className="bg-red-50 rounded-xl p-3"><p className="text-xs text-slate-400 mb-1">Outstanding</p><p className="font-bold text-red-600">{fmt(detail.outstanding)}</p></div>
            </div>

            <div className="space-y-3">
              <form onSubmit={onBulkEntry} className="border border-slate-200 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-600">Record Delivery</p>
                {stockWarn && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                    <span className="text-red-500 text-lg leading-none">⚠️</span>
                    <div>
                      <p className="text-sm font-bold text-red-700">Insufficient Stock</p>
                      <p className="text-xs text-red-600 mt-0.5">
                        Requested: <b>{parseFloat(stockWarn.requested).toFixed(1)}L</b> — Available: <b>{parseFloat(stockWarn.available).toFixed(1)}L</b>
                      </p>
                      <p className="text-xs text-red-500 mt-1">Add more milk purchases before recording this delivery.</p>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <div><label className="label">Date</label><input type="date" value={bulkEntry.entry_date} onChange={e=>setBulkEntry(p=>({...p,entry_date:e.target.value}))} className="input"/></div>
                  <div><label className="label">Qty (L)</label><input type="number" step="0.1" value={bulkEntry.qty_liters} onChange={e=>setBulkEntry(p=>({...p,qty_liters:e.target.value}))} className="input font-mono"/></div>
                  <div><label className="label">Rate/L</label><input type="number" step="0.01" value={bulkEntry.rate} onChange={e=>setBulkEntry(p=>({...p,rate:e.target.value}))} className="input font-mono"/></div>
                </div>
                {bulkEntry.qty_liters && bulkEntry.rate && <div className="bg-blue-50 rounded-lg px-3 py-2 text-sm font-semibold text-[#1d6faa]">Total: {fmt(parseFloat(bulkEntry.qty_liters)*parseFloat(bulkEntry.rate))}</div>}
                <button type="submit" disabled={saving} className="btn-primary w-full">{saving?'…':'Add to Ledger'}</button>
              </form>
              <div className="border border-slate-200 rounded-xl p-4 space-y-2">
                <p className="text-sm font-semibold text-slate-600">Generate Bill</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="label">From</label><input type="date" value={bulkBill.date_from} onChange={e=>setBulkBill(p=>({...p,date_from:e.target.value}))} className="input"/></div>
                  <div><label className="label">To</label><input type="date" value={bulkBill.date_to} onChange={e=>setBulkBill(p=>({...p,date_to:e.target.value}))} className="input"/></div>
                </div>
                <button onClick={onBulkBill} disabled={saving||!bulkBill.date_from} className="btn-primary w-full">{saving?'…':'Generate Bill'}</button>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {detail.ledger?.map(l=>(
                  <div key={l.id} className="flex justify-between text-xs border border-slate-100 rounded-lg px-3 py-1.5">
                    <span className="text-slate-500">{l.entry_date} · {l.qty_liters}L @ {l.rate}</span>
                    <span className="font-semibold font-mono">{fmt(l.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">Receipts</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {detail.receipts?.length===0 ? <p className="text-slate-400 text-xs text-center py-3">No receipts yet</p>
                : detail.receipts?.map(r=>(
                  <div key={r.id} className="flex items-center justify-between text-sm border border-slate-100 rounded-lg px-3 py-2">
                    <div><p className="font-mono text-xs text-[#1d6faa]">{r.receipt_no}</p><p className="text-xs text-slate-400">{r.receipt_date} · {fmt(r.total_amount)}</p></div>
                    {r.status==='paid'
                      ? <span className="badge-green text-xs">Paid</span>
                      : <button onClick={()=>markPaid(detail.id,r.id)} className="badge-yellow text-xs cursor-pointer hover:bg-amber-200">Mark Paid</button>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : <div className="py-8 text-center text-slate-400 text-sm">Loading…</div>}
      </Modal>
    </div>
  );
}
