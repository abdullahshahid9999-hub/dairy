import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { TrendingUp, Plus, Building2, Home, Banknote, ShoppingBag, Printer, CheckCircle, Clock, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/client';
import { PageHeader, Modal, EmptyState } from '../../components/ui';

const fmt = n => `Rs ${Number(n||0).toLocaleString('en-PK',{maximumFractionDigits:0})}`;
const today = () => new Date().toISOString().slice(0,10);

const TYPES = {
  bulk:      { label:'Bulk Sale',      icon:Building2, color:'badge-blue',   desc:'Large qty on credit' },
  household: { label:'Household Bill', icon:Home,      color:'badge-green',  desc:'Monthly billing' },
  cash:      { label:'Cash Sale',      icon:Banknote,  color:'badge-yellow', desc:'Immediate payment' },
  walkin:    { label:'Walk-in Sale',   icon:ShoppingBag,color:'badge-gray',  desc:'No details needed' },
};

function PrintSlip({ receipt, onClose }) {
  const printRef = () => window.print();
  return (
    <div className="space-y-4">
      <div id="print-area" className="border border-slate-200 rounded-xl p-6 text-sm font-mono">
        <div className="text-center mb-4">
          <p className="font-bold text-lg">Brimi Dairy</p>
          <p className="text-xs text-slate-500">Receipt</p>
        </div>
        <div className="flex justify-between text-xs text-slate-500 mb-3">
          <span>Receipt #: {receipt.receipt_no}</span>
          <span>{receipt.date}</span>
        </div>
        {receipt.customer && <p className="text-xs mb-2">Customer: <b>{receipt.customer}</b></p>}
        <hr className="border-dashed my-2"/>
        {parseFloat(receipt.milk_qty)>0 && (
          <div className="flex justify-between"><span>Milk {receipt.milk_qty}L × {receipt.milk_rate}</span><span>{fmt(parseFloat(receipt.milk_qty)*parseFloat(receipt.milk_rate))}</span></div>
        )}
        {receipt.items?.map((item,i)=>(
          <div key={i} className="flex justify-between"><span>{item.product_name} × {item.qty}</span><span>{fmt(item.qty*item.price)}</span></div>
        ))}
        <hr className="border-dashed my-2"/>
        <div className="flex justify-between font-bold text-base"><span>Total</span><span>{fmt(receipt.total)}</span></div>
        <p className="text-center text-xs text-slate-400 mt-4">Thank you!</p>
      </div>
      <div className="flex gap-3">
        <button onClick={printRef} className="btn-primary flex-1"><Printer size={15}/>Print</button>
        <button onClick={onClose} className="btn-ghost flex-1">Close</button>
      </div>
      <style>{`@media print { body * { visibility:hidden; } #print-area, #print-area * { visibility:visible; } #print-area { position:absolute;left:0;top:0;width:100%; } }`}</style>
    </div>
  );
}

export default function Sales() {
  const [saleType, setSaleType] = useState('bulk');
  const [customers, setCustomers] = useState([]);
  const [receipts, setReceipts]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [modal, setModal]         = useState(null);
  const [slip, setSlip]           = useState(null);
  const [search, setSearch]       = useState('');

  // Form states
  const [selCustomer, setSelCustomer] = useState(null);
  const [bulkForm, setBulkForm]   = useState({ qty_liters:'', rate:'', entry_date:today(), notes:'' });
  const [bulkBill, setBulkBill]   = useState({ date_from:'', date_to:'' });
  const [hhBill, setHhBill]       = useState({ year:new Date().getFullYear(), month:new Date().getMonth()+1 });
  const [cashForm, setCashForm]   = useState({ milk_qty:'', milk_rate:'', sale_date:today() });
  const [walkinForm, setWalkinForm] = useState({ milk_qty:'', milk_rate:'', sale_date:today() });

  const location = useLocation();

  // Pre-select customer coming from Customers page
  useEffect(() => {
    if (location.state?.customer) {
      const c = location.state.customer;
      setSaleType(c.customer_type);
      setSelCustomer(c);
      window.history.replaceState({}, ''); // clear state
    }
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [c, r] = await Promise.all([
        api.get(`/customers?type=${saleType}&search=${encodeURIComponent(search)}`),
        api.get('/receipts'),
      ]);
      setCustomers(c.data.data||[]);
      setReceipts(r.data.data||[]);
    } catch { toast.error('Load failed'); }
    finally { setLoading(false); }
  };

  useEffect(()=>{ loadData(); }, [saleType, search]);

  const calcTotal = (f) => parseFloat(f.milk_qty||0)*parseFloat(f.milk_rate||0);

  const onBulkEntry = async (e) => {
    e.preventDefault();
    if (!selCustomer) return toast.error('Select a customer');
    setSaving(true);
    try {
      const r = await api.post(`/customers/${selCustomer.id}/bulk-entry`, bulkForm);
      toast.success(`${fmt(r.data.data.amount)} added to ${selCustomer.name}'s account`);
      setBulkForm({ qty_liters:'', rate:'', entry_date:today(), notes:'' });
      loadData();
    } catch (err) { toast.error(err.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  };

  const onBulkBill = async () => {
    if (!selCustomer||!bulkBill.date_from) return toast.error('Select customer and dates');
    setSaving(true);
    try {
      const r = await api.post(`/customers/${selCustomer.id}/bulk-bill`, bulkBill);
      toast.success(`Bill: ${r.data.data.receipt_no}`);
      setSlip({ receipt_no:r.data.data.receipt_no, date:today(), customer:selCustomer.name, milk_qty:r.data.data.qty||0, milk_rate:'—', items:[], total:r.data.data.total });
      setModal('slip');
      loadData();
    } catch (err) { toast.error(err.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  };

  const onHhBill = async () => {
    if (!selCustomer) return toast.error('Select a customer');
    setSaving(true);
    try {
      const r = await api.post(`/customers/${selCustomer.id}/monthly-bill`, hhBill);
      toast.success(`Bill: ${fmt(r.data.data.total)}`);
      setSlip({ receipt_no:r.data.data.receipt_no, date:today(), customer:selCustomer.name, milk_qty:r.data.data.qty, milk_rate:selCustomer.rate_per_liter, items:[], total:r.data.data.total });
      setModal('slip');
      loadData();
    } catch (err) { toast.error(err.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  };

  const onCashSale = async (e) => {
    e.preventDefault();
    if (!selCustomer) return toast.error('Select a customer');
    setSaving(true);
    try {
      const r = await api.post('/customers/sale', { ...cashForm, customer_id:selCustomer.id, customer_type:'cash' });
      toast.success(`Receipt: ${r.data.data.receipt_no}`);
      setSlip({ receipt_no:r.data.data.receipt_no, date:today(), customer:selCustomer.name, ...cashForm, total:r.data.data.total });
      setModal('slip');
      setCashForm({ milk_qty:'', milk_rate:'', sale_date:today() });
      loadData();
    } catch (err) { toast.error(err.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  };

  const onWalkin = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api.post('/customers/sale', { ...walkinForm, customer_type:'walkin' });
      toast.success(`Receipt: ${r.data.data.receipt_no}`);
      setSlip({ receipt_no:r.data.data.receipt_no, date:today(), customer:'Walk-in Customer', ...walkinForm, total:r.data.data.total });
      setModal('slip');
      setWalkinForm({ milk_qty:'', milk_rate:'', sale_date:today() });
      loadData();
    } catch (err) { toast.error(err.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  };

  const markPaid = async (cid, rid) => {
    try { await api.patch(`/customers/${cid}/receipts/${rid}/pay`); toast.success('Marked paid'); loadData(); }
    catch { toast.error('Failed'); }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Sales" subtitle="Record sales and generate payment slips"/>

      {/* Sale type selector */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Object.entries(TYPES).map(([t,cfg])=>{const I=cfg.icon; return(
          <button key={t} onClick={()=>{ setSaleType(t); setSelCustomer(null); }}
            className={`card text-left transition hover:shadow-md ${saleType===t?'ring-2 ring-[#1d6faa]':''}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${saleType===t?'bg-[#1d6faa] text-white':'bg-slate-100 text-slate-500'}`}><I size={16}/></div>
              <p className="font-semibold text-sm text-slate-700">{cfg.label}</p>
            </div>
            <p className="text-xs text-slate-400">{cfg.desc}</p>
          </button>);
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Left: Customer selector (not for walkin) */}
        {saleType !== 'walkin' && (
          <div className="lg:col-span-2 space-y-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search customer…" className="input pl-8 text-sm"/>
            </div>
            <div className="card p-0 overflow-hidden max-h-[480px] overflow-y-auto">
              {customers.length===0
                ? <div className="py-8 text-center text-slate-400 text-sm">No {TYPES[saleType].label.toLowerCase()} customers</div>
                : customers.map(c=>(
                  <button key={c.id} onClick={()=>setSelCustomer(c)}
                    className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-blue-50 transition
                      ${selCustomer?.id===c.id?'bg-blue-50 border-l-4 border-l-[#1d6faa]':''}`}>
                    <p className="font-medium text-sm text-slate-700">{c.name}</p>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-slate-400">{c.customer_code}{c.company_name?` · ${c.company_name}`:''}</p>
                      {parseFloat(c.outstanding)>0 && <span className="text-xs text-red-500 font-mono">{fmt(c.outstanding)} due</span>}
                    </div>
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Right: Sale form */}
        <div className={saleType==='walkin'?'lg:col-span-5':'lg:col-span-3'}>
          {/* BULK */}
          {saleType==='bulk' && (
            <div className="space-y-4">
              <div className="card">
                <p className="font-semibold text-slate-700 mb-3 text-sm">Record Delivery {selCustomer && <span className="text-[#1d6faa]">→ {selCustomer.name}</span>}</p>
                <form onSubmit={onBulkEntry} className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div><label className="label">Date</label><input type="date" value={bulkForm.entry_date} onChange={e=>setBulkForm(p=>({...p,entry_date:e.target.value}))} className="input"/></div>
                    <div><label className="label">Qty (L)</label><input type="number" step="0.1" value={bulkForm.qty_liters} onChange={e=>setBulkForm(p=>({...p,qty_liters:e.target.value}))} className="input font-mono"/></div>
                    <div><label className="label">Rate/L</label><input type="number" step="0.01" value={bulkForm.rate} onChange={e=>setBulkForm(p=>({...p,rate:e.target.value}))} className="input font-mono"/></div>
                  </div>
                  {bulkForm.qty_liters && bulkForm.rate && <div className="bg-blue-50 rounded-lg px-3 py-2 text-sm font-semibold text-[#1d6faa]">Total: {fmt(parseFloat(bulkForm.qty_liters)*parseFloat(bulkForm.rate))}</div>}
                  <button type="submit" disabled={saving||!selCustomer} className="btn-primary w-full">{saving?'…':'Add to Account Ledger'}</button>
                </form>
              </div>
              <div className="card">
                <p className="font-semibold text-slate-700 mb-3 text-sm">Generate Bill & Payment Slip</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div><label className="label">From</label><input type="date" value={bulkBill.date_from} onChange={e=>setBulkBill(p=>({...p,date_from:e.target.value}))} className="input"/></div>
                  <div><label className="label">To</label><input type="date" value={bulkBill.date_to} onChange={e=>setBulkBill(p=>({...p,date_to:e.target.value}))} className="input"/></div>
                </div>
                <button onClick={onBulkBill} disabled={saving||!selCustomer||!bulkBill.date_from} className="btn-primary w-full"><Printer size={15}/>Generate Bill + Print Slip</button>
              </div>
            </div>
          )}

          {/* HOUSEHOLD */}
          {saleType==='household' && (
            <div className="card space-y-4">
              <p className="font-semibold text-slate-700 text-sm">Monthly Bill {selCustomer && <><span className="text-[#1d6faa]">→ {selCustomer.name}</span> <span className="text-xs text-slate-400">({selCustomer.daily_qty}L/day × {fmt(selCustomer.rate_per_liter)}/L)</span></>}</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Year</label><input type="number" value={hhBill.year} onChange={e=>setHhBill(p=>({...p,year:e.target.value}))} className="input font-mono"/></div>
                <div><label className="label">Month (1-12)</label><input type="number" min={1} max={12} value={hhBill.month} onChange={e=>setHhBill(p=>({...p,month:e.target.value}))} className="input font-mono"/></div>
              </div>
              {selCustomer && (
                <div className="bg-blue-50 rounded-xl p-3 text-xs text-slate-600 space-y-1">
                  <p>Base: {selCustomer.daily_qty}L × {new Date(hhBill.year,hhBill.month,0).getDate()} days × {fmt(selCustomer.rate_per_liter)}</p>
                  <p className="font-bold text-sm text-[#1d6faa]">Estimated: {fmt(parseFloat(selCustomer.daily_qty)*new Date(hhBill.year,hhBill.month,0).getDate()*parseFloat(selCustomer.rate_per_liter))} + extras</p>
                </div>
              )}
              <button onClick={onHhBill} disabled={saving||!selCustomer} className="btn-primary w-full"><Printer size={15}/>Generate Monthly Bill + Print Slip</button>
            </div>
          )}

          {/* CASH */}
          {saleType==='cash' && (
            <div className="card space-y-4">
              <p className="font-semibold text-slate-700 text-sm">Cash Sale {selCustomer && <span className="text-[#1d6faa]">→ {selCustomer.name}</span>}</p>
              <form onSubmit={onCashSale} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Qty (L)</label><input type="number" step="0.1" value={cashForm.milk_qty} onChange={e=>setCashForm(p=>({...p,milk_qty:e.target.value}))} className="input font-mono"/></div>
                  <div><label className="label">Rate/L</label><input type="number" step="0.01" value={cashForm.milk_rate} onChange={e=>setCashForm(p=>({...p,milk_rate:e.target.value}))} className="input font-mono"/></div>
                </div>
                {calcTotal(cashForm)>0 && <div className="bg-emerald-50 rounded-lg px-3 py-2 text-sm font-bold text-emerald-700">Total: {fmt(calcTotal(cashForm))}</div>}
                <button type="submit" disabled={saving||!selCustomer} className="btn-primary w-full"><Printer size={15}/>Complete Sale + Print Receipt</button>
              </form>
            </div>
          )}

          {/* WALK-IN */}
          {saleType==='walkin' && (
            <div className="card max-w-lg mx-auto space-y-4">
              <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500">No customer details required. Cash only. Receipt generated immediately.</div>
              <form onSubmit={onWalkin} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Qty (L)</label><input type="number" step="0.1" value={walkinForm.milk_qty} onChange={e=>setWalkinForm(p=>({...p,milk_qty:e.target.value}))} className="input font-mono"/></div>
                  <div><label className="label">Rate/L</label><input type="number" step="0.01" value={walkinForm.milk_rate} onChange={e=>setWalkinForm(p=>({...p,milk_rate:e.target.value}))} className="input font-mono"/></div>
                </div>
                {calcTotal(walkinForm)>0 && <div className="bg-emerald-50 rounded-lg px-3 py-2 text-sm font-bold text-emerald-700">Total: {fmt(calcTotal(walkinForm))}</div>}
                <button type="submit" disabled={saving} className="btn-primary w-full"><Printer size={15}/>Print Receipt</button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Print Slip Modal */}
      <Modal isOpen={modal==='slip'} onClose={()=>setModal(null)} title="Payment Slip" size="sm">
        {slip && <PrintSlip receipt={slip} onClose={()=>setModal(null)}/>}
      </Modal>
    </div>
  );
}
