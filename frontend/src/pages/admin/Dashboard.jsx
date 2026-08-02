import { useState, useEffect, useCallback, useRef } from 'react';
import { TrendingUp, Package, Truck, ChevronDown, ChevronUp, RefreshCw, Droplets, Users, Calendar, Building2 } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import api from '../../api/client';
import useAuthStore from '../../store/authStore';

const fmtPKR = n => `Rs ${Number(n||0).toLocaleString('en-PK',{maximumFractionDigits:0})}`;
const fmtL   = n => `${Number(n||0).toFixed(1)} L`;
const fmtPct = n => `${Number(n||0).toFixed(1)}%`;

const TENURES = [
  { key:'1d',  label:'Today' },
  { key:'7d',  label:'7 Days' },
  { key:'30d', label:'30 Days' },
  { key:'custom', label:'Custom' },
];

function KPICard({ label, value, sub, icon: Icon, color, expandable, expanded, onToggle, children }) {
  return (
    <div
      onClick={expandable ? onToggle : undefined}
      className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-6 transition-all
        ${expandable ? 'cursor-pointer hover:shadow-md' : ''}`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color.bg}`}>
          <Icon size={20} className={color.icon} />
        </div>
        {expandable && (
          <span className="flex items-center gap-1 text-xs text-slate-400 font-medium">
            {expanded ? 'Hide' : 'View'} details
            {expanded ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
          </span>
        )}
      </div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-3xl font-bold font-mono ${color.val}`}>{value}</p>
      <p className="text-xs text-slate-400 mt-2">{sub}</p>

      {expandable && expanded && (
        <div className="mt-4 pt-4 border-t border-slate-100 space-y-2" onClick={e => e.stopPropagation()}>
          {children}
        </div>
      )}
    </div>
  );
}

const ChartTip = ({ active, payload, label, unit='' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-slate-500 mb-1">{label}</p>
      {payload.map((p,i) => (
        <p key={i} style={{color:p.color}} className="font-mono">
          {p.name}: {unit==='Rs' ? fmtPKR(p.value) : `${Number(p.value).toFixed(1)}${unit}`}
        </p>
      ))}
    </div>
  );
};

function Skeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
      {[...Array(3)].map((_,i) => (
        <div key={i} className="bg-white rounded-2xl border border-slate-100 h-40 animate-pulse">
          <div className="p-6 space-y-4">
            <div className="w-11 h-11 rounded-xl bg-slate-100"/>
            <div className="h-3 w-24 bg-slate-100 rounded-full"/>
            <div className="h-8 w-32 bg-slate-100 rounded-full"/>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuthStore();
  const [tenure, setTenure]     = useState('1d');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [purchOpen, setPurchOpen] = useState(false);

  const load = useCallback(async (t, df, dt) => {
    setSpinning(true);
    try {
      let url = `/dashboard?tenure=${t}`;
      if (t === 'custom' && df && dt) url += `&date_from=${df}&date_to=${dt}`;
      const res = await api.get(url);
      setData(res.data.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setSpinning(false); }
  }, []);

  // Keep a ref so the interval always has current values
  const tenureRef   = useRef(tenure);
  const dateFromRef = useRef(dateFrom);
  const dateToRef   = useRef(dateTo);
  useEffect(() => { tenureRef.current   = tenure;   }, [tenure]);
  useEffect(() => { dateFromRef.current = dateFrom; }, [dateFrom]);
  useEffect(() => { dateToRef.current   = dateTo;   }, [dateTo]);

  useEffect(() => {
    load('1d', '', '');
    const iv = setInterval(() => load(tenureRef.current, dateFromRef.current, dateToRef.current), 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, [load]);

  const handleTenure = t => {
    setTenure(t);
    if (t !== 'custom') load(t, '', '');
  };

  const kpi       = data?.kpi || {};
  const purchases = data?.purchase_breakdown || [];
  const period    = data?.period || {};

  // Merge trends
  const trendData = (data?.milk_trend || []).map(m => {
    const s = (data?.sales_trend || []).find(x => x.month === m.month) || {};
    return { month: m.month?.slice(5) || m.month, Collected: +m.liters||0, Sold: +s.liters||0 };
  });

  const topFarmers = (data?.top_farmers || []).map(f => ({
    name: (f.centre_name || f.name)?.split(' ')[0] || f.name,
    Litres: +f.liters || 0,
  }));

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
  })();

  const dateLabel = period.from === period.to
    ? period.from
    : period.from && period.to ? `${period.from} → ${period.to}` : '—';

  return (
    <div className="space-y-6">

      {/* ── Welcome Banner ─────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-[#1d6faa] via-[#1a6398] to-[#1557a0] rounded-2xl p-6 text-white shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-blue-200 text-sm">{greeting} 👋</p>
            <h1 className="text-2xl font-bold mt-0.5">
              Welcome Back, {user?.name || user?.username || 'Admin'}!
            </h1>
            <p className="text-blue-200 text-sm mt-1 flex items-center gap-1.5">
              <Calendar size={13}/>
              {new Date().toLocaleDateString('en-PK',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}
            </p>
          </div>
          {data && (
            <div className="flex items-center gap-3">
              <div className="bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-center">
                <p className="text-blue-200 text-xs mb-0.5">Period</p>
                <p className="font-semibold text-sm">{dateLabel}</p>
              </div>
              <button
                onClick={() => load(tenure, dateFrom, dateTo)}
                className="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/25 border border-white/20 flex items-center justify-center transition"
              >
                <RefreshCw size={16} className={spinning ? 'animate-spin' : ''} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Tenure Selector ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex bg-white border border-slate-200 rounded-xl p-1 gap-1 shadow-sm">
          {TENURES.filter(t => t.key !== 'custom').map(t => (
            <button key={t.key} onClick={() => handleTenure(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition
                ${tenure === t.key
                  ? 'bg-[#1d6faa] text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'}`}
            >{t.label}</button>
          ))}
          <button onClick={() => handleTenure('custom')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition
              ${tenure === 'custom'
                ? 'bg-[#1d6faa] text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800'}`}
          >Custom</button>
        </div>

        {tenure === 'custom' && (
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1d6faa] bg-white shadow-sm"/>
            <span className="text-slate-400 text-sm font-medium">→</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1d6faa] bg-white shadow-sm"/>
            <button onClick={() => { if (dateFrom && dateTo) load('custom', dateFrom, dateTo); }}
              disabled={!dateFrom || !dateTo}
              className="px-5 py-2 bg-[#1d6faa] text-white rounded-xl text-sm font-semibold hover:bg-[#1557a0] transition disabled:opacity-50">
              Apply
            </button>
          </div>
        )}
      </div>

      {/* ── 3 KPI Cards ────────────────────────────────────────────── */}
      {loading ? <Skeleton /> : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">

          {/* SALES */}
          <KPICard
            label="Total Sales"
            value={fmtPKR(kpi.total_revenue)}
            sub={`${fmtL(kpi.sold_liters)} sold · ${kpi.transactions || 0} transactions`}
            icon={TrendingUp}
            color={{ bg:'bg-emerald-50', icon:'text-emerald-600', val:'text-emerald-700' }}
          />

          {/* PURCHASE — expandable */}
          <KPICard
            label="Total Purchase"
            value={fmtPKR(kpi.purchase_cost)}
            sub={`${fmtL(kpi.total_liters)} from ${kpi.active_farmers || 0} centres`}
            icon={Truck}
            color={{ bg:'bg-blue-50', icon:'text-[#1d6faa]', val:'text-slate-800' }}
            expandable expanded={purchOpen} onToggle={() => setPurchOpen(p => !p)}
          >
            {purchases.length === 0
              ? <p className="text-slate-400 text-xs text-center py-2">No purchase data this period.</p>
              : purchases.map((p, i) => (
                <div key={i} className="flex justify-between items-start text-xs py-2 border-b border-slate-50 last:border-0">
                  <div>
                    <p className="font-semibold text-slate-700">{p.centre_name || p.farmer_name}</p>
                    <p className="text-slate-400 mt-0.5">
                      {p.location || '—'} · FAT {fmtPct(p.avg_fat)}
                      {p.shop_name ? <span className="ml-1 text-[#1d6faa]">→ {p.shop_name}</span> : null}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold text-slate-700">{fmtL(p.liters)}</p>
                    <p className="text-slate-400">{fmtPKR(p.amount)}</p>
                  </div>
                </div>
              ))
            }
          </KPICard>

          {/* STOCK LEFT */}
          <KPICard
            label="Stock Left"
            value={fmtL(kpi.stock_liters)}
            sub={`${fmtL(kpi.total_liters || 0)} collected − ${fmtL((parseFloat(kpi.total_liters||0) - parseFloat(kpi.stock_liters||0)).toFixed(1))} delivered`}
            icon={Package}
            color={{
              bg: parseFloat(kpi.stock_liters) < 50 ? 'bg-red-50' : 'bg-amber-50',
              icon: parseFloat(kpi.stock_liters) < 50 ? 'text-red-500' : 'text-amber-600',
              val: parseFloat(kpi.stock_liters) < 50 ? 'text-red-600' : 'text-amber-700',
            }}
          />
        </div>
      )}

      {/* ── Charts (only if trend data exists) ─────────────────────── */}
      {!loading && trendData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="font-semibold text-slate-700 mb-0.5">Collection vs Sales</p>
            <p className="text-xs text-slate-400 mb-5">Litres — last 6 months</p>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1d6faa" stopOpacity={0.12}/>
                    <stop offset="95%" stopColor="#1d6faa" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gS" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.12}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
                <XAxis dataKey="month" tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                <Tooltip content={<ChartTip unit=" L"/>}/>
                <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:12}}/>
                <Area type="monotone" dataKey="Collected" stroke="#1d6faa" strokeWidth={2} fill="url(#gC)" dot={{r:3,fill:'#1d6faa'}}/>
                <Area type="monotone" dataKey="Sold" stroke="#10b981" strokeWidth={2} fill="url(#gS)" dot={{r:3,fill:'#10b981'}}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {topFarmers.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <p className="font-semibold text-slate-700 mb-0.5">Top Collection Centres</p>
              <p className="text-xs text-slate-400 mb-5">By litres this period</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={topFarmers} layout="vertical" barSize={16}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false}/>
                  <XAxis type="number" tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                  <YAxis dataKey="name" type="category" width={70} tick={{fontSize:11,fill:'#64748b'}} axisLine={false} tickLine={false}/>
                  <Tooltip content={<ChartTip unit=" L"/>}/>
                  <Bar dataKey="Litres" fill="#1d6faa" radius={[0,6,6,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── Bottom info strip ──────────────────────────────────────── */}
      {!loading && data && (
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 flex flex-wrap gap-6">
          {[
            { icon: Droplets, bg:'bg-blue-100', ic:'text-[#1d6faa]', label:'Total Collected', val: fmtL(kpi.total_liters) },
            { icon: Users,    bg:'bg-emerald-100', ic:'text-emerald-600', label:'Active Farmers',  val: kpi.active_farmers || 0 },
            { icon: Building2,    bg:'bg-amber-100',   ic:'text-amber-600',   label:'Avg FAT%',        val: fmtPct(kpi.avg_fat) },
          ].map(({ icon: Icon, bg, ic, label, val }) => (
            <div key={label} className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
                <Icon size={16} className={ic}/>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">{label}</p>
                <p className="font-bold text-slate-800">{val}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
