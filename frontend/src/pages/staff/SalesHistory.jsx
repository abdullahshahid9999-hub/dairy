import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { History, Milk, Package } from 'lucide-react';
import api from '../../api/client';
import useAuthStore from '../../store/authStore';

const fmt = n => `Rs ${Number(n||0).toLocaleString('en-PK',{maximumFractionDigits:0})}`;

export default function SalesHistory() {
  const { user } = useAuthStore();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(format(new Date(), 'yyyy-MM-01'));
  const [dateTo,   setDateTo]   = useState(format(new Date(), 'yyyy-MM-dd'));

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, limit: 200 });
    if (user?.shop_id) params.append('shop_id', user.shop_id);
    api.get(`/customers/receipts?${params}`)
      .then(r => setRecords(r.data.data || []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [dateFrom, dateTo]);

  const totalRevenue = records.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0);
  const totalMilk    = records.reduce((s, r) => s + parseFloat(r.milk_qty || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
          <History size={18} className="text-blue-600"/>
        </div>
        <div>
          <p className="font-bold text-slate-800">Sales History</p>
          <p className="text-xs text-slate-400">{user?.shop_name}</p>
        </div>
      </div>

      {/* Date filters */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-500 mb-1 block">From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"/>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"/>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Total Revenue</p>
          <p className="text-xl font-bold font-mono text-emerald-700">{fmt(totalRevenue)}</p>
          <p className="text-xs text-slate-400 mt-1">{records.length} receipts</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Milk Sold</p>
          <p className="text-xl font-bold font-mono text-blue-700">{totalMilk.toFixed(1)} L</p>
          <p className="text-xs text-slate-400 mt-1">this period</p>
        </div>
      </div>

      {/* Records */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl h-20 animate-pulse border border-slate-100"/>)}
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-slate-400">
          <History size={32} className="mx-auto mb-2 opacity-30"/>
          <p className="text-sm">No sales in this period</p>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map(r => (
            <div key={r.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs text-slate-400">{r.receipt_no}</span>
                <span className="font-bold font-mono text-emerald-700">{fmt(r.total_amount)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{format(new Date(r.receipt_date), 'd MMM yyyy')}</span>
                <div className="flex items-center gap-3">
                  {parseFloat(r.milk_qty) > 0 && (
                    <span className="flex items-center gap-1"><Milk size={11}/>{parseFloat(r.milk_qty).toFixed(1)}L</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
