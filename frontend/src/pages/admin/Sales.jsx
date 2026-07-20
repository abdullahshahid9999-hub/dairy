import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Building2, Printer, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/client';
import { PageHeader, Modal } from '../../components/ui';

const fmt = n => `Rs ${Number(n||0).toLocaleString('en-PK',{maximumFractionDigits:0})}`;
const today = () => new Date().toISOString().slice(0,10);

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
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [modal, setModal]         = useState(null);
  const [slip, setSlip]           = useState(null);
  const [search, setSearch]       = useState('');

  const [selCustomer, setSelCustomer] = useState(null);
  const [bulkForm, setBulkForm]   = useState({ qty_liters:'', rate:'', entry_date:today(), notes:'' });
  const [bulkBill, setBulkBill]   = useState({ date_from:'', date_to:'' });

  const location = useLocation();

  useEffect(() => {
    if (location.state?.customer) {
      setSelCustomer(location.state.customer);
      window.history.replaceState({}, '');
    }
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const c = await api.get(`/customers?type=bulk&search=${encodeURIComponent(search)}`);
      setCustomers(c.data.data||[]);
    } catch { toast.error('Load failed'); }
    finally { setLoading(false); }
  };

  useEffect(()=>{ loadData(); }, [search]);

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
      setSlip({ receipt_no:r.data.data.receipt_no, date:today(), customer:selCustomer.name, milk_qty:r.data.data.qty||0, milk_rate:'—', total:r.data.data.total });
      setModal('slip');
      loadData();
    } catch (err) { toast.error(err.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Sales" subtitle="Record bulk deliveries and generate payment slips"/>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-2 space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search customer…" className="input pl-8 text-sm"/>
          </div>
          <div className="card p-0 overflow-hidden max-h-[480px] overflow-y-auto">
            {loading ? <div className="py-8 text-center text-slate-400 text-sm">Loading…</div> :
             customers.length===0
              ? <div className="py-8 text-center text-slate-400 text-sm">No bulk customers</div>
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

        <div className="lg:col-span-3 space-y-4">
          <div className="card">
            <p className="font-semibold text-slate-700 mb-3 text-sm flex items-center gap-2">
              <Building2 size={15} className="text-[#1d6faa]"/>
              Record Delivery {selCustomer && <span className="text-[#1d6faa]">→ {selCustomer.name}</span>}
            </p>
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
      </div>

      <Modal isOpen={modal==='slip'} onClose={()=>setModal(null)} title="Payment Slip" size="sm">
        {slip && <PrintSlip receipt={slip} onClose={()=>setModal(null)}/>}
      </Modal>
    </div>
  );
}
