import { useState, useEffect, useCallback } from 'react';
import { ShoppingBag, Milk, DollarSign, TrendingUp, RefreshCw, Store } from 'lucide-react';
import { format } from 'date-fns';
import api from '../../api/client';
import useAuthStore from '../../store/authStore';

const fmt    = n => `Rs ${Number(n||0).toLocaleString('en-PK',{maximumFractionDigits:0})}`;
const fmtL   = n => `${Number(n||0).toFixed(1)} L`;

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

export default function SalesDashboard() {
  const { user } = useAuthStore();
  const [tenure, setTenure]     = useState('1d');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [spinning, setSpinning] = useState(false);

  const greet = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning ☀️';
    if (h < 17) return 'Good Afternoon 👋';
    return 'Good Evening 🌙';
  };

  const load = useCallback(async (t = tenure, df = dateFrom, dt = dateTo) => {
    setSpinning(true);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      let start = today, end = today;
      if (t === '7d')     { start = format(new Date(Date.now()-6*864e5),'yyyy-MM-dd'); }
      else if (t === '30d'){ start = format(new Date(Date.now()-29*864e5),'yyyy-MM-dd'); }
      else if (t === 'custom' && df && dt){ start = df; end = dt; }

      const params = new URLSearchParams({ date_from: start, date_to: end });

      const { data: r } = await api.get(`/customers/sales-summary?${params}`);
      setData(r.data || null);
    } catch { setData(null); }
    finally { setSpinning(false); setLoading(false); }
  }, [tenure, dateFrom, dateTo]);

  useEffect(() => { load(tenure, dateFrom, dateTo); }, [tenure]);

  const periodLabel = () => {
    if (tenure === '1d') return format(new Date(), 'yyyy-MM-dd');
    if (tenure === '7d') return 'Last 7 days';
    if (tenure === '30d') return 'Last 30 days';
    if (dateFrom && dateTo) return `${dateFrom} → ${dateTo}`;
    return '';
  };

  return (
    <div className="space-y-5">
      {/* Header card */}
      <div className="rounded-2xl p-5 text-white shadow-lg" style={{ background: 'linear-gradient(135deg,#1b6ca8,#2a85c8)' }}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-blue-200 text-sm">{greet()}</p>
            <p className="text-xl font-bold mt-0.5">{user?.name}</p>
            <p className="text-blue-200 text-xs mt-1">{format(new Date(),'EEEE, d MMM yyyy · hh:mm a')}</p>
            {user?.shop_name && (
              <div className="flex items-center gap-1.5 mt-2 text-blue-100 text-xs">
                <Store size={12}/>
                <span>{user.shop_name}</span>
              </div>
            )}
          </div>
          <button onClick={() => load(tenure, dateFrom, dateTo)}
            className={`p-2 rounded-xl bg-white/10 hover:bg-white/20 transition ${spinning ? 'animate-spin' : ''}`}>
            <RefreshCw size={16}/>
          </button>
        </div>
        <div className="mt-3 bg-white/10 rounded-xl px-4 py-2 text-xs text-blue-100">
          Period: {periodLabel()}
        </div>
      </div>

      {/* Tenure tabs */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-1 flex gap-1">
        {TENURES.map(t => (
          <button key={t.key} onClick={() => { setTenure(t.key); }}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition ${tenure===t.key ? 'bg-[#1b6ca8] text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tenure === 'custom' && (
        <div className="flex gap-3">
          <div className="flex-1"><label className="text-xs text-slate-500 mb-1 block">From</label>
            <input type="date" value={dateFrom} onChange={e=>{ setDateFrom(e.target.value); if(dateTo) load('custom',e.target.value,dateTo); }}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"/></div>
          <div className="flex-1"><label className="text-xs text-slate-500 mb-1 block">To</label>
            <input type="date" value={dateTo} onChange={e=>{ setDateTo(e.target.value); if(dateFrom) load('custom',dateFrom,e.target.value); }}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"/></div>
        </div>
      )}

      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[1,2,3,4].map(i=><div key={i} className="bg-white rounded-2xl h-28 animate-pulse border border-slate-100"/>)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <KPITile icon={ShoppingBag} label="Total Sales"
            value={fmt(data?.total_revenue || 0)}
            sub={`${data?.total_receipts || 0} receipts`}
            color={{ bg:'bg-emerald-50', icon:'text-emerald-500', val:'text-emerald-700' }}/>
          <KPITile icon={Milk} label="Milk Sold"
            value={fmtL(data?.sold_liters || 0)}
            sub="this period"
            color={{ bg:'bg-blue-50', icon:'text-blue-500', val:'text-blue-700' }}/>
          <KPITile icon={DollarSign} label="Cash Received"
            value={fmt(data?.received || 0)}
            sub="paid amount"
            color={{ bg:'bg-violet-50', icon:'text-violet-500', val:'text-violet-700' }}/>
        </div>
      )}
    </div>
  );
}
