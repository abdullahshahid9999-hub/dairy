import { useState, useEffect } from 'react';
import { ShoppingBag, Printer, Milk, Store, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/client';
import { PageHeader } from '../../components/ui';
import useAuthStore from '../../store/authStore';

const fmt = n => `Rs ${Number(n||0).toLocaleString('en-PK',{maximumFractionDigits:0})}`;

export default function WalkIn() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const [shops, setShops]       = useState([]);
  const [shopId, setShopId]     = useState('');
  const [shopStock, setShopStock] = useState(null); // available liters in selected shop
  const [milkRate, setMilkRate] = useState('');
  const [milkQty, setMilkQty]   = useState('');
  const [saving, setSaving]     = useState(false);
  const [receipt, setReceipt]   = useState(null);

  useEffect(()=>{
    if (isAdmin) {
      api.get('/shops').then(r=>setShops(r.data.data||[]));
    } else if (user?.shop_id) {
      setShopId(String(user.shop_id));
    }
  },[]);

  // Load shop stock whenever shop changes
  useEffect(()=>{
    if (!shopId) { setShopStock(null); return; }
    api.get(`/shops/${shopId}/stock`).then(r=>setShopStock(r.data.available ?? null)).catch(()=>setShopStock(null));
  },[shopId]);

  const milkAmount = parseFloat(milkQty||0)*parseFloat(milkRate||0);
  const total       = milkAmount;

  const onSale = async () => {
    if(total<=0) return toast.error('Enter milk quantity and rate');
    const milkQtyNum = parseFloat(milkQty) || 0;
    if (milkQtyNum > 0 && shopStock !== null && milkQtyNum > shopStock) {
      return toast.error(`Only ${shopStock.toFixed(1)}L available in this shop`);
    }
    setSaving(true);
    try {
      const r = await api.post('/customers/sale',{
        customer_type:'walkin',
        milk_qty: milkQtyNum||0,
        milk_rate: milkRate||0,
        sale_date: new Date().toISOString().slice(0,10),
        shop_id: shopId || null,
      });
      const rec = r.data.data;
      setReceipt({ no:rec.receipt_no, date:new Date().toLocaleDateString('en-PK'), milkQty, milkRate, milkAmount, total });
      setMilkQty(''); setMilkRate('');
      // Refresh shop stock after sale
      if (shopId) {
        api.get(`/shops/${shopId}/stock`).then(r=>setShopStock(r.data.available ?? null)).catch(()=>{});
      }
      toast.success(`Receipt: ${rec.receipt_no}`);
    } catch(err){ toast.error(err.response?.data?.message||'Failed'); }
    finally{ setSaving(false); }
  };

  const printReceipt = () => window.print();

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <PageHeader title="Walk-in Sale" subtitle="Immediate cash sale — no customer details required"/>

      {/* Shop selector */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center"><Store size={16} className="text-emerald-600"/></div>
          <p className="font-semibold text-slate-700">Select Shop</p>
          {shopStock !== null && (
            <span className={`ml-auto text-xs font-semibold px-2 py-1 rounded-lg ${shopStock < 5 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'}`}>
              {shopStock < 5 && <AlertTriangle size={11} className="inline mr-1"/>}
              Stock: {shopStock.toFixed(1)}L
            </span>
          )}
        </div>
        <select value={shopId} onChange={e=>setShopId(e.target.value)} className="input">
          <option value="">-- No Shop / General --</option>
          {shops.filter(s=>s.is_active).map(s=>(
            <option key={s.id} value={s.id}>{s.shop_name}{s.location ? ` — ${s.location}` : ''}</option>
          ))}
        </select>
        {!isAdmin && user?.shop_name && (
          <div className="mt-2 flex items-center gap-2 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <Store size={14} className="text-emerald-500"/>
            <span className="font-medium">{user.shop_name}</span>
            <span className="text-xs text-slate-400">(your assigned shop)</span>
          </div>
        )}
        {shopId && shopStock !== null && shopStock <= 0 && (
          <p className="mt-2 text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={12}/>No milk in stock for this shop. Cannot sell milk.</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Left: Milk */}
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center"><Milk size={16} className="text-[#1d6faa]"/></div>
              <p className="font-semibold text-slate-700">Milk</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Quantity (L)</label>
                <input type="number" step="0.1" value={milkQty} onChange={e=>setMilkQty(e.target.value)}
                  className="input font-mono text-lg" placeholder="0"/>
              </div>
              <div>
                <label className="label">Rate/L (PKR)</label>
                <input type="number" step="0.01" value={milkRate} onChange={e=>setMilkRate(e.target.value)}
                  className="input font-mono text-lg" placeholder="0"/>
              </div>
            </div>
            {milkAmount>0 && <div className="mt-3 bg-blue-50 rounded-lg px-3 py-2 text-sm font-semibold text-[#1d6faa]">Milk: {fmt(milkAmount)}</div>}
          </div>
        </div>

        {/* Right: Bill */}
        <div className="card space-y-4 h-fit sticky top-4">
          <p className="font-semibold text-slate-700 text-base">Current Bill</p>

          <div className="space-y-2 min-h-[120px]">
            {milkQty>0 && milkRate>0 ? (
              <div className="flex items-center justify-between bg-blue-50 rounded-xl px-4 py-3">
                <div>
                  <p className="font-medium text-sm">Milk</p>
                  <p className="text-xs text-slate-400">{milkQty}L × {fmt(milkRate)}/L</p>
                </div>
                <span className="font-mono font-bold text-[#1d6faa]">{fmt(milkAmount)}</span>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-300"><ShoppingBag size={32} className="mx-auto mb-2"/><p className="text-sm">Enter milk quantity and rate</p></div>
            )}
          </div>

          <div className="border-t border-slate-200 pt-4 space-y-2">
            {milkAmount>0 && <div className="flex justify-between text-sm"><span className="text-slate-500">Milk</span><span className="font-mono">{fmt(milkAmount)}</span></div>}
            <div className="flex justify-between font-bold text-xl border-t border-slate-200 pt-3">
              <span>Total</span>
              <span className="font-mono text-[#1d6faa]">{fmt(total)}</span>
            </div>
          </div>

          <button onClick={onSale} disabled={saving||total===0}
            className="btn-primary w-full py-3 text-base">
            {saving?'Processing…':<><Printer size={16}/>Complete Sale & Print Receipt</>}
          </button>

          <p className="text-xs text-slate-400 text-center">Cash payment only · No credit</p>
        </div>
      </div>

      {/* Receipt print area */}
      {receipt && (
        <div id="receipt-print" className="hidden">
          <div style={{ fontFamily:'monospace', fontSize:12, padding:16, maxWidth:280 }}>
            <p style={{ textAlign:'center', fontWeight:'bold', fontSize:16 }}>Brimi Dairy</p>
            <p style={{ textAlign:'center', fontSize:11, color:'#888' }}>Walk-in Receipt</p>
            <p style={{ textAlign:'center', fontSize:10 }}>#{receipt.no} · {receipt.date}</p>
            <hr style={{ margin:'8px 0', border:'none', borderTop:'1px dashed #ccc' }}/>
            {parseFloat(receipt.milkQty)>0 && (
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
