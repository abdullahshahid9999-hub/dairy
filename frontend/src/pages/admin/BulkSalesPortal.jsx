import { useState, useEffect, useRef } from 'react';
import { Building2, Calculator, RefreshCw, Receipt, History, FileText, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/client';
import { PageHeader, EmptyState, Skeleton } from '../../components/ui';

const fmt = n => `Rs ${Number(n || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;
const today = () => new Date().toISOString().slice(0, 10);

const emptyEntry = () => ({
  customer_id: '',
  entry_date: today(),
  qty_liters: '',
  fat_percentage: '',
  lr: '',
  notes: '',
});

export default function BulkSalesPortal() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [form, setForm]           = useState(emptyEntry());
  const [preview, setPreview]     = useState(null);
  const [prevLoad, setPrevLoad]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [ledger, setLedger]       = useState([]);
  const [ledgerLoad, setLedgerLoad] = useState(false);
  const [billRange, setBillRange] = useState({ date_from: '', date_to: '' });
  const [billing, setBilling]     = useState(false);
  const debounce = useRef(null);

  useEffect(() => {
    api.get('/customers?type=bulk').then(r => setCustomers(r.data.data || [])).finally(() => setLoading(false));
  }, []);

  const selectedCustomer = customers.find(c => String(c.id) === String(form.customer_id));

  const set = key => e => setForm(p => ({ ...p, [key]: e.target.value }));

  // Live rate preview — debounced, recalculates whenever customer/qty/fat/lr changes
  useEffect(() => {
    const { customer_id, fat_percentage: fat, lr, qty_liters: qty } = form;
    if (!customer_id || !fat || !lr || !qty || parseFloat(qty) <= 0) { setPreview(null); return; }
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setPrevLoad(true);
      api.post('/customers/bulk/preview-rate', {
        customer_id: parseInt(customer_id, 10),
        fat_percentage: parseFloat(fat),
        lr: parseFloat(lr),
        qty_liters: parseFloat(qty),
      })
        .then(r => setPreview(r.data.data))
        .catch(() => setPreview(null))
        .finally(() => setPrevLoad(false));
    }, 500);
    return () => clearTimeout(debounce.current);
  }, [form.customer_id, form.fat_percentage, form.lr, form.qty_liters]);

  const loadLedger = (customerId) => {
    if (!customerId) { setLedger([]); return; }
    setLedgerLoad(true);
    api.get(`/customers/${customerId}`)
      .then(r => setLedger(r.data.data?.ledger || []))
      .finally(() => setLedgerLoad(false));
  };

  useEffect(() => { loadLedger(form.customer_id); }, [form.customer_id]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.customer_id) return toast.error('Select a bulk customer');
    if (!form.qty_liters || !form.fat_percentage || !form.lr) return toast.error('Enter Qty, FAT% and LR');
    setSaving(true);
    try {
      const r = await api.post(`/customers/${form.customer_id}/bulk-entry`, {
        entry_date: form.entry_date,
        qty_liters: parseFloat(form.qty_liters),
        fat_percentage: parseFloat(form.fat_percentage),
        lr: parseFloat(form.lr),
        notes: form.notes || undefined,
      });
      toast.success(`Recorded — ${fmt(r.data.data.amount)} added to account`);
      setForm(p => ({ ...emptyEntry(), customer_id: p.customer_id, entry_date: p.entry_date }));
      setPreview(null);
      loadLedger(form.customer_id);
      setCustomers(cs => cs.map(c => c.id === selectedCustomer.id
        ? { ...c, outstanding: parseFloat(c.outstanding || 0) + r.data.data.amount } : c));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const onGenerateBill = async () => {
    if (!form.customer_id) return toast.error('Select a customer first');
    if (!billRange.date_from || !billRange.date_to) return toast.error('Pick a date range');
    setBilling(true);
    try {
      const r = await api.post(`/customers/${form.customer_id}/bulk-bill`, billRange);
      toast.success(`Bill generated: ${r.data.data.receipt_no} — ${fmt(r.data.data.total)}`);
      setBillRange({ date_from: '', date_to: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate bill');
    } finally { setBilling(false); }
  };

  const filteredCustomers = customers.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.company_name?.toLowerCase().includes(search.toLowerCase())
  );

  const inputBase = 'w-full rounded-xl border focus:outline-none focus:ring-2 focus:ring-[#1d6faa]/30 focus:border-[#1d6faa] transition px-4';

  return (
    <div className="space-y-5">
      <PageHeader title="Bulk Sales Portal" subtitle="FAT/LR-based standardised pricing for bulk customers" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Customer picker ───────────────────────────── */}
        <div className="card space-y-3 lg:col-span-1">
          <h2 className="font-semibold text-slate-700 flex items-center gap-2">
            <Building2 size={16} className="text-[#1d6faa]" /> Bulk Customers
          </h2>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              className={`${inputBase} pl-9 py-2 text-sm border-slate-200`} />
          </div>
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
            {loading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)
            : filteredCustomers.length === 0 ? (
              <EmptyState icon={Building2} title="No bulk customers" description="Add one from the Customers page first" />
            ) : filteredCustomers.map(c => (
              <button key={c.id} onClick={() => setForm(p => ({ ...emptyEntry(), customer_id: String(c.id), entry_date: p.entry_date }))}
                className={`w-full text-left p-3 rounded-xl border transition
                  ${String(form.customer_id) === String(c.id) ? 'border-[#1d6faa] bg-blue-50' : 'border-slate-200 hover:border-[#1d6faa]/50'}`}>
                <p className="font-medium text-sm">{c.name}</p>
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-xs text-slate-400">{c.company_name || c.customer_code}</p>
                  {parseFloat(c.outstanding) > 0
                    ? <span className="text-red-600 text-xs font-semibold font-mono">{fmt(c.outstanding)}</span>
                    : <span className="text-emerald-500 text-xs">Clear</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Entry form + preview ──────────────────────── */}
        <div className="card space-y-4 lg:col-span-2">
          {!selectedCustomer ? (
            <EmptyState icon={Receipt} title="Select a customer" description="Pick a bulk customer on the left to record a sale" />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-700">{selectedCustomer.name}</h2>
                <span className="text-xs text-slate-400 font-mono">Base rate: Rs {selectedCustomer.rate_per_liter}/std-unit</span>
              </div>

              <form onSubmit={onSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Date</label>
                    <input type="date" value={form.entry_date} onChange={set('entry_date')} className={`${inputBase} py-2.5 text-sm border-slate-200`} />
                  </div>
                  <div>
                    <label className="label">Qty (Liters)</label>
                    <input type="number" inputMode="decimal" step="0.1" placeholder="0.0" value={form.qty_liters} onChange={set('qty_liters')}
                      className={`${inputBase} py-2.5 text-lg font-bold font-mono text-center border-slate-200`} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Fat %</label>
                    <input type="number" inputMode="decimal" step="0.01" placeholder="0.00" value={form.fat_percentage} onChange={set('fat_percentage')}
                      className={`${inputBase} py-3 text-lg font-bold font-mono text-center text-blue-600 border-slate-200`} />
                  </div>
                  <div>
                    <label className="label">LR</label>
                    <input type="number" inputMode="decimal" step="0.1" placeholder="0.0" value={form.lr} onChange={set('lr')}
                      className={`${inputBase} py-3 text-lg font-bold font-mono text-center text-violet-600 border-slate-200`} />
                  </div>
                </div>

                <div>
                  <label className="label">Notes (optional)</label>
                  <input value={form.notes} onChange={set('notes')} placeholder="Any remarks…" className={`${inputBase} py-2.5 text-sm border-slate-200`} />
                </div>

                {/* Live calculation */}
                {(prevLoad || preview) && (
                  <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Calculator size={14} className="text-blue-500" />
                      <p className="text-sm font-bold text-blue-700">Live Calculation</p>
                      {prevLoad && <RefreshCw size={12} className="animate-spin text-blue-400 ml-auto" />}
                    </div>
                    {preview && !prevLoad && (
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { l: 'TS%',           v: Number(preview.ts).toFixed(3),              c: 'text-blue-700' },
                          { l: 'SNF%',          v: Number(preview.snf_computed).toFixed(3),    c: 'text-emerald-700' },
                          { l: 'Sp. Gravity',   v: Number(preview.sp_gravity).toFixed(4),       c: 'text-slate-600' },
                          { l: 'Milk (kg)',     v: Number(preview.milk_kg).toFixed(3),          c: 'text-orange-600' },
                          { l: 'Std Qty (kg)',  v: Number(preview.standardised_ts).toFixed(3),  c: 'text-violet-700' },
                          { l: 'Rate/std-unit', v: Number(preview.rate_per_unit).toFixed(2),    c: 'text-slate-700' },
                        ].map(({ l, v, c }) => (
                          <div key={l} className="bg-white rounded-xl p-2.5 border border-blue-100 text-center">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{l}</p>
                            <p className={`font-mono font-bold text-sm ${c}`}>{v}</p>
                          </div>
                        ))}
                        <div className="col-span-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center mt-1">
                          <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1">Total Payout</p>
                          <p className="font-mono font-bold text-lg text-emerald-700">{fmt(preview.total_payout)}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <button type="submit" disabled={saving}
                  className="w-full py-3.5 rounded-2xl bg-[#1d6faa] hover:bg-[#1557a0] active:scale-[0.98]
                             text-white font-bold flex items-center justify-center gap-3 transition-all disabled:opacity-60 shadow-md">
                  {saving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Record Sale'}
                </button>
              </form>

              {/* Billing */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-2">
                <p className="text-sm font-semibold text-slate-600 flex items-center gap-2"><FileText size={14} />Generate Bill</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="label">From</label><input type="date" value={billRange.date_from} onChange={e => setBillRange(p => ({ ...p, date_from: e.target.value }))} className={`${inputBase} py-2 text-sm border-slate-200`} /></div>
                  <div><label className="label">To</label><input type="date" value={billRange.date_to} onChange={e => setBillRange(p => ({ ...p, date_to: e.target.value }))} className={`${inputBase} py-2 text-sm border-slate-200`} /></div>
                </div>
                <button onClick={onGenerateBill} disabled={billing} className="btn-primary w-full">{billing ? '…' : 'Generate Bill'}</button>
              </div>

              {/* Ledger history */}
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2"><History size={14} />Recent Entries</p>
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {ledgerLoad ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)
                  : ledger.length === 0 ? <p className="text-slate-400 text-xs text-center py-3">No entries yet</p>
                  : ledger.map(l => (
                    <div key={l.id} className="flex items-center justify-between text-xs border border-slate-100 rounded-lg px-3 py-2">
                      <div>
                        <span className="text-slate-500">{l.entry_date} · {l.qty_liters}L</span>
                        {l.fat_percentage != null && (
                          <span className="text-slate-400 ml-2">FAT {l.fat_percentage}% · LR {l.lr}</span>
                        )}
                      </div>
                      <span className="font-semibold font-mono">{fmt(l.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
