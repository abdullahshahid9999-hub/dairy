import { useState, useEffect, useRef } from 'react';
import { Milk, Calculator, RefreshCw, AlertCircle, ChevronDown, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import api from '../../api/client';

const todayStr = () => format(new Date(), 'yyyy-MM-dd');

const emptyForm = () => ({
  farmer_id:          '',
  collection_date:    todayStr(),
  quantity_liters:    '',
  fat_percentage:     '',
  lactometer_reading: '',
  target_ts:          '13',
  notes:              '',
});

// ── Result card shown after save ─────────────────────────────────────────────
function ResultCard({ result, onClose }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-lg overflow-hidden">
      <div className="bg-gradient-to-r from-[#0d2137] to-[#1d6faa] px-4 py-3 text-center">
        <p className="text-white font-bold text-base tracking-wide">Collection Saved ✓</p>
        <p className="text-blue-200 text-xs mt-0.5">{result.centre}</p>
      </div>
      <div className="px-5 py-4 grid grid-cols-2 gap-3">
        {[
          { label:'SNF',              val: result.snf,            color:'text-emerald-700' },
          { label:'TS Value',         val: result.ts,             color:'text-blue-700' },
          { label:'TS Milk Qty',      val: result.ts_milk_qty,    color:'text-violet-700' },
          { label:'Milk (KGs)',       val: result.milk_kg,        color:'text-slate-700' },
          { label:'Sp. Gravity',      val: result.sp_gravity,     color:'text-slate-600' },
          { label:'Standardised TS',  val: result.standardised_ts, color:'text-violet-600' },
        ].map(({ label, val, color }) => (
          <div key={label} className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
            <p className={`font-mono font-bold text-sm ${color}`}>{val}</p>
          </div>
        ))}
      </div>
      <div className="px-5 pb-5 pt-1">
        <button onClick={onClose}
          className="w-full py-3 rounded-xl bg-[#1d6faa] text-white font-bold text-sm hover:bg-[#1557a0] transition">
          Add Another
        </button>
      </div>
    </div>
  );
}

export default function MilkEntry() {

  const [centres,  setCentres]  = useState([]);
  const [form,     setForm]     = useState(emptyForm());
  const [preview,  setPreview]  = useState(null);
  const [prevLoad, setPrevLoad] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [result,   setResult]   = useState(null);
  const [errors,   setErrors]   = useState({});
  const debounce = useRef(null);

  useEffect(() => {
    api.get('/farmers?limit=200&active=1').then(r => setCentres(r.data.data || []));
  }, []);

  const set = key => e => setForm(p => ({ ...p, [key]: e.target.value }));

  // Live preview
  useEffect(() => {
    const { fat_percentage: fat, lactometer_reading: lr, quantity_liters: qty } = form;
    if (!fat || !lr || !qty || parseFloat(qty) <= 0) { setPreview(null); return; }
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setPrevLoad(true);
      api.post('/milk/preview-rate', {
        fat_percentage:     parseFloat(fat),
        lactometer_reading: parseFloat(lr),
        quantity_liters:    parseFloat(qty),
        target_ts:          parseFloat(form.target_ts) || 13,
      })
        .then(r => setPreview(r.data.data))
        .catch(() => setPreview(null))
        .finally(() => setPrevLoad(false));
    }, 600);
    return () => clearTimeout(debounce.current);
  }, [form.fat_percentage, form.lactometer_reading, form.quantity_liters, form.target_ts]);

  const validate = () => {
    const e = {};
    if (!form.farmer_id)        e.farmer_id          = 'Select collection centre';
    if (!form.quantity_liters || parseFloat(form.quantity_liters) <= 0) e.quantity_liters = 'Enter quantity';
    if (!form.fat_percentage)   e.fat_percentage      = 'Enter FAT%';
    if (!form.lactometer_reading) e.lactometer_reading = 'Enter LR';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const onSubmit = async e => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const r = await api.post('/milk', {
        farmer_id:          parseInt(form.farmer_id, 10),
        collection_date:    form.collection_date,
        quantity_liters:    parseFloat(form.quantity_liters),
        fat_percentage:     parseFloat(form.fat_percentage),
        lactometer_reading: form.lactometer_reading ? parseFloat(form.lactometer_reading) : undefined,
        target_ts:          parseFloat(form.target_ts) || 13,
        notes:              form.notes || undefined,
      });
      const data = r.data.data || {};
      const centre = centres.find(c => String(c.id) === String(form.farmer_id));

      const fat    = parseFloat(form.fat_percentage);
      const lr     = parseFloat(form.lactometer_reading);
      const litres = parseFloat(form.quantity_liters);
      const ts_std = parseFloat(form.target_ts) || 13;

      // Formulas (fallback if backend didn't return values)
      const sp_gravity   = data.sp_gravity    || (lr / 1000) + 1;
      const snf          = data.snf_computed  || (lr / 4) + (0.21 * fat) + 0.36;
      const ts           = data.ts            || (fat + snf);
      const milk_kg      = litres * sp_gravity;
      const std_qty      = data.standardised_ts || (milk_kg * (ts / ts_std));
      const dry_solids   = data.dry_solids    || (milk_kg * (ts / 100));

      setResult({
        centre:          centre?.centre_name || centre?.name || '',
        snf:             snf.toFixed(3),
        ts:              ts.toFixed(3),
        standardised_ts: std_qty.toFixed(3),
        ts_milk_qty:     std_qty.toFixed(3),
        milk_kg:         milk_kg.toFixed(3),
        sp_gravity:      sp_gravity.toFixed(4),
        dry_solids:      dry_solids.toFixed(3),
      });

      toast.success('✓ Saved');
      setForm(p => ({ ...emptyForm(), collection_date: p.collection_date }));
      setPreview(null);
      setErrors({});
    } catch (err) {
      const errs = err.response?.data?.errors;
      if (errs?.length) {
        toast.error(errs.map(e => `${e.field}: ${e.message}`).join(' | '));
      } else {
        toast.error(err.response?.data?.message || 'Save failed');
      }
    } finally { setSaving(false); }
  };

  const inputBase = 'w-full border rounded-xl px-3 focus:outline-none focus:border-[#1d6faa] transition';

  if (result) return (
    <div className="pb-10 max-w-sm mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Milk Collection</h1>
        <p className="text-sm text-slate-400 flex items-center gap-1.5 mt-0.5">
          <Clock size={13}/>{format(new Date(), 'EEEE, dd MMM yyyy')} · {format(new Date(), 'hh:mm a')}
        </p>
      </div>
      <ResultCard result={result} onClose={() => setResult(null)}/>
    </div>
  );

  return (
    <div className="pb-10 max-w-sm mx-auto space-y-4">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-800">Milk Collection</h1>
        <p className="text-sm text-slate-400 flex items-center gap-1.5 mt-0.5">
          <Clock size={13}/>{format(new Date(), 'EEEE, dd MMM yyyy')} · {format(new Date(), 'hh:mm a')}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">

        {/* Date — time recorded auto */}
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Date</label>
          <input type="date" value={form.collection_date} onChange={set('collection_date')}
            className={`${inputBase} py-3 text-sm bg-slate-50`}/>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
            <Clock size={10}/> Time recorded automatically: {format(new Date(),'hh:mm a')}
          </p>
        </div>

        {/* Collection Centre */}
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
            Collection Centre <span className="text-red-400">*</span>
          </label>
          {centres.length === 0 ? (
            <div className="w-full border border-amber-300 bg-amber-50 rounded-xl px-4 py-3">
              <p className="text-amber-800 font-bold text-sm">⚠️ No collection centres found</p>
              <p className="text-amber-600 text-xs mt-0.5">Ask admin to add suppliers/farmers first.</p>
            </div>
          ) : (
            <div className="relative">
              <select value={form.farmer_id} onChange={set('farmer_id')}
                className={`${inputBase} py-3.5 text-sm appearance-none pr-10 bg-white
                  ${errors.farmer_id ? 'border-red-400' : 'border-slate-200'}`}>
                <option value="">Select centre…</option>
                {centres.map(c => (
                  <option key={c.id} value={c.id}>{c.centre_name || c.name} ({c.farmer_code})</option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
            </div>
          )}
          {errors.farmer_id && (
            <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
              <AlertCircle size={11}/>{errors.farmer_id}
            </p>
          )}
        </div>

        {/* Milk Quantity */}
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
            Milk Qty (KG / L) <span className="text-red-400">*</span>
          </label>
          <input type="number" inputMode="decimal" step="0.01" placeholder="0.00"
            value={form.quantity_liters} onChange={set('quantity_liters')}
            className={`${inputBase} py-4 text-2xl font-bold font-mono text-center
              ${errors.quantity_liters ? 'border-red-400' : 'border-slate-200'}`}/>
          {errors.quantity_liters && (
            <p className="text-red-500 text-xs mt-1">{errors.quantity_liters}</p>
          )}
        </div>

        {/* FAT + LR */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
              Fat % <span className="text-red-400">*</span>
            </label>
            <input type="number" inputMode="decimal" step="0.01" placeholder="0.00"
              value={form.fat_percentage} onChange={set('fat_percentage')}
              className={`${inputBase} py-4 text-xl font-bold font-mono text-center text-blue-600
                ${errors.fat_percentage ? 'border-red-400' : 'border-slate-200'}`}/>
            {errors.fat_percentage && (
              <p className="text-red-500 text-xs mt-1">{errors.fat_percentage}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
              LR <span className="text-red-400">*</span>
            </label>
            <input type="number" inputMode="decimal" step="0.1" placeholder="0.0"
              value={form.lactometer_reading} onChange={set('lactometer_reading')}
              className={`${inputBase} py-4 text-xl font-bold font-mono text-center text-violet-600
                ${errors.lactometer_reading ? 'border-red-400' : 'border-slate-200'}`}/>
            {errors.lactometer_reading && (
              <p className="text-red-500 text-xs mt-1">{errors.lactometer_reading}</p>
            )}
          </div>
        </div>

        {/* TS Standard */}
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
            Std. TS% <span className="normal-case font-normal text-slate-400">(default: 13)</span>
          </label>
          <input type="number" inputMode="decimal" step="0.01" placeholder="13"
            value={form.target_ts} onChange={set('target_ts')}
            className={`${inputBase} py-3 text-base font-mono text-center text-slate-600 border-slate-200`}/>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
            Notes <span className="normal-case font-normal text-slate-400">(optional)</span>
          </label>
          <input value={form.notes} onChange={set('notes')} placeholder="Any remarks…"
            className={`${inputBase} py-3 text-sm border-slate-200`}/>
        </div>

        {/* Live Preview (staff sees TS/SNF only, no price) */}
        {(prevLoad || preview) && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Calculator size={14} className="text-blue-500"/>
              <p className="text-sm font-bold text-blue-700">Live Calculation</p>
              {prevLoad && <RefreshCw size={12} className="animate-spin text-blue-400 ml-auto"/>}
            </div>
            {preview && !prevLoad && (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { l:'SNF%',           v: preview.snf_computed    != null ? Number(preview.snf_computed).toFixed(3)    : '—', c:'text-emerald-700' },
                  { l:'TS%',            v: preview.ts              != null ? Number(preview.ts).toFixed(3)              : '—', c:'text-blue-700' },
                  { l:'Sp. Gravity',    v: preview.sp_gravity      != null ? Number(preview.sp_gravity).toFixed(4)      : '—', c:'text-slate-600' },
                  { l:'Milk (kg)',      v: preview.milk_kg         != null ? Number(preview.milk_kg).toFixed(3)         : '—', c:'text-orange-600' },
                  { l:'Dry Solids kg',  v: preview.dry_solids      != null ? Number(preview.dry_solids).toFixed(3)      : '—', c:'text-purple-700' },
                  { l:'Std Qty (kg)',   v: preview.standardised_ts != null ? Number(preview.standardised_ts).toFixed(3) : '—', c:'text-violet-700' },
                ].map(({ l, v, c }) => (
                  <div key={l} className="bg-white rounded-xl p-2.5 border border-blue-100 text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{l}</p>
                    <p className={`font-mono font-bold text-sm ${c}`}>{v}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <button type="submit" disabled={saving}
          className="w-full py-4 rounded-2xl bg-[#1d6faa] hover:bg-[#1557a0] active:scale-[0.98]
                     text-white font-bold text-lg flex items-center justify-center gap-3
                     transition-all disabled:opacity-60 shadow-md">
          {saving
            ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"/>
            : <><Milk size={21}/>Save Collection</>}
        </button>
      </form>
    </div>
  );
}
