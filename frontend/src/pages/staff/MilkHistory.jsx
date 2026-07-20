import { useState, useEffect, useCallback } from 'react';
import { Milk, Search, Clock, Store, FlaskConical, Droplets } from 'lucide-react';
import { format } from 'date-fns';
import api from '../../api/client';

const fmtL = n => `${Number(n||0).toFixed(1)}L`;
const fmtTime = ts => {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleTimeString('en-PK',{hour:'2-digit',minute:'2-digit',hour12:true}); }
  catch { return '—'; }
};
const today = () => new Date().toISOString().slice(0,10);

export default function MilkHistory() {
  const [records,  setRecords]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [centres,  setCentres]  = useState([]);
  const [filters,  setFilters]  = useState({
    farmer_id: '', date_from: today(), date_to: today()
  });

  useEffect(() => {
    api.get('/farmers?active=1&limit=200').then(r => setCentres(r.data.data||[]));
  }, []);

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
    } catch {}
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  // Summary
  const stats = records.reduce((acc, r) => {
    acc.liters += parseFloat(r.quantity_liters)||0;
    acc.count++;
    return acc;
  }, { liters: 0, count: 0 });

  return (
    <div className="pb-10 space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-800">Collection History</h1>
        <p className="text-sm text-slate-400 flex items-center gap-1.5 mt-0.5">
          <Clock size={13}/>
          {format(new Date(), 'EEEE, dd MMM yyyy')}
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Filter Records</p>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Collection Centre</label>
          <select value={filters.farmer_id} onChange={e => setFilters(p=>({...p,farmer_id:e.target.value}))}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1d6faa] bg-white">
            <option value="">All Centres</option>
            {centres.map(c => <option key={c.id} value={c.id}>{c.centre_name||c.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">From</label>
            <input type="date" value={filters.date_from} onChange={e => setFilters(p=>({...p,date_from:e.target.value}))}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1d6faa]"/>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">To</label>
            <input type="date" value={filters.date_to} onChange={e => setFilters(p=>({...p,date_to:e.target.value}))}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1d6faa]"/>
          </div>
        </div>
        <button onClick={load}
          className="w-full py-3 rounded-xl bg-[#1d6faa] hover:bg-[#1557a0] text-white font-bold text-sm flex items-center justify-center gap-2 transition">
          <Search size={15}/> Search
        </button>
      </div>

      {/* Stats */}
      {!loading && records.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center mb-2">
              <Milk size={14} className="text-[#1d6faa]"/>
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Qty</p>
            <p className="text-xl font-bold font-mono text-slate-800">{fmtL(stats.liters)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center mb-2">
              <FlaskConical size={14} className="text-emerald-600"/>
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Records</p>
            <p className="text-xl font-bold font-mono text-slate-800">{stats.count}</p>
          </div>
        </div>
      )}

      {/* Records List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_,i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 animate-pulse">
              <div className="h-3 w-1/3 bg-slate-100 rounded mb-2"/>
              <div className="h-3 w-2/3 bg-slate-100 rounded"/>
            </div>
          ))}
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mb-3">
            <Milk size={22} className="text-slate-200"/>
          </div>
          <p className="text-slate-400 font-medium text-sm">No records found</p>
          <p className="text-slate-300 text-xs mt-1">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map(r => (
            <div key={r.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-bold text-slate-800 text-sm">{r.centre_name || r.farmer_name}</p>
                    <span className="text-[10px] font-semibold text-slate-400 font-mono">{r.farmer_code}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Droplets size={10} className="text-[#1d6faa]"/>
                      <strong className="font-mono text-slate-700">{parseFloat(r.quantity_liters).toFixed(1)}L</strong>
                    </span>
                    <span>· FAT <strong className="font-mono text-blue-600">{parseFloat(r.fat_percentage).toFixed(2)}%</strong></span>
                    {r.lactometer_reading && (
                      <span>· LR <strong className="font-mono text-violet-600">{parseFloat(r.lactometer_reading).toFixed(1)}</strong></span>
                    )}
                    {r.snf_computed && (
                      <span>· SNF <strong className="font-mono text-emerald-600">{parseFloat(r.snf_computed).toFixed(3)}</strong></span>
                    )}
                  </div>
                </div>
                <div className="text-right ml-3 flex-shrink-0">
                  {r.ts_value && (
                    <p className="text-xs font-mono font-bold text-blue-600">TS {parseFloat(r.ts_value).toFixed(3)}</p>
                  )}
                  <p className="text-xs text-slate-400 flex items-center gap-1 justify-end mt-1">
                    <Clock size={9}/>
                    {r.collection_time ? fmtTime(r.collection_time) : r.collection_date}
                  </p>
                  <p className="text-[10px] text-slate-300 mt-0.5">{r.collection_date}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
