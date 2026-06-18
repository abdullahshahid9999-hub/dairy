import { useState, useEffect } from 'react';
import { UserCheck, Plus, CreditCard, DollarSign, Users, AlertCircle, Pencil, UserX, UserCheck2, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import api from '../../api/client';
import { PageHeader, Modal, SkeletonRow, EmptyState, ConfirmDialog } from '../../components/ui';

const fmt = n => `Rs ${Number(n||0).toLocaleString('en-PK',{maximumFractionDigits:0})}`;

const DEPT_LABELS = {
  sales:'Sales', purchase:'Purchase'
};
const DEPT_PERMS = {
  sales:    ['sales','customers','products','dashboard'],
  purchase: ['milk','customers_view','dashboard'],
};
// What each portal type can see
const PORTAL_DESC = {
  sales:    { label:'Sales', color:'badge-green', icon:'🛒', access: ['Dashboard', 'Walk-in Sales', 'Customers', 'Products'] },
  purchase: { label:'Purchase', color:'badge-blue', icon:'🥛', access: ['Dashboard', 'Milk Collection (Supplier entry)', 'Supplier view'] },
};

const deptColor = { sales:'badge-green', purchase:'badge-blue' };

export default function HRPayroll() {
  const [tab, setTab]         = useState('employees');
  const [employees, setEmps]  = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null);
  const [selEmp, setSel]      = useState(null);
  const [saving, setSaving]   = useState(false);
  const [payMonth, setMonth]  = useState(format(new Date(),'yyyy-MM'));
  const [showPass, setShowPass] = useState(false);
  const [fireTarget, setFire] = useState(null);
  const [showFired, setShowFired] = useState(false);
  const [portalAccess, setPortalAccess] = useState(false);
  const [shops, setShops] = useState([]);

  const emptyForm = { name:'', phone:'', join_date:'', designation:'', department:'sales', base_salary:'', email:'', password:'', shop_id:'' };
  const [form, setForm]       = useState(emptyForm);
  const [advForm, setAdvForm] = useState({ amount:'', advance_date: new Date().toISOString().slice(0,10), notes:'' });
  const [hrTab, setHrTab]     = useState('advance');
  const [retForm, setRetForm] = useState({ amount:'', return_date: new Date().toISOString().slice(0,10), notes:'' });
  const [adjForm, setAdjForm] = useState({ type:'bonus', amount:'', apply_month: new Date().toISOString().slice(0,7), reason:'' });

  const runMigration = async () => {
    try {
      const r = await api.post('/hr/migrate');
      const failed = r.data.results.filter(x => !x.ok);
      if (failed.length === 0) toast.success('DB migration complete — all columns ready');
      else toast.error(`Migration: ${failed.length} steps failed — check console`);
      console.log('Migration results:', r.data.results);
      loadEmps();
    } catch (err) { toast.error('Migration failed: ' + (err.response?.data?.message || err.message)); }
  };

  const loadEmps = () => {
    setLoading(true);
    const endpoint = showFired ? '/hr/employees/all' : '/hr/employees';
    api.get(endpoint).then(r=>setEmps(r.data.data||[])).finally(()=>setLoading(false));
  };
  
  const loadPayroll = () => api.get(`/hr/payroll?month=${payMonth}`).then(r=>setPayroll(r.data.data||[]));

  useEffect(()=>{ loadEmps(); },[showFired]);
  useEffect(()=>{ if(tab==='payroll') loadPayroll(); },[tab,payMonth]);
  useEffect(()=>{ api.get('/shops?limit=100').then(r=>setShops(r.data.data||[])); },[]);

  const openEdit = (e) => {
    setSel(e);
    setForm({ name:e.name, phone:e.phone||'', join_date:e.join_date?.slice(0,10)||'', designation:e.designation||'',
      department:e.department||'sales', base_salary:e.base_salary, email:'', password:'',
      shop_id: e.shop_id ? String(e.shop_id) : '' });
    setPortalAccess(false);
    setModal('edit');
  };

  const onEmployee = async (ev) => {
    ev.preventDefault();
    if (!form.name || !form.base_salary) return toast.error('Name and salary required');
    if (form.department === 'sales' && !form.shop_id) return toast.error('Shop is required for Sales staff');
    setSaving(true);
    try {
      const payload = {
        ...form,
        shop_id: form.shop_id ? parseInt(form.shop_id, 10) : null,
        base_salary: parseFloat(form.base_salary),
        // Only send email/password if portal access is enabled
        email: portalAccess ? form.email : '',
        password: portalAccess ? form.password : '',
      };
      if (modal==='edit') {
        await api.put(`/hr/employees/${selEmp.id}`, payload);
        toast.success('Employee updated');
      } else {
        await api.post('/hr/employees', payload);
        toast.success('Employee added' + (form.email?' with login':''));
      }
      setModal(null); setForm(emptyForm); setPortalAccess(false); loadEmps();
    } catch (err) { toast.error(err.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  };

  const onAdvance = async (ev) => {
    ev.preventDefault();
    setSaving(true);
    try {
      await api.post(`/hr/employees/${selEmp.id}/advances`, advForm);
      toast.success('Advance recorded — auto-deducted in next payroll');
      setModal(null); setAdvForm({ amount:'', advance_date:new Date().toISOString().slice(0,10), notes:'' }); loadEmps();
    } catch (err) { toast.error(err.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  };

  const onReturn = async (ev) => {
    ev.preventDefault();
    setSaving(true);
    try {
      await api.post(`/hr/employees/${selEmp.id}/advance-return`, retForm);
      toast.success('Advance return recorded');
      setModal(null); setRetForm({ amount:'', return_date:new Date().toISOString().slice(0,10), notes:'' }); loadEmps();
    } catch (err) { toast.error(err.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  };

  const onAdjustment = async (ev) => {
    ev.preventDefault();
    if (!adjForm.amount) return toast.error('Amount required');
    setSaving(true);
    try {
      await api.post(`/hr/employees/${selEmp.id}/adjustment`, adjForm);
      toast.success(`${adjForm.type==='bonus'?'Bonus':'Deduction'} recorded for ${adjForm.apply_month}`);
      setModal(null); setAdjForm({ type:'bonus', amount:'', apply_month:new Date().toISOString().slice(0,7), reason:'' });
    } catch (err) { toast.error(err.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  };

  const fireEmp = async () => {
    try { await api.patch(`/hr/employees/${fireTarget.id}/fire`); toast.success('Employee deactivated'); loadEmps(); }
    catch { toast.error('Failed'); } finally { setFire(null); }
  };

  const activateEmp = async (e) => {
    try { await api.patch(`/hr/employees/${e.id}/activate`); toast.success('Employee reactivated'); loadEmps(); }
    catch { toast.error('Failed'); }
  };

  const processPayroll = async () => {
    setSaving(true);
    try {
      const r = await api.post('/hr/payroll/process', { payroll_month: payMonth });
      toast.success(r.data.message); loadPayroll();
    } catch (err) { toast.error(err.response?.data?.message||'Failed'); }
    finally { setSaving(false); }
  };

  const TABS = [{ id:'employees',label:'Employees',icon:Users },{ id:'payroll',label:'Payroll',icon:DollarSign }];

  return (
    <div className="space-y-6">
      <PageHeader title="HR & Payroll" subtitle="Team management with role-based access"
        action={<div className="flex gap-2"><button onClick={runMigration} className="btn-ghost text-xs text-slate-400 border border-slate-200 px-3 py-1.5 rounded-xl hover:text-slate-600">⚙ Fix DB</button><button onClick={()=>{ setModal('add'); setForm(emptyForm); }} className="btn-primary"><Plus size={16}/>Add Employee</button></div>}/>

      <div className="flex gap-1 bg-white border border-[#d1dce8] rounded-xl p-1 w-fit">
        {TABS.map(({id,label,icon:Icon})=>(
          <button key={id} onClick={()=>setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition
              ${tab===id?'bg-[#1d6faa] text-white':'text-slate-500 hover:text-slate-700'}`}>
            <Icon size={15}/>{label}
          </button>
        ))}
      </div>

      {tab==='employees' && (
        <>
          <div className="flex justify-end">
            <button onClick={()=>setShowFired(p=>!p)} className={`btn-ghost text-xs ${showFired?'text-red-500':''}`}>
              {showFired?'Hide Fired':'Show Fired Staff'}
            </button>
          </div>
          <div className="card p-0 overflow-hidden">
            <table className="table-auto w-full">
              <thead><tr><th>Code</th><th>Name</th><th>Department</th><th>Shop</th><th>Salary</th><th>Advance</th><th>Login</th><th>Actions</th></tr></thead>
              <tbody>
                {loading ? [...Array(5)].map((_,i)=><SkeletonRow key={i} cols={7}/>) :
                 employees.length===0 ? <tr><td colSpan={7}><EmptyState icon={UserCheck} title="No employees"/></td></tr> :
                 employees.map(e=>(
                  <tr key={e.id} className={!e.is_active?'opacity-50':''}>
                    <td><span className="font-mono text-xs text-[#1d6faa]">{e.emp_code}</span></td>
                    <td>
                      <div className="font-medium">{e.name}</div>
                      <div className="text-xs text-slate-400">{e.designation}</div>
                    </td>
                    <td><span className={`badge text-xs ${deptColor[e.department]||'badge-gray'}`}>{DEPT_LABELS[e.department]||e.department}</span></td>
                    <td><span className="text-xs text-slate-600">{e.shop_name || <span className="text-red-400">No shop</span>}</span></td>
                    <td><span className="font-mono text-emerald-600 font-semibold">{fmt(e.base_salary)}</span></td>
                    <td>{parseFloat(e.pending_advance)>0
                      ? <span className="text-amber-600 font-mono text-sm flex items-center gap-1"><AlertCircle size={12}/>{fmt(e.pending_advance)}</span>
                      : <span className="text-slate-400 text-xs">—</span>}</td>
                    <td>{e.user_id ? <span className="badge-green text-xs">✓ Active</span> : <span className="badge-gray text-xs">No Login</span>}</td>
                    <td>
                      <div className="flex gap-1.5">
                        {e.is_active ? <>
                          <button onClick={()=>openEdit(e)} className="btn-ghost p-1.5" title="Edit"><Pencil size={13}/></button>
                          <button onClick={()=>{ setSel(e); setModal('advance'); }} className="btn-ghost p-1.5" title="Advance"><CreditCard size={13}/></button>
                          <button onClick={()=>setFire(e)} className="btn-danger p-1.5" title="Fire"><UserX size={13}/></button>
                        </> : <>
                          <button onClick={()=>activateEmp(e)} className="btn-ghost p-1.5 text-emerald-600" title="Reactivate"><UserCheck2 size={13}/></button>
                        </>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab==='payroll' && (
        <div className="space-y-4">
          <div className="card flex flex-wrap items-end gap-4">
            <div><label className="label">Month</label>
              <input type="month" className="input w-44" value={payMonth} onChange={e=>setMonth(e.target.value)}/></div>
            <button onClick={processPayroll} disabled={saving} className="btn-primary">
              <CreditCard size={16}/>{saving?'Processing…':'Process Payroll'}
            </button>
            <p className="text-xs text-slate-400 self-end">Advances auto-deducted. Expense entry auto-created.</p>
          </div>
          <div className="card p-0 overflow-hidden">
            <table className="table-auto w-full">
              <thead><tr><th>Employee</th><th>Base</th><th>Allowances</th><th>Adv. Deduction</th><th>Net Pay</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {payroll.length===0
                  ? <tr><td colSpan={7}><EmptyState icon={DollarSign} title="No payroll" description={`Process for ${payMonth}`}/></td></tr>
                  : payroll.map(p=>(
                    <tr key={p.id}>
                      <td><div className="font-medium">{p.employee_name}</div><div className="text-xs text-slate-400 font-mono">{p.emp_code}</div></td>
                      <td className="font-mono">{fmt(p.base_salary)}</td>
                      <td className="font-mono text-emerald-600">{parseFloat(p.allowances)>0?fmt(p.allowances):'—'}</td>
                      <td className="font-mono text-red-500">{parseFloat(p.advance_deduction)>0?`-${fmt(p.advance_deduction)}`:'—'}</td>
                      <td className="font-mono font-bold text-emerald-600">{fmt(p.net_salary)}</td>
                      <td><span className={`badge ${p.status==='paid'?'badge-green':'badge-yellow'}`}>{p.status}</span></td>
                      <td>{p.status==='draft'&&<button onClick={async()=>{ await api.patch(`/hr/payroll/${p.id}/pay`); loadPayroll(); }} className="btn-ghost text-xs py-1 px-2">Pay</button>}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Employee Modal */}
      <Modal isOpen={modal==='add'||modal==='edit'} onClose={()=>{ setModal(null); setPortalAccess(false); setForm(emptyForm); }} title={modal==='edit'?`Edit: ${selEmp?.name}`:'Add Employee'} size="md">
        <form onSubmit={onEmployee} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="label">Full Name *</label>
              <input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} className="input" placeholder="Muhammad Ali"/></div>
            <div><label className="label">Phone</label>
              <input value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))} className="input"/></div>
            <div><label className="label">Join Date</label>
              <input type="date" value={form.join_date} onChange={e=>setForm(p=>({...p,join_date:e.target.value}))} className="input"/></div>
            <div><label className="label">Designation</label>
              <input value={form.designation} onChange={e=>setForm(p=>({...p,designation:e.target.value}))} className="input" placeholder="Driver, Accountant…"/></div>
            <div><label className="label">Base Salary (PKR) *</label>
              <input type="number" step="100" value={form.base_salary} onChange={e=>setForm(p=>({...p,base_salary:e.target.value}))} className="input font-mono" placeholder="25000"/></div>
            <div></div>
          </div>

          {/* Shop — only for Sales department */}
          {form.department === 'sales' && (
            <div>
              <label className="label">Assigned Shop <span className="text-red-400">*</span></label>
              <select value={form.shop_id} onChange={e=>setForm(p=>({...p,shop_id:e.target.value}))} className="input">
                <option value="">-- Select Shop --</option>
                {shops.filter(s=>s.is_active!==false).map(s=>(
                  <option key={s.id} value={String(s.id)}>{s.shop_name}{s.location ? ` — ${s.location}` : ''}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">Sales staff can only sell from their assigned shop</p>
            </div>
          )}

          {/* Department / Portal Type */}
          <div className="space-y-2">
            <label className="label">Portal Type *</label>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(PORTAL_DESC).map(([key, info]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, department: key, extra_permissions: [], shop_id: key === 'purchase' ? '' : p.shop_id }))}
                  className={`text-left border-2 rounded-xl p-4 transition ${
                    form.department === key
                      ? 'border-[#1d6faa] bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <p className="text-lg mb-1">{info.icon}</p>
                  <p className={`font-semibold text-sm ${form.department === key ? 'text-[#1d6faa]' : 'text-slate-700'}`}>
                    {info.label}
                  </p>
                  <ul className="mt-2 space-y-0.5">
                    {info.access.map(a => (
                      <li key={a} className="text-[11px] text-slate-500 flex items-center gap-1">
                        <span className="text-emerald-500">✓</span> {a}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
          </div>

          {/* Portal Access — explicit opt-in */}
          {modal==='add' && (
            <div className="border border-dashed border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Portal Access</p>
                  <p className="text-xs text-slate-400 mt-0.5">Give this employee login access to the system</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPortalAccess(p => !p);
                    if (!portalAccess) setForm(p => ({ ...p, email:'', password:'' }));
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${portalAccess ? 'bg-[#1d6faa]' : 'bg-slate-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${portalAccess ? 'translate-x-6' : 'translate-x-1'}`}/>
                </button>
              </div>

              {portalAccess && (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="label">Login Email *</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                      className="input"
                      placeholder="ali@brimi.com"
                      required={portalAccess}
                    />
                  </div>
                  <div>
                    <label className="label">Password *</label>
                    <div className="relative">
                      <input
                        type={showPass ? 'text' : 'password'}
                        value={form.password}
                        onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                        className="input pr-10"
                        placeholder="Min 8 characters"
                        required={portalAccess}
                        minLength={8}
                      />
                      <button type="button" onClick={() => setShowPass(p => !p)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                        {showPass ? <EyeOff size={15}/> : <Eye size={15}/>}
                      </button>
                    </div>
                  </div>
                  {/* Bulk deal access — only for sales staff */}
                  {form.department === 'sales' && (
                    <div className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl">
                      <div>
                        <p className="text-sm font-semibold text-slate-700">Bulk Deal Access</p>
                        <p className="text-xs text-slate-400 mt-0.5">Allow this employee to create bulk customer entries</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setForm(p => ({
                          ...p,
                          extra_permissions: p.extra_permissions?.includes('bulk_access')
                            ? p.extra_permissions.filter(x => x !== 'bulk_access')
                            : [...(p.extra_permissions||[]), 'bulk_access']
                        }))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${form.extra_permissions?.includes('bulk_access') ? 'bg-green-500' : 'bg-slate-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.extra_permissions?.includes('bulk_access') ? 'translate-x-6' : 'translate-x-1'}`}/>
                      </button>
                    </div>
                  )}
                  <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                    ⚠️ Employee will only see pages allowed for their portal type ({PORTAL_DESC[form.department]?.label}).
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={()=>{ setModal(null); setPortalAccess(false); setForm(emptyForm); }} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving?'Saving…':modal==='edit'?'Save Changes':'Add Employee'}</button>
          </div>
        </form>
      </Modal>

      {/* Advance Modal */}
      <Modal isOpen={modal==='advance'} onClose={()=>setModal(null)} title={`HR Actions — ${selEmp?.name}`} size="sm">
        <div className="space-y-4">
          <div className="flex gap-2 mb-2">
            {['advance','return','adjustment'].map(t=>(
              <button key={t} type="button" onClick={()=>setHrTab(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition ${hrTab===t?'bg-[#1d6faa] text-white':'bg-slate-100 text-slate-500'}`}>{t==='advance'?'Give Advance':t==='return'?'Return Advance':'Bonus/Deduction'}</button>
            ))}
          </div>
          <form onSubmit={hrTab==='advance'?onAdvance:hrTab==='return'?onReturn:onAdjustment} className="space-y-4">
            {hrTab==='advance' && <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
              <p className="font-semibold">Pending: {fmt(selEmp?.pending_advance)}</p>
              <p className="text-xs mt-1">Auto-deducted in next payroll run.</p>
            </div>}
            <div><label className="label">Amount (PKR) *</label>
              <input type="number" step="100" value={advForm.amount} onChange={e=>setAdvForm(p=>({...p,amount:e.target.value}))} className="input font-mono" placeholder="5000"/></div>
            <div><label className="label">Date</label>
              <input type="date" value={advForm.advance_date} onChange={e=>setAdvForm(p=>({...p,advance_date:e.target.value}))} className="input"/></div>
            <div><label className="label">Notes</label>
              <input value={advForm.notes} onChange={e=>setAdvForm(p=>({...p,notes:e.target.value}))} className="input"/></div>
            {hrTab==='return' && <>
              <div><label className="label">Return Amount (PKR)</label><input type="number" step="100" value={retForm.amount} onChange={e=>setRetForm(p=>({...p,amount:e.target.value}))} className="input font-mono"/></div>
              <div><label className="label">Date</label><input type="date" value={retForm.return_date} onChange={e=>setRetForm(p=>({...p,return_date:e.target.value}))} className="input"/></div>
              <div><label className="label">Notes</label><input value={retForm.notes} onChange={e=>setRetForm(p=>({...p,notes:e.target.value}))} className="input"/></div>
            </>}
            {hrTab==='adjustment' && <>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={()=>setAdjForm(p=>({...p,type:'bonus'}))}
                  className={`py-2 rounded-xl border-2 text-sm font-semibold transition ${adjForm.type==='bonus'?'border-emerald-500 bg-emerald-50 text-emerald-700':'border-slate-200 text-slate-500'}`}>Bonus ➕</button>
                <button type="button" onClick={()=>setAdjForm(p=>({...p,type:'deduction'}))}
                  className={`py-2 rounded-xl border-2 text-sm font-semibold transition ${adjForm.type==='deduction'?'border-red-500 bg-red-50 text-red-700':'border-slate-200 text-slate-500'}`}>Deduction ➖</button>
              </div>
              <div><label className="label">Amount (PKR)</label><input type="number" step="100" value={adjForm.amount} onChange={e=>setAdjForm(p=>({...p,amount:e.target.value}))} className="input font-mono"/></div>
              <div><label className="label">Apply Month</label><input type="month" value={adjForm.apply_month} onChange={e=>setAdjForm(p=>({...p,apply_month:e.target.value}))} className="input"/></div>
              <div><label className="label">Reason</label><input value={adjForm.reason} onChange={e=>setAdjForm(p=>({...p,reason:e.target.value}))} className="input"/></div>
            </>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={()=>setModal(null)} className="btn-ghost">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving?'…':hrTab==='advance'?'Record Advance':hrTab==='return'?'Record Return':'Save'}</button>
            </div>
          </form>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!fireTarget} onClose={()=>setFire(null)} onConfirm={fireEmp}
        title="Fire Employee" message={`Deactivate ${fireTarget?.name}? Their login will be disabled.`} danger/>
    </div>
  );
}
