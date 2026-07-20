import { useState, useEffect, useCallback, useRef } from 'react';
import { Milk, Plus, Search, Calculator, RefreshCw, Clock, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/client';

const fmt   = n => `Rs ${Number(n||0).toLocaleString('en-PK',{maximumFractionDigits:0})}`;
const fmtL  = n => `${Number(n||0).toFixed(1)}L`;
const today = () => new Date().toISOString().slice(0,10);
const fmtTime = ts => {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleTimeString('en-PK',{hour:'2-digit',minute:'2-digit',hour12:true}); }
  catch { return '—'; }
};
const fmtDateTime = ts => {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleString('en-PK',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:true});
  } catch { return '—'; }
};

const emptyForm = () => ({
  farmer_id: '', collection_date: today(),
  quantity_liters: '', fat_percentage: '',
  lactometer_reading: '', target_ts: '13',
  notes: '',
});

// ── Beautiful Input ──────────────────────────────────────────────────────────
function Field({ label, required, error, children }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

// ── Add/Edit Modal ───────────────────────────────────────────────────────────
function MilkModal({ isOpen, onClose, farmers, onSaved }) {
  const [form, setForm]       = useState(emptyForm());
  const [preview, setPreview] = useState(null);
  const [prevLoad, setPrevLoad] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [errors, setErrors]   = useState({});
  const debounce = useRef(null);

  useEffect(() => { if (isOpen) { setForm(emptyForm()); setPreview(null); setErrors({}); } }, [isOpen]);

  const set = key => e => setForm(p => ({ ...p, [key]: e.target.value }));

  // live preview
  useEffect(() => {
    const { fat_percentage: fat, lactometer_reading: lr, quantity_liters: qty } = form;
    if (!fat || !lr || !qty || parseFloat(qty) <= 0) { setPreview(null); return; }
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setPrevLoad(true);
      api.post('/milk/preview-rate', {
        fat_percentage: parseFloat(fat),
        lactometer_reading: parseFloat(lr),
        quantity_liters: parseFloat(qty),
        target_ts: parseFloat(form.target_ts) || 13,
      })
        .then(r => setPreview(r.data.data))
        .catch(() => setPreview(null))
        .finally(() => setPrevLoad(false));
    }, 500);
    return () => clearTimeout(debounce.current);
  }, [form.fat_percentage, form.lactometer_reading, form.quantity_liters, form.target_ts]);

  const validate = () => {
    const e = {};
    if (!form.farmer_id)       e.farmer_id       = 'Select supplier';
    if (!form.quantity_liters || parseFloat(form.quantity_liters) <= 0) e.quantity_liters = 'Enter quantity';
    if (!form.fat_percentage)  e.fat_percentage  = 'Enter FAT%';
    if (!form.lactometer_reading) e.lactometer_reading = 'Enter LR';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const onSubmit = async e => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      await api.post('/milk', {
        farmer_id:          parseInt(form.farmer_id, 10),
        collection_date:    form.collection_date,
        quantity_liters:    parseFloat(form.quantity_liters),
        fat_percentage:     parseFloat(form.fat_percentage),
        lactometer_reading: form.lactometer_reading ? parseFloat(form.lactometer_reading) : undefined,
        target_ts:          parseFloat(form.target_ts) || 13,
        notes:              form.notes || undefined,
      });
      toast.success('Record saved');
      onSaved();
      onClose();
    } catch (err) {
      const errs = err.response?.data?.errors;
      if (errs?.length) {
        toast.error(errs.map(e => `${e.field}: ${e.message}`).join(' | '));
      } else {
        toast.error(err.response?.data?.message || 'Save failed');
      }
    }
    finally { setSaving(false); }
  };

  if (!isOpen) return null;

  const inputBase = 'w-full border rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-[#1d6faa] bg-white transition';
  const inputErr  = 'border-red-400';
  const inputOk   = 'border-slate-200';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0d2137] to-[#1d6faa] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
              <Milk size={18} className="text-white"/>
            </div>
            <div>
              <p className="text-white font-bold text-base">Add Milk Collection</p>
              <p className="text-blue-200 text-xs">All values auto-calculated</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition">
            <X size={16}/>
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">

          {/* Supplier */}
          <Field label="Supplier" required error={errors.farmer_id}>
            {farmers.length === 0 ? (
              <div className="w-full border border-amber-300 bg-amber-50 rounded-xl px-4 py-3 flex items-center gap-3">
                <span className="text-xl">⚠️</span>
                <div>
                  <p className="text-amber-800 font-bold text-sm">No suppliers found</p>
                  <a href="/admin/farmers" className="text-amber-600 text-xs underline">
                    Go to Farmers → Add a supplier first
                  </a>
                </div>
              </div>
            ) : (
              <select value={form.farmer_id} onChange={set('farmer_id')}
                className={`${inputBase} ${errors.farmer_id ? inputErr : inputOk} appearance-none`}>
                <option value="">Select supplier…</option>
                {farmers.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.centre_name || f.name} ({f.farmer_code})
                  </option>
                ))}
              </select>
            )}
          </Field>

          {/* Date */}
          <Field label="Date" required>
            <input type="date" value={form.collection_date} onChange={set('collection_date')}
              className={`${inputBase} ${inputOk}`}/>
          </Field>

          {/* Qty */}
          <Field label="Milk Quantity (L/KG)" required error={errors.quantity_liters}>
            <input type="number" step="0.01" placeholder="0.00"
              value={form.quantity_liters} onChange={set('quantity_liters')}
              className={`${inputBase} ${errors.quantity_liters ? inputErr : inputOk} text-center text-xl font-bold font-mono`}/>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            {/* FAT */}
            <Field label="FAT %" required error={errors.fat_percentage}>
              <input type="number" step="0.01" placeholder="0.00"
                value={form.fat_percentage} onChange={set('fat_percentage')}
                className={`${inputBase} ${errors.fat_percentage ? inputErr : inputOk} text-center font-mono text-blue-600 font-bold`}/>
            </Field>

            {/* LR */}
            <Field label="LR (Lactometer)" required error={errors.lactometer_reading}>
              <input type="number" step="0.1" placeholder="0.0"
                value={form.lactometer_reading} onChange={set('lactometer_reading')}
                className={`${inputBase} ${errors.lactometer_reading ? inputErr : inputOk} text-center font-mono text-violet-600 font-bold`}/>
            </Field>
          </div>

          {/* TS Standard */}
          <Field label="TS Standard (default: 13)">
            <input type="number" step="0.01" placeholder="13"
              value={form.target_ts} onChange={set('target_ts')}
              className={`${inputBase} ${inputOk} text-center font-mono`}/>
          </Field>

          {/* Notes */}
          <Field label="Notes">
            <input value={form.notes} onChange={set('notes')} placeholder="Any remarks…"
              className={`${inputBase} ${inputOk}`}/>
          </Field>

          {/* Live Calculation Output */}
          {(prevLoad || preview) && (
            <div className="rounded-2xl border border-[#1d6faa]/20 bg-gradient-to-br from-blue-50 to-violet-50 overflow-hidden">
              <div className="px-4 py-2.5 bg-[#1d6faa]/10 border-b border-[#1d6faa]/15 flex items-center gap-2">
                <Calculator size={14} className="text-[#1d6faa]"/>
                <p className="text-sm font-bold text-[#1d6faa]">Live Calculation</p>
                {prevLoad && <RefreshCw size={12} className="animate-spin text-[#1d6faa] ml-auto"/>}
              </div>
              {preview && !prevLoad && (
                <div className="p-4 grid grid-cols-3 gap-2">
                  {[
                    { l:'SNF',              v: preview.snf_computed,                     c:'text-emerald-700' },
                    { l:'TS Value',         v: preview.ts,                               c:'text-blue-700' },
                    { l:'Std. TS',          v: preview.standardised_ts,                  c:'text-violet-700' },
                    { l:'TS Milk Qty',      v: (preview.ts && form.quantity_liters && form.target_ts
                                               ? ((parseFloat(form.quantity_liters) * parseFloat(form.target_ts||13)) / preview.ts).toFixed(3)
                                               : '—'),                                    c:'text-slate-700' },
                    { l:'Milk (KGs)',       v: (form.quantity_liters && preview.sp_gravity
                                               ? (parseFloat(form.quantity_liters) * preview.sp_gravity).toFixed(1)
                                               : '—'),                                    c:'text-slate-700' },
                    { l:'Sp. Gravity',      v: preview.sp_gravity,                        c:'text-slate-600' },
                  ].map(({ l, v, c }) => (
                    <div key={l} className="bg-white rounded-xl p-2.5 border border-slate-100 text-center shadow-sm">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{l}</p>
                      <p className={`font-mono font-bold text-sm ${c}`}>{v}</p>
                    </div>
                  ))}
                  {/* Amount — admin only, full row */}
                  {preview.rate_per_unit !== undefined && (
                    <div className="col-span-3 bg-emerald-50 rounded-xl p-3 border border-emerald-100 flex items-center justify-between">
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Rate / L</p>
                        <p className="font-mono font-bold text-sm text-slate-700">Rs {Number(preview.rate_per_unit).toFixed(4)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Amount Payable</p>
                        <p className="font-mono font-bold text-lg text-emerald-700">{fmt(preview.total_payout)}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-3 rounded-xl bg-[#1d6faa] hover:bg-[#1557a0] text-white font-bold text-sm transition disabled:opacity-60 flex items-center justify-center gap-2">
              {saving ? <RefreshCw size={15} className="animate-spin"/> : <Milk size={15}/>}
              {saving ? 'Saving…' : 'Save Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function MilkAdmin() {
  const [records,  setRecords]  = useState([]);
  const [farmers,  setFarmers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState(false);
  const [filters,  setFilters]  = useState({ farmer_id:'', date_from:'', date_to:'' });
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (filters.farmer_id) q.set('farmer_id', filters.farmer_id);
      if (filters.date_from) q.set('date_from', filters.date_from);
      if (filters.date_to)   q.set('date_to',   filters.date_to);
      q.set('limit', '200');
      const r = await api.get(`/milk?${q}`);
      setRecords(r.data.data || []);
    } catch { toast.error('Failed to load records'); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => {
    api.get('/farmers?active=1&limit=200').then(r => setFarmers(r.data.data||[]));
  }, []);

  useEffect(() => { load(); }, [load]);

  const deleteRecord = async id => {
    if (!window.confirm('Delete this record?')) return;
    setDeleting(id);
    try { await api.delete(`/milk/${id}`); toast.success('Deleted'); load(); }
    catch { toast.error('Delete failed'); }
    finally { setDeleting(null); }
  };

  // Summary stats from loaded records
  const stats = records.reduce((acc, r) => {
    acc.liters += parseFloat(r.quantity_liters)||0;
    acc.amount += parseFloat(r.total_amount)||0;
    acc.count++;
    return acc;
  }, { liters: 0, amount: 0, count: 0 });

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Milk Collection</h1>
          <p className="text-sm text-slate-400 mt-0.5">Daily records · TS-based pricing</p>
        </div>
        <button onClick={() => setModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#1d6faa] hover:bg-[#1557a0] text-white rounded-xl font-semibold text-sm transition shadow-sm">
          <Plus size={16}/> Add Record
        </button>
      </div>

      {/* Summary cards */}
      {!loading && records.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label:'Records', value: stats.count, sub:'filtered', color:'bg-blue-50 text-[#1d6faa]' },
            { label:'Total Qty', value: fmtL(stats.liters), sub:'litres', color:'bg-violet-50 text-violet-600' },
            { label:'Total Amount', value: fmt(stats.amount), sub:'payable', color:'bg-emerald-50 text-emerald-700' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${s.color.split(' ')[1]}`}>{s.label}</p>
              <p className="text-xl font-bold font-mono text-slate-800">{s.value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Supplier</label>
          <select value={filters.farmer_id} onChange={e => setFilters(p=>({...p,farmer_id:e.target.value}))}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1d6faa] bg-white min-w-[160px]">
            <option value="">All Suppliers</option>
            {farmers.map(f => <option key={f.id} value={f.id}>{f.centre_name||f.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">From</label>
          <input type="date" value={filters.date_from} onChange={e => setFilters(p=>({...p,date_from:e.target.value}))}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1d6faa]"/>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">To</label>
          <input type="date" value={filters.date_to} onChange={e => setFilters(p=>({...p,date_to:e.target.value}))}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1d6faa]"/>
        </div>
        <button onClick={load}
          className="flex items-center gap-2 px-4 py-2 bg-[#1d6faa] text-white rounded-xl text-sm font-semibold hover:bg-[#1557a0] transition">
          <Search size={14}/> Search
        </button>
        {(filters.farmer_id||filters.date_from||filters.date_to) && (
          <button onClick={() => setFilters({farmer_id:'',date_from:'',date_to:''})}
            className="px-4 py-2 border border-slate-200 text-slate-500 rounded-xl text-sm font-semibold hover:bg-slate-50 transition">
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                {['Date & Time','Supplier','Qty','FAT%','LR','TS','Std TS','SNF','Rate/L','Amount'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                ))}
                <th className="px-4 py-3"/>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(6)].map((_,i) => (
                  <tr key={i} className="border-b border-slate-50">
                    {Array(12).fill(0).map((_,j) => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-3 bg-slate-100 rounded-full animate-pulse"/>
                      </td>
                    ))}
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr><td colSpan={12}>
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mb-3">
                      <Milk size={24} className="text-slate-300"/>
                    </div>
                    <p className="text-slate-400 font-medium">No records found</p>
                    <p className="text-slate-300 text-xs mt-1">Add a milk collection to get started</p>
                  </div>
                </td></tr>
              ) : records.map(r => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-blue-50/30 transition group">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="font-mono text-xs font-semibold text-slate-700">{r.collection_date?.slice(0,10)}</p>
                    <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <Clock size={9}/>{fmtTime(r.collection_time)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800 text-sm">{r.centre_name || r.farmer_name}</p>
                    <p className="text-[10px] text-slate-400">{r.farmer_code}</p>
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-slate-800">{fmtL(r.quantity_liters)}</td>
                  <td className="px-4 py-3 font-mono text-blue-600 font-semibold">{parseFloat(r.fat_percentage||0).toFixed(2)}%</td>
                  <td className="px-4 py-3 font-mono text-violet-600">{r.lactometer_reading ? parseFloat(r.lactometer_reading).toFixed(1) : '—'}</td>
                  <td className="px-4 py-3 font-mono text-blue-700">{r.ts_value ? parseFloat(r.ts_value).toFixed(3) : '—'}</td>
                  <td className="px-4 py-3 font-mono text-violet-700">{r.standardised_ts ? parseFloat(r.standardised_ts).toFixed(3) : '—'}</td>
                  <td className="px-4 py-3 font-mono text-emerald-600">{r.snf_computed ? parseFloat(r.snf_computed).toFixed(3) : '—'}</td>
                  <td className="px-4 py-3 font-mono text-slate-600">{r.computed_rate ? `Rs ${parseFloat(r.computed_rate).toFixed(2)}` : '—'}</td>
                  <td className="px-4 py-3 font-mono font-bold text-emerald-700">{fmt(r.total_amount)}</td>
                  <td className="px-4 py-3 opacity-0 group-hover:opacity-100 transition">
                    <button onClick={() => deleteRecord(r.id)} disabled={deleting===r.id}
                      className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition">
                      <Trash2 size={13}/>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <MilkModal
        isOpen={modal}
        onClose={() => setModal(false)}
        farmers={farmers}
        onSaved={load}
      />
    </div>
  );
}
