import { useState, useEffect, useRef, useCallback } from 'react';
import { Milk, Droplets, FlaskConical, RefreshCw, ChevronDown, ChevronUp, Store, Clock } from 'lucide-react';
import { format } from 'date-fns';
import api from '../../api/client';
import useAuthStore from '../../store/authStore';

const fmtL   = n => `${Number(n||0).toFixed(1)} L`;
const fmtPct = n => `${Number(n||0).toFixed(2)}%`;

const TENURES = [
  { key:'1d',  label:'Today' },
  { key:'7d',  label:'7 Days' },
  { key:'30d', label:'30 Days' },
  { key:'custom', label:'Custom' },
];

function KPITile({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <div className={`w-10 h-10 rounded-xl ${color.bg} flex items-center justify-center mb-3`}>
        <Icon size={18} className={color.icon}/>
      </div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold font-mono ${color.val}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function StaffDashboard() {
  const { user } = useAuthStore();
  const [tenure, setTenure]     = useState('1d');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const tenureRef   = useRef(tenure);
  const dateFromRef = useRef(dateFrom);
  const dateToRef   = useRef(dateTo);
  useEffect(() => { tenureRef.current   = tenure;   }, [tenure]);
  useEffect(() => { dateFromRef.current = dateFrom; }, [dateFrom]);
  useEffect(() => { dateToRef.current   = dateTo;   }, [dateTo]);

  const load = useCallback(async (t, df, dt) => {
    setSpinning(true);
    try {
      let url = `/staff/dashboard?tenure=${t}`;
      if (t === 'custom' && df && dt) url += `&date_from=${df}&date_to=${dt}`;
      const r = await api.get(url);
      setData(r.data.data);
    } catch {}
    finally { setLoading(false); setSpinning(false); }
  }, []);

  useEffect(() => {
    load('1d', '', '');
    const iv = setInterval(() => load(tenureRef.current, dateFromRef.current, dateToRef.current), 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, [load]);

  const handleTenure = t => {
    setTenure(t);
    if (t !== 'custom') load(t, '', '');
  };

  const kpi     = data?.kpi || {};
  const details = data?.details || [];
  const period  = data?.period || {};

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
  })();

  return (
    <div className="space-y-5 pb-10">

      {/* Welcome */}
      <div className="bg-gradient-to-br from-[#1d6faa] to-[#1557a0] rounded-2xl p-5 text-white shadow-md">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-blue-200 text-sm">{greeting} 👋</p>
            <h1 className="text-xl font-bold mt-0.5">{user?.name || 'Staff'}</h1>
            <p className="text-blue-200 text-xs mt-1">
              {format(new Date(), 'EEEE, dd MMM yyyy')} · {format(new Date(), 'hh:mm a')}
            </p>
          </div>
          <button onClick={() => load(tenure, dateFrom, dateTo)}
            className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center transition">
            <RefreshCw size={15} className={spinning ? 'animate-spin' : ''}/>
          </button>
        </div>
        {period.from && (
          <div className="mt-3 bg-white/10 rounded-xl px-3 py-2 text-xs text-blue-100 border border-white/10">
            Period: {period.from === period.to ? period.from : `${period.from} → ${period.to}`}
          </div>
        )}
      </div>

      {/* Tenure */}
      <div className="flex bg-white border border-slate-200 rounded-xl p-1 gap-1 shadow-sm">
        {TENURES.filter(t => t.key !== 'custom').map(t => (
          <button key={t.key} onClick={() => handleTenure(t.key)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition
              ${tenure === t.key ? 'bg-[#1d6faa] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
        <button onClick={() => handleTenure('custom')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition
            ${tenure === 'custom' ? 'bg-[#1d6faa] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          Custom
        </button>
      </div>

      {tenure === 'custom' && (
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-xs text-slate-400 font-semibold mb-1">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1d6faa]"/>
          </div>
          <div className="flex-1">
            <label className="block text-xs text-slate-400 font-semibold mb-1">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1d6faa]"/>
          </div>
          <button onClick={() => { if (dateFrom && dateTo) load('custom', dateFrom, dateTo); }}
            disabled={!dateFrom || !dateTo}
            className="px-4 py-2 bg-[#1d6faa] text-white rounded-xl text-sm font-semibold disabled:opacity-50">
            Go
          </button>
        </div>
      )}

      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_,i) => <div key={i} className="h-28 bg-white rounded-2xl border border-slate-100 animate-pulse"/>)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <KPITile icon={Milk}         label="Total Collected" value={fmtL(kpi.total_liters)}                   sub={`${kpi.entries||0} entries`} color={{ bg:'bg-blue-50',    icon:'text-[#1d6faa]',    val:'text-slate-800' }}/>
          <KPITile icon={Droplets}     label="Avg FAT%"        value={fmtPct(kpi.avg_fat)}                      sub="this period"                 color={{ bg:'bg-amber-50',   icon:'text-amber-600',   val:'text-amber-700' }}/>
          <KPITile icon={FlaskConical} label="Avg TS"          value={Number(kpi.avg_ts||0).toFixed(3)}         sub="total solids"                color={{ bg:'bg-violet-50',  icon:'text-violet-600',  val:'text-violet-700' }}/>
          <KPITile icon={FlaskConical} label="Avg SNF"         value={Number(kpi.avg_snf||0).toFixed(3)+'%'}    sub="derived"                     color={{ bg:'bg-emerald-50', icon:'text-emerald-600', val:'text-emerald-700' }}/>
        </div>
      )}

      {/* Details — centre→shop breakdown */}
      {!loading && details.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <button
            onClick={() => setExpanded(p => !p)}
            className="w-full flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <p className="font-semibold text-slate-700 text-sm">Collection Details ({details.length})</p>
            {expanded ? <ChevronUp size={16} className="text-slate-400"/> : <ChevronDown size={16} className="text-slate-400"/>}
          </button>

          {expanded && (
            <div className="divide-y divide-slate-50">
              {details.map(r => (
                <div key={r.id} className="px-5 py-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {/* Centre name */}
                      <p className="font-semibold text-slate-700 text-sm">{r.centre_name || r.farmer_name}</p>
                      {/* Readings row */}
                      <p className="text-xs text-slate-400 font-mono mt-0.5">
                        {parseFloat(r.quantity_liters).toFixed(1)}L
                        {r.fat_percentage ? ` · FAT ${parseFloat(r.fat_percentage).toFixed(1)}%` : ''}
                        {r.lactometer_reading ? ` · LR ${parseFloat(r.lactometer_reading).toFixed(1)}` : ''}
                        {r.snf_computed ? ` · SNF ${parseFloat(r.snf_computed).toFixed(2)}%` : ''}
                      </p>
                    </div>
                    <div className="text-right ml-3 flex-shrink-0">
                      {r.ts_value ? (
                        <p className="text-xs font-mono font-bold text-blue-600">TS {parseFloat(r.ts_value).toFixed(3)}</p>
                      ) : null}
                      <p className="text-xs text-slate-400 flex items-center gap-1 justify-end mt-0.5">
                        <Clock size={10}/>
                        {r.collection_time
                          ? format(new Date(r.collection_time), 'hh:mm a')
                          : r.collection_date}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && details.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center py-14 text-center">
          <Milk size={28} className="text-slate-200 mb-3"/>
          <p className="text-slate-400 text-sm font-medium">No collections this period</p>
          <p className="text-slate-300 text-xs mt-1">Add a milk collection to see your stats</p>
        </div>
      )}
    </div>
  );
}
