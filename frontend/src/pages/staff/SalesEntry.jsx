import { useState, useEffect } from 'react';
import { ShoppingBag, Printer, Milk, Store, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/client';
import useAuthStore from '../../store/authStore';

const fmt = n => `Rs ${Number(n||0).toLocaleString('en-PK',{maximumFractionDigits:0})}`;

export default function SalesEntry() {
  const { user } = useAuthStore();
  const [shopStock,  setShopStock]  = useState(null);
  const [milkRate,   setMilkRate]   = useState('');
  const [milkQty,    setMilkQty]    = useState('');
  const [saving,     setSaving]     = useState(false);
  const [receipt,    setReceipt]    = useState(null);

  const shopId = user?.shop_id ? String(user.shop_id) : null;

  useEffect(() => {
    if (shopId) {
      api.get(`/shops/${shopId}/stock`)
        .then(r => setShopStock(r.data.available ?? null))
        .catch(() => setShopStock(null));
    }
  }, []);

  const milkAmount = parseFloat(milkQty || 0) * parseFloat(milkRate || 0);
  const total       = milkAmount;

  const onSale = async () => {
    if (total <= 0) return toast.error('Enter milk quantity and rate');
    const milkQtyNum = parseFloat(milkQty) || 0;
    if (milkQtyNum > 0 && shopStock !== null && milkQtyNum > shopStock) {
      return toast.error(`Only ${shopStock.toFixed(1)}L available in shop`);
    }
    setSaving(true);
    try {
      const r = await api.post('/customers/sale', {
        customer_type: 'walkin',
        milk_qty:  milkQtyNum || 0,
        milk_rate: milkRate || 0,
        sale_date: new Date().toISOString().slice(0, 10),
        shop_id:   shopId || null,
      });
      const rec = r.data.data;
      setReceipt({ no: rec.receipt_no, date: new Date().toLocaleDateString('en-PK'), milkQty, milkRate, milkAmount, total });
      setMilkQty(''); setMilkRate('');
      // Refresh stock
      if (shopId) {
        api.get(`/shops/${shopId}/stock`).then(r => setShopStock(r.data.available ?? null)).catch(() => {});
      }
      toast.success(`Receipt: ${rec.receipt_no}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Sale failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Shop + stock banner */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
            <Store size={16} className="text-emerald-600"/>
          </div>
          <div>
            <p className="font-semibold text-slate-800 text-sm">{user?.shop_name || 'No shop assigned'}</p>
            <p className="text-xs text-slate-400">Your assigned shop</p>
          </div>
        </div>
        {shopStock !== null && (
          <span className={`text-xs font-bold px-3 py-1.5 rounded-xl ${shopStock < 5 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'}`}>
            {shopStock < 5 && <AlertTriangle size={11} className="inline mr-1"/>}
            {shopStock.toFixed(1)}L available
          </span>
        )}
      </div>

      {!shopId && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-600 flex items-center gap-2">
          <AlertTriangle size={16}/> No shop assigned to your account. Contact admin.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: milk */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center"><Milk size={16} className="text-blue-600"/></div>
              <p className="font-semibold text-slate-700">Milk Sale</p>
              {shopStock !== null && shopStock <= 0 && (
                <span className="ml-auto text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-lg">Out of stock</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Qty (L)</label>
                <input type="number" step="0.1" value={milkQty} onChange={e => setMilkQty(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 font-mono text-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="0" disabled={shopStock !== null && shopStock <= 0}/>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Rate/L (Rs)</label>
                <input type="number" step="0.01" value={milkRate} onChange={e => setMilkRate(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 font-mono text-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="0"/>
              </div>
            </div>
            {milkAmount > 0 && (
              <div className="mt-3 bg-blue-50 rounded-xl px-3 py-2 text-sm font-semibold text-blue-700">
                Milk total: {fmt(milkAmount)}
              </div>
            )}
          </div>
        </div>

        {/* Right: Bill summary */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4 h-fit sticky top-4">
          <p className="font-semibold text-slate-700 text-base">Current Bill</p>

          <div className="space-y-2 min-h-[120px]">
            {parseFloat(milkQty) > 0 && parseFloat(milkRate) > 0 ? (
              <div className="flex items-center justify-between bg-blue-50 rounded-xl px-4 py-3">
                <div>
                  <p className="font-medium text-sm">Milk</p>
                  <p className="text-xs text-slate-400">{milkQty}L × {fmt(milkRate)}/L</p>
                </div>
                <span className="font-mono font-bold text-blue-700">{fmt(milkAmount)}</span>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-300">
                <ShoppingBag size={32} className="mx-auto mb-2"/>
                <p className="text-sm">Enter milk quantity and rate</p>
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 pt-4 space-y-2">
            {milkAmount > 0 && <div className="flex justify-between text-sm"><span className="text-slate-500">Milk</span><span className="font-mono">{fmt(milkAmount)}</span></div>}
            <div className="flex justify-between font-bold text-xl border-t border-slate-200 pt-3">
              <span>Total</span>
              <span className="font-mono text-blue-700">{fmt(total)}</span>
            </div>
          </div>

          <button onClick={onSale} disabled={saving || total === 0 || !shopId}
            className="w-full py-3 rounded-2xl text-white font-semibold text-base flex items-center justify-center gap-2 transition"
            style={{ background: saving || total === 0 || !shopId ? '#94a3b8' : '#1b6ca8' }}>
            {saving ? 'Processing…' : <><Printer size={16}/>Complete Sale & Print Receipt</>}
          </button>
          <p className="text-xs text-slate-400 text-center">Cash payment only</p>
        </div>
      </div>

      {/* Print receipt */}
      {receipt && (
        <div id="receipt-print" className="hidden">
          <div style={{ fontFamily:'monospace', fontSize:12, padding:16, maxWidth:280 }}>
            <p style={{ textAlign:'center', fontWeight:'bold', fontSize:16 }}>Brimi Dairy</p>
            <p style={{ textAlign:'center', fontSize:11, color:'#888' }}>{user?.shop_name}</p>
            <p style={{ textAlign:'center', fontSize:10 }}>#{receipt.no} · {receipt.date}</p>
            <hr style={{ margin:'8px 0', border:'none', borderTop:'1px dashed #ccc' }}/>
            {parseFloat(receipt.milkQty) > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span>Milk {receipt.milkQty}L</span><span>{fmt(receipt.milkAmount)}</span>
              </div>
            )}
            <hr style={{ margin:'8px 0', border:'none', borderTop:'1px dashed #ccc' }}/>
            <div style={{ display:'flex', justifyContent:'space-between', fontWeight:'bold', fontSize:14 }}>
              <span>TOTAL</span><span>{fmt(receipt.total)}</span>
            </div>
            <p style={{ textAlign:'center', fontSize:10, marginTop:12, color:'#888' }}>Thank you!</p>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          body > * { display: none !important; }
          #receipt-print { display: block !important; }
        }
      `}</style>
    </div>
  );
}
