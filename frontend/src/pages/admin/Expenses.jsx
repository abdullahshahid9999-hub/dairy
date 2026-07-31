import { useState, useEffect } from 'react';
import { Receipt, Plus, Trash2, TrendingDown } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/client';
import { PageHeader, Modal, EmptyState, ConfirmDialog } from '../../components/ui';

const fmt = n => `Rs ${Number(n||0).toLocaleString('en-PK',{maximumFractionDigits:0})}`;

const CATEGORY_COLORS = {
  'Diesel':'badge-yellow','Vehicle Service':'badge-blue','Shop Rent':'badge-gray',
  'Vehicle Rent':'badge-gray','Salaries':'badge-green','Advance Salary':'badge-yellow',
  'Utilities':'badge-blue','Miscellaneous':'badge-gray','Rent':'badge-gray',
};

export default function Expenses() {
  const [expenses, setExpenses]     = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [modal, setModal]           = useState(false);
  const [saving, setSaving]         = useState(false);
  const [delTarget, setDel]         = useState(null);
  const [filters, setFilters]       = useState({ category_id:'', date_from:'', date_to:'' });

  const today = new Date().toISOString().slice(0,10);
  const [form, setForm] = useState({
    category_id:'', expense_date: today,
    amount:'', description:'', reference_type:'', reference_id:''
  });

  const selectedCat  = categories.find(c=>String(c.id)===String(form.category_id));
  const catName      = selectedCat?.name?.toLowerCase()||'';
  const isDiesel     = catName.includes('diesel');

  const load = () => {
    setLoading(true);
    const q = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([,v])=>v)));
    Promise.all([
      api.get(`/expenses?${q}&limit=200`),
      api.get('/expenses/categories'),
    ]).then(([e,c])=>{
      setExpenses(e.data.data||[]);
      setCategories(c.data.data||[]);
    }).finally(()=>setLoading(false));
  };
  useEffect(()=>{ load(); },[]);

  const handleCatChange = (catId) => {
    setForm(p=>({ ...p, category_id:catId, reference_type:'', reference_id:'', description:'' }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.category_id || !form.expense_date || !form.amount) return toast.error('Fill required fields');
    setSaving(true);
    try {
      await api.post('/expenses', form);
      toast.success('Expense recorded');
      setModal(false);
      setForm({ category_id:'', expense_date:today, amount:'', description:'', reference_type:'', reference_id:'' });
      load();
    } catch(err){ toast.error(err.response?.data?.message||'Failed'); }
    finally{ setSaving(false); }
  };

  const deleteExp = async () => {
    try{ await api.delete(`/expenses/${delTarget.id}`); toast.success('Deleted'); load(); }
    catch{ toast.error('Failed'); } finally{ setDel(null); }
  };

  const totalShown  = expenses.reduce((s,e)=>s+parseFloat(e.amount||0),0);

  // Category totals for top cards (top 4)
  const catTotals = categories.slice(0,4);

  return (
    <div className="space-y-5">
      <PageHeader title="Expenses" subtitle="Track all business expenses"
        action={<button onClick={()=>setModal(true)} className="btn-primary"><Plus size={16}/>Add Expense</button>}/>

      {/* Category summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {catTotals.map(c=>(
          <div key={c.id} className="card">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500 truncate flex-1 mr-2">{c.name}</p>
              <span className={`badge text-xs ${CATEGORY_COLORS[c.name]||'badge-gray'}`}>{c.entry_count}</span>
            </div>
            <p className="font-bold text-lg text-red-500 font-mono">{fmt(c.total_spent)}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="card flex flex-wrap gap-3 items-end">
        <div><label className="label">Category</label>
          <select className="input" value={filters.category_id} onChange={e=>setFilters(p=>({...p,category_id:e.target.value}))}>
            <option value="">All Categories</option>
            {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
        <div><label className="label">From</label>
          <input type="date" className="input" value={filters.date_from} onChange={e=>setFilters(p=>({...p,date_from:e.target.value}))}/></div>
        <div><label className="label">To</label>
          <input type="date" className="input" value={filters.date_to} onChange={e=>setFilters(p=>({...p,date_to:e.target.value}))}/></div>
        <button onClick={load} className="btn-primary">Apply</button>
        <div className="ml-auto text-right">
          <p className="text-xs text-slate-400">Filtered Total</p>
          <p className="font-bold text-red-500 font-mono text-xl">{fmt(totalShown)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <table className="table-auto w-full">
          <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>By</th><th></th></tr></thead>
          <tbody>
            {loading ? [...Array(5)].map((_,i)=>(
              <tr key={i}><td colSpan={6} className="py-2"><div className="h-8 bg-slate-100 rounded mx-4 animate-pulse"/></td></tr>
            )) : expenses.length===0 ? (
              <tr><td colSpan={6}><EmptyState icon={TrendingDown} title="No expenses" description="Add your first expense"/></td></tr>
            ) : expenses.map(e=>(
              <tr key={e.id}>
                <td className="font-mono text-xs text-slate-500">{e.expense_date?.slice(0,10)}</td>
                <td><span className={`badge text-xs ${CATEGORY_COLORS[e.category_name]||'badge-gray'}`}>{e.category_name}</span></td>
                <td className="text-sm text-slate-500 max-w-xs truncate">{e.description||'—'}</td>
                <td><span className="font-mono text-red-500 font-semibold">{fmt(e.amount)}</span></td>
                <td className="text-xs text-slate-400">{e.created_by_name}</td>
                <td><button onClick={()=>setDel(e)} className="btn-danger p-1.5"><Trash2 size={13}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Modal */}
      <Modal isOpen={modal} onClose={()=>setModal(false)} title="Add Expense" size="sm">
        <form onSubmit={onSubmit} className="space-y-4">
          <div><label className="label">Category *</label>
            <select value={form.category_id} onChange={e=>handleCatChange(e.target.value)} className="input">
              <option value="">Select category…</option>
              {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Date *</label>
              <input type="date" value={form.expense_date}
                onChange={e=>setForm(p=>({...p,expense_date:e.target.value}))} className="input"/></div>
            <div><label className="label">Amount (PKR) *</label>
              <input type="number" step="0.01" value={form.amount}
                onChange={e=>setForm(p=>({...p,amount:e.target.value}))} className="input font-mono"/></div>
          </div>

          <div><label className="label">Description</label>
            <input value={form.description}
              onChange={e=>setForm(p=>({...p,description:e.target.value}))}
              className="input" placeholder="Optional details…"/></div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={()=>setModal(false)} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving?'Saving…':'Save Expense'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!delTarget} onClose={()=>setDel(null)} onConfirm={deleteExp}
        title="Delete Expense" message={`Delete ${delTarget?.category_name} of ${fmt(delTarget?.amount)}?`}/>
    </div>
  );
}
