import { useState, useEffect } from 'react';
import { TrendingUp, Milk, RefreshCw, ChevronDown } from 'lucide-react';
import api from '../../api/client';
import { PageHeader } from '../../components/ui';

const fmt  = n => `Rs ${Number(n||0).toLocaleString('en-PK',{maximumFractionDigits:0})}`;
const fmtL = n => `${Number(n||0).toFixed(1)}L`;
const PERIODS = [
  { label:'Today',   value:'1d'  },
  { label:'1 Week',  value:'7d'  },
  { label:'1 Month', value:'1m'  },
  { label:'6 Months',value:'6m'  },
  { label:'1 Year',  value:'1y'  },
];

function dateRange(period) {
  const now = new Date();
  const fmt = d => d.toISOString().slice(0,10);
  const end = fmt(now);
  if (period === '1d')  return { from: end, to: end };
  if (period === '7d')  return { from: fmt(new Date(now - 6*864e5)), to: end };
  if (period === '1m')  return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: end };
  if (period === '6m')  return { from: fmt(new Date(now.getFullYear(), now.getMonth()-5, 1)), to: end };
  if (period === '1y')  return { from: fmt(new Date(now.getFullYear()-1, now.getMonth(), 1)), to: end };
  return { from: end, to: end };
}

export default function Activity() {
  const [period, setPeriod]       = useState('1d');
  const [sales, setSales]         = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading]     = useState(false);

  const load = async (p) => {
    setLoading(true);
    const { from, to } = dateRange(p);
    try {
      const [s, pr] = await Promise.all([
        api.get(`/customers/receipts?date_from=${from}&date_to=${to}&limit=200`),
        api.get(`/milk?date_from=${from}&date_to=${to}&limit=200`),
      ]);
      // Also fetch bulk_ledger entries for sales
      const bl = await api.get(`/customers?limit=1`).catch(() => null); // just to warm cache
      setSales(s.data.data || []);
      setPurchases(pr.data.data || []);
    } catch { setSales([]); setPurchases([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(period); }, [period]);

  const totalSaleAmt  = sales.reduce((s,r) => s + parseFloat(r.total_amount||0), 0);
  const totalPurchAmt = purchases.reduce((s,r) => s + parseFloat(r.total_amount||0), 0);
  const totalSaleL    = sales.reduce((s,r) => s + parseFloat(r.milk_qty||0), 0);
  const totalPurchL   = purchases.reduce((s,r) => s + parseFloat(r.quantity_liters||0), 0);

  return (
    <div className="space-y-5">
      <PageHeader title="Recent Activity" subtitle="Sales and purchase records side by side"/>

      {/* Period selector */}
      <div className="flex gap-2 flex-wrap">
        {PERIODS.map(p => (
          <button key={p.value} onClick={() => setPeriod(p.value)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition
              ${period === p.value
                ? 'bg-[#1d6faa] text-white border-[#1d6faa]'
                : 'bg-white border-slate-200 text-slate-500 hover:border-[#1d6faa]'}`}>
            {p.label}
          </button>
        ))}
        {loading && <RefreshCw size={16} className="animate-spin text-slate-400 self-center ml-2"/>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* SALES */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center">
                <TrendingUp size={15} className="text-emerald-600"/>
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">Sales</p>
                <p className="text-xs text-slate-400">{sales.length} receipts · {fmtL(totalSaleL)} · {fmt(totalSaleAmt)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {sales.length === 0
              ? <p className="text-center text-slate-400 text-sm py-10">No sales in this period</p>
              : <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 text-xs text-slate-400 uppercase">
                    <th className="px-4 py-2.5 text-left">Date</th>
                    <th className="px-4 py-2.5 text-left">Receipt</th>
                    <th className="px-4 py-2.5 text-right">Qty</th>
                    <th className="px-4 py-2.5 text-right">Amount</th>
                    <th className="px-4 py-2.5 text-center">Status</th>
                  </tr></thead>
                  <tbody>
                    {sales.map((r,i) => (
                      <tr key={r.id} className={i%2===0?'':'bg-slate-50/40'}>
                        <td className="px-4 py-2.5 text-xs text-slate-500">{r.receipt_date}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-[#1d6faa]">{r.receipt_no}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">{fmtL(r.milk_qty)}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-emerald-600">{fmt(r.total_amount)}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
                            ${r.status==='paid'?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}`}>
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            }
          </div>
        </div>

        {/* PURCHASES */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center">
                <Milk size={15} className="text-blue-600"/>
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">Purchases</p>
                <p className="text-xs text-slate-400">{purchases.length} records · {fmtL(totalPurchL)} · {fmt(totalPurchAmt)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {purchases.length === 0
              ? <p className="text-center text-slate-400 text-sm py-10">No purchases in this period</p>
              : <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 text-xs text-slate-400 uppercase">
                    <th className="px-4 py-2.5 text-left">Date</th>
                    <th className="px-4 py-2.5 text-left">Farmer</th>
                    <th className="px-4 py-2.5 text-right">Qty</th>
                    <th className="px-4 py-2.5 text-right">Fat%</th>
                    <th className="px-4 py-2.5 text-right">Amount</th>
                  </tr></thead>
                  <tbody>
                    {purchases.map((r,i) => (
                      <tr key={r.id} className={i%2===0?'':'bg-slate-50/40'}>
                        <td className="px-4 py-2.5 text-xs text-slate-500">{r.collection_date}</td>
                        <td className="px-4 py-2.5 text-xs font-medium text-slate-700">{r.farmer_name || r.centre_name || '—'}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">{fmtL(r.quantity_liters)}</td>
                        <td className="px-4 py-2.5 text-right text-xs text-slate-500">{parseFloat(r.fat_percentage||0).toFixed(2)}%</td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-blue-600">{fmt(r.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            }
          </div>
        </div>
      </div>
    </div>
  );
}
