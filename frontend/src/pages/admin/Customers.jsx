import { useState, useEffect } from 'react';
import { Users, Plus, Search, Building2, Home, Banknote, ShoppingBag, ChevronRight, X, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/client';
import { PageHeader, Modal, EmptyState } from '../../components/ui';

const fmt = n => `Rs ${Number(n||0).toLocaleString('en-PK',{maximumFractionDigits:0})}`;
const TYPES = {
  bulk:      { label:'Bulk',      icon:Building2,   color:'badge-blue',   desc:'Credit, large qty' },
  household: { label:'Household', icon:Home,         color:'badge-green',  desc:'Monthly billing' },
  cash:      { label:'Cash',      icon:Banknote,     color:'badge-yellow', desc:'Pay immediately' },

};

const defaultForm = { name:'', phone:'', address:'', customer_type:'bulk', company_name:'', cnic:'', daily_qty:'', rate_per_liter:'', credit_limit:'', payment_terms:'monthly' };

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [products, setProducts]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [modal, setModal]         = useState(null);
  const [detail, setDetail]       = useState(null);
  const [selC, setSelC]           = useState(null);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState(defaultForm);
  // Sale forms
  const [bulkEntry, setBulkEntry] = useState({ qty_liters:'', rate:'', entry_date: today(), notes:'' });
  const [bulkBill, setBulkBill]   = useState({ date_from:'', date_to:'' });
  const [hhExtra, setHhExtra]     = useState({ extra_qty:'', entry_date: today(), notes:'' });
  const [hhBill, setHhBill]       = useState({ year: new Date().getFullYear(), month: new Date().getMonth()+1 });
  const [cashSale, setCashSale]   = useState({ milk_qty:'', milk_rate:'', items:[], sale_date: today() });
  const [walkinSale, setWalkinSale] = useState({ milk_qty:'', milk_rate:'', items:[], sale_date: today() });
  const [saleTab, setSaleTab]     = useState('milk');

  function today() { return new Date().toISOString().slice(0,10); }

  const loadAll = () => {
    setLoading(true);
    const q = typeFilter ? `&type=${typeFilter}` : '';
    Promise.all([
      api.get(`/customers?search=${encodeURIComponent(search)}${q}`),
      api.get('/products'),
    ]).then(([c,p])=>{ setCustomers(c.data.data||[]); setProducts(p.data.data||[]); }).finally(()=>setLoading(false));
  };
  useEffect(()=>{ loadAll(); }, [search, typeFilter]);

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

  const onBulkEntry = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api.post(`/customers/${selC.id}/bulk-entry`, bulkEntry);
      toast.success(`Rs ${r.data.data.amount} added to account`);
      setBulkEntry({ qty_liters:'', rate:'', entry_date:today(), notes:'' });
      openDetail(selC);
    } catch (err) { toast.error(err.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
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

  const onHhExtra = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/customers/${selC.id}/extra-milk`, hhExtra);
      toast.success('Extra milk recorded');
      setHhExtra({ extra_qty:'', entry_date:today(), notes:'' });
      openDetail(selC);
    } catch (err) { toast.error(err.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  };

  const onHhBill = async () => {
    setSaving(true);
    try {
      const r = await api.post(`/customers/${selC.id}/monthly-bill`, hhBill);
      toast.success(`Monthly bill: ${fmt(r.data.data.total)}`);
      openDetail(selC);
    } catch (err) { toast.error(err.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  };

  const addItemToSale = (setter, product) => {
    setter(prev => {
      const existing = prev.items.find(i=>i.product_id===product.id);
      if (existing) return { ...prev, items: prev.items.map(i=>i.product_id===product.id?{...i,qty:i.qty+1}:i) };
      return { ...prev, items: [...prev.items, { product_id:product.id, product_name:product.name, qty:1, price:parseFloat(product.price) }] };
    });
  };

  const onCashSale = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api.post('/customers/sale', { ...cashSale, customer_id:selC.id, customer_type:'cash' });
      toast.success(`Receipt: ${r.data.data.receipt_no} — ${fmt(r.data.data.total)}`);
      setCashSale({ milk_qty:'', milk_rate:'', items:[], sale_date:today() });
      openDetail(selC);
    } catch (err) { toast.error(err.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  };

  const onWalkinSale = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api.post('/customers/sale', { ...walkinSale, customer_type:'walkin' });
      toast.success(`Receipt: ${r.data.data.receipt_no} — ${fmt(r.data.data.total)}`);
      setWalkinSale({ milk_qty:'', milk_rate:'', items:[], sale_date:today() });
      setModal(null);
    } catch (err) { toast.error(err.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  };

  const markPaid = async (cid, rid) => {
    await api.patch(`/customers/${cid}/receipts/${rid}/pay`);
    toast.success('Marked as paid'); openDetail(selC);
  };

  const calcSaleTotal = (s) => (parseFloat(s.milk_qty||0)*parseFloat(s.milk_rate||0)) + s.items.reduce((t,i)=>t+i.qty*i.price,0);

  const typeStats = Object.keys(TYPES).map(t=>({ type:t, count: customers.filter(c=>c.customer_type===t).length }));

  return (
    <div className="space-y-5">
      <PageHeader title="Customers" subtitle="Bulk, Household, Cash & Walk-in"
        action={
          <div className="flex gap-2">
            <button onClick={()=>setModal('walkin')} className="btn-ghost"><ShoppingBag size={14}/>Walk-in Sale</button>
            <button onClick={()=>setModal('add')} className="btn-primary"><Plus size={14}/>Add Customer</button>
          </div>
        }/>

      {/* Type tabs */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={()=>setTypeFilter('')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition border ${!typeFilter?'bg-[#1d6faa] text-white border-[#1d6faa]':'border-slate-200 text-slate-500 hover:border-[#1d6faa]'}`}>All ({customers.length})</button>
        {typeStats.map(({type,count})=>{
          const cfg=TYPES[type]; const Icon=cfg.icon;
          return <button key={type} onClick={()=>setTypeFilter(typeFilter===type?'':type)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition border
              ${typeFilter===type?'bg-[#1d6faa] text-white border-[#1d6faa]':'border-slate-200 text-slate-500 hover:border-[#1d6faa]'}`}>
            <Icon size={13}/>{cfg.label} ({count})
          </button>;
        })}
      </div>

      {/* Search */}
      <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name or phone…" className="input pl-9"/></div>

      {/* List */}
      <div className="card p-0 overflow-hidden">
        <table className="table-auto w-full">
          <thead><tr><th>Customer</th><th>Type</th><th>Phone</th><th>Rate/L</th><th>Outstanding</th><th></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="py-8 text-center text-slate-400">Loading…</td></tr>
            : customers.length===0 ? <tr><td colSpan={6}><EmptyState icon={Users} title="No customers" description="Add your first customer"/></td></tr>
            : customers.map(c=>{
              const cfg=TYPES[c.customer_type]||TYPES.cash;
              return <tr key={c.id} className="cursor-pointer" onClick={()=>openDetail(c)}>
                <td><div className="font-medium">{c.name}</div><div className="text-xs text-slate-400">{c.customer_code}{c.company_name?` · ${c.company_name}`:''}</div></td>
                <td><span className={`badge text-xs ${cfg.color}`}>{cfg.label}</span></td>
                <td className="text-sm text-slate-500">{c.phone||'—'}</td>
                <td className="font-mono text-sm">{parseFloat(c.rate_per_liter)>0?`${fmt(c.rate_per_liter)}/L`:'—'}</td>
                <td>{parseFloat(c.outstanding)>0?<span className="text-red-600 font-semibold font-mono">{fmt(c.outstanding)}</span>:<span className="text-emerald-500 text-xs">Clear</span>}</td>
                <td>
                <button onClick={(e)=>{ e.stopPropagation(); openDetail(c); }}
                  className="text-xs font-medium text-[#1d6faa] hover:underline">Sale →</button>
              </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>

      {/* ── ADD CUSTOMER MODAL ─────────────────── */}
      <Modal isOpen={modal==='add'} onClose={()=>setModal(null)} title="Add Customer" size="md">
        <form onSubmit={onAdd} className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Object.entries(TYPES).map(([t,cfg])=>{const I=cfg.icon; return(
              <button key={t} type="button" onClick={()=>setForm(p=>({...p,customer_type:t}))}
                className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-xs font-medium transition
                  ${form.customer_type===t?'border-[#1d6faa] bg-blue-50 text-[#1d6faa]':'border-slate-200 text-slate-500'}`}>
                <I size={18}/>{cfg.label}
              </button>);})}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="label">Name *</label><input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} className="input"/></div>
            <div><label className="label">Phone</label><input value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))} className="input"/></div>
            <div><label className="label">Rate/Liter (PKR)</label><input type="number" step="0.01" value={form.rate_per_liter} onChange={e=>setForm(p=>({...p,rate_per_liter:e.target.value}))} className="input font-mono"/></div>
            {form.customer_type==='bulk' && <>
              <div><label className="label">Company Name</label><input value={form.company_name} onChange={e=>setForm(p=>({...p,company_name:e.target.value}))} className="input"/></div>
              <div><label className="label">Credit Limit</label><input type="number" value={form.credit_limit} onChange={e=>setForm(p=>({...p,credit_limit:e.target.value}))} className="input font-mono"/></div>
              <div className="col-span-2"><label className="label">Payment Terms</label>
                <select value={form.payment_terms} onChange={e=>setForm(p=>({...p,payment_terms:e.target.value}))} className="input">
                  <option value="weekly">Weekly</option><option value="monthly">Monthly</option>
                </select></div>
            </>}
            {form.customer_type==='household' && <>
              <div><label className="label">Daily Qty (L)</label><input type="number" step="0.1" value={form.daily_qty} onChange={e=>setForm(p=>({...p,daily_qty:e.target.value}))} className="input font-mono"/></div>
            </>}
            {form.customer_type==='cash' && <>
              <div><label className="label">CNIC</label><input value={form.cnic} onChange={e=>setForm(p=>({...p,cnic:e.target.value}))} className="input"/></div>
            </>}
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
            {/* Info */}
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-400 mb-1">Type</p><p className="font-semibold">{TYPES[detail.customer_type]?.label}</p></div>
              <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-400 mb-1">Phone</p><p className="font-semibold">{detail.phone||'—'}</p></div>
              <div className="bg-red-50 rounded-xl p-3"><p className="text-xs text-slate-400 mb-1">Outstanding</p><p className="font-bold text-red-600">{fmt(detail.outstanding)}</p></div>
            </div>

            {/* BULK actions */}
            {detail.customer_type==='bulk' && (
              <div className="space-y-3">
                <form onSubmit={onBulkEntry} className="border border-slate-200 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-semibold text-slate-600">Record Delivery</p>
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
                {/* Ledger entries */}
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {detail.ledger?.map(l=>(
                    <div key={l.id} className="flex justify-between text-xs border border-slate-100 rounded-lg px-3 py-1.5">
                      <span className="text-slate-500">{l.entry_date} · {l.qty_liters}L @ {l.rate}</span>
                      <span className="font-semibold font-mono">{fmt(l.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* HOUSEHOLD actions */}
            {detail.customer_type==='household' && (
              <div className="space-y-3">
                <div className="bg-blue-50 rounded-xl p-3 text-sm">
                  Daily: <b>{detail.daily_qty}L</b> × <b>{fmt(detail.rate_per_liter)}/L</b>
                </div>
                <form onSubmit={onHhExtra} className="border border-slate-200 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-semibold text-slate-600">Add Extra Milk Today</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="label">Date</label><input type="date" value={hhExtra.entry_date} onChange={e=>setHhExtra(p=>({...p,entry_date:e.target.value}))} className="input"/></div>
                    <div><label className="label">Extra Qty (L)</label><input type="number" step="0.1" value={hhExtra.extra_qty} onChange={e=>setHhExtra(p=>({...p,extra_qty:e.target.value}))} className="input font-mono"/></div>
                  </div>
                  <button type="submit" disabled={saving} className="btn-primary w-full">{saving?'…':'Record Extra Milk'}</button>
                </form>
                <div className="border border-slate-200 rounded-xl p-4 space-y-2">
                  <p className="text-sm font-semibold text-slate-600">Generate Monthly Bill</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="label">Year</label><input type="number" value={hhBill.year} onChange={e=>setHhBill(p=>({...p,year:e.target.value}))} className="input font-mono"/></div>
                    <div><label className="label">Month</label><input type="number" min={1} max={12} value={hhBill.month} onChange={e=>setHhBill(p=>({...p,month:e.target.value}))} className="input font-mono"/></div>
                  </div>
                  <button onClick={onHhBill} disabled={saving} className="btn-primary w-full">{saving?'…':'Generate Monthly Bill'}</button>
                </div>
              </div>
            )}

            {/* CASH actions */}
            {detail.customer_type==='cash' && (
              <form onSubmit={onCashSale} className="border border-slate-200 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-600">Record Sale</p>
                <div className="flex gap-2 mb-2">
                  {['milk','products'].map(t=><button key={t} type="button" onClick={()=>setSaleTab(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition ${saleTab===t?'bg-[#1d6faa] text-white':'bg-slate-100 text-slate-500'}`}>{t}</button>)}
                </div>
                {saleTab==='milk' && <div className="grid grid-cols-2 gap-2">
                  <div><label className="label">Qty (L)</label><input type="number" step="0.1" value={cashSale.milk_qty} onChange={e=>setCashSale(p=>({...p,milk_qty:e.target.value}))} className="input font-mono"/></div>
                  <div><label className="label">Rate/L</label><input type="number" step="0.01" value={cashSale.milk_rate} onChange={e=>setCashSale(p=>({...p,milk_rate:e.target.value}))} className="input font-mono"/></div>
                </div>}
                {saleTab==='products' && <div className="grid grid-cols-2 gap-2">
                  {products.map(p=><button key={p.id} type="button" onClick={()=>addItemToSale(setCashSale,p)}
                    className="flex justify-between items-center border border-slate-200 rounded-lg px-3 py-2 text-xs hover:border-[#1d6faa] transition">
                    <span>{p.name}</span><span className="font-mono text-[#1d6faa]">{fmt(p.price)}</span>
                  </button>)}
                </div>}
                {cashSale.items.length>0 && <div className="space-y-1">{cashSale.items.map(i=>(
                  <div key={i.product_id} className="flex justify-between items-center text-xs bg-slate-50 rounded-lg px-3 py-1.5">
                    <span>{i.product_name}</span>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={()=>setCashSale(p=>({...p,items:p.items.map(x=>x.product_id===i.product_id?{...x,qty:Math.max(0,x.qty-1)}:x).filter(x=>x.qty>0)}))} className="w-5 h-5 bg-slate-200 rounded text-center">-</button>
                      <span className="font-semibold">{i.qty}</span>
                      <button type="button" onClick={()=>setCashSale(p=>({...p,items:p.items.map(x=>x.product_id===i.product_id?{...x,qty:x.qty+1}:x)}))} className="w-5 h-5 bg-slate-200 rounded text-center">+</button>
                      <span className="font-mono w-16 text-right">{fmt(i.qty*i.price)}</span>
                    </div>
                  </div>
                ))}</div>}
                {calcSaleTotal(cashSale)>0 && <div className="bg-emerald-50 rounded-lg px-3 py-2 text-sm font-bold text-emerald-700">Total: {fmt(calcSaleTotal(cashSale))}</div>}
                <button type="submit" disabled={saving} className="btn-primary w-full">{saving?'…':'Record & Print Receipt'}</button>
              </form>
            )}

            {/* Receipts */}
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

      {/* ── WALK-IN SALE MODAL ────────────────── */}
      <Modal isOpen={modal==='walkin'} onClose={()=>setModal(null)} title="Walk-in Sale" size="sm">
        <form onSubmit={onWalkinSale} className="space-y-4">
          <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500">No customer details required. Immediate cash payment only.</div>
          <div className="flex gap-2 mb-2">
            {['milk','products'].map(t=><button key={t} type="button" onClick={()=>setSaleTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition ${saleTab===t?'bg-[#1d6faa] text-white':'bg-slate-100 text-slate-500'}`}>{t}</button>)}
          </div>
          {saleTab==='milk' && <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Qty (L)</label><input type="number" step="0.1" value={walkinSale.milk_qty} onChange={e=>setWalkinSale(p=>({...p,milk_qty:e.target.value}))} className="input font-mono"/></div>
            <div><label className="label">Rate/L</label><input type="number" step="0.01" value={walkinSale.milk_rate} onChange={e=>setWalkinSale(p=>({...p,milk_rate:e.target.value}))} className="input font-mono"/></div>
          </div>}
          {saleTab==='products' && <div className="grid grid-cols-2 gap-2">
            {products.map(p=><button key={p.id} type="button" onClick={()=>addItemToSale(setWalkinSale,p)}
              className="flex justify-between items-center border border-slate-200 rounded-lg px-3 py-2 text-xs hover:border-[#1d6faa] transition">
              <span>{p.name}</span><span className="font-mono text-[#1d6faa]">{fmt(p.price)}</span>
            </button>)}
          </div>}
          {walkinSale.items.length>0 && <div className="space-y-1">{walkinSale.items.map(i=>(
            <div key={i.product_id} className="flex justify-between items-center text-xs bg-slate-50 rounded-lg px-3 py-1.5">
              <span>{i.product_name}</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={()=>setWalkinSale(p=>({...p,items:p.items.map(x=>x.product_id===i.product_id?{...x,qty:Math.max(0,x.qty-1)}:x).filter(x=>x.qty>0)}))} className="w-5 h-5 bg-slate-200 rounded text-center">-</button>
                <span className="font-semibold">{i.qty}</span>
                <button type="button" onClick={()=>setWalkinSale(p=>({...p,items:p.items.map(x=>x.product_id===i.product_id?{...x,qty:x.qty+1}:x)}))} className="w-5 h-5 bg-slate-200 rounded text-center">+</button>
                <span className="font-mono w-16 text-right">{fmt(i.qty*i.price)}</span>
              </div>
            </div>
          ))}</div>}
          {calcSaleTotal(walkinSale)>0 && <div className="bg-emerald-50 rounded-lg px-3 py-2 text-sm font-bold text-emerald-700">Total: {fmt(calcSaleTotal(walkinSale))}</div>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={()=>setModal(null)} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving?'…':'Complete Sale'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
