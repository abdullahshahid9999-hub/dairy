import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { Users, Plus, Edit2, PowerOff, MapPin, Percent, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/client';
import { PageHeader, Modal, EmptyState, SkeletonRow, ConfirmDialog } from '../../components/ui';

const fmt = n => `Rs ${Number(n||0).toLocaleString('en-PK',{maximumFractionDigits:0})}`;

export default function Farmers() {
  const [farmers,setFarmers]=useState([]); const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState(''); const [modal,setModal]=useState(null);
  const [editing,setEditing]=useState(null); const [deactTarget,setDeact]=useState(null);
  const [saving,setSaving]=useState(false);
  const {register,handleSubmit,reset}=useForm();

  const load=useCallback(()=>{
    setLoading(true);
    api.get(`/farmers?search=${encodeURIComponent(search)}`).then(r=>setFarmers(r.data.data||[])).finally(()=>setLoading(false));
  },[search]);
  useEffect(()=>{load();},[load]);

  const openAdd=()=>{setEditing(null);reset({});setModal('form');};
  const openEdit=(f)=>{setEditing(f);reset({name:f.name,phone:f.phone||'',address:f.address||'',id_card:f.id_card||'',bank_account:f.bank_account||'',base_rate:f.base_rate||''});setModal('form');};

  const onSubmit=async(data)=>{
    setSaving(true);
    try{if(editing)await api.put(`/farmers/${editing.id}`,data);else await api.post('/farmers',data);toast.success(editing?'Updated':'Added');setModal(null);load();}
    catch(err){toast.error(err.response?.data?.message||'Failed');}finally{setSaving(false);}
  };
  const deactivate=async()=>{try{await api.patch(`/farmers/${deactTarget.id}/deactivate`);toast.success('Deactivated');load();}catch{toast.error('Failed');}finally{setDeact(null);}};

  return (
    <div className="space-y-5">
      <PageHeader title="Collection Centre" subtitle="Manage milk suppliers and dynamic pricing"
        action={<button onClick={openAdd} className="btn-primary"><Plus size={16}/>Add Farmer</button>}/>
      <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" className="input pl-9"/></div>
      <div className="card p-0 overflow-hidden">
        <table className="table-auto w-full">
          <thead><tr><th>Code</th><th>Name</th><th>Phone</th><th>Base Rate</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {loading?[...Array(5)].map((_,i)=><SkeletonRow key={i} cols={6}/>):
             farmers.length===0?<tr><td colSpan={6}><EmptyState icon={Users} title="No farmers" description="Add your first supplier"/></td></tr>:
             farmers.map(f=>(
              <tr key={f.id} className={!f.is_active?'opacity-50':''}>
                <td><span className="font-mono text-xs text-[#1d6faa] font-semibold">{f.farmer_code}</span></td>
                <td><div className="font-medium">{f.name}</div>{f.address&&<div className="text-xs text-slate-400 flex items-center gap-1"><MapPin size={10}/>{f.address}</div>}</td>
                <td className="text-sm text-slate-500">{f.phone||'—'}</td>
                <td><span className="font-mono font-semibold text-emerald-600">{fmt(f.base_rate)}/L</span></td>
                <td>{f.is_active?<span className="badge-green text-xs">Active</span>:<span className="badge-red text-xs">Inactive</span>}</td>
                <td><div className="flex gap-1.5">
                  <button onClick={()=>openEdit(f)} className="btn-ghost p-1.5"><Edit2 size={13}/></button>
                  {f.is_active&&<button onClick={()=>setDeact(f)} className="btn-danger p-1.5"><PowerOff size={13}/></button>}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal isOpen={modal==='form'} onClose={()=>setModal(null)} title={editing?`Edit: ${editing.name}`:'Add Farmer'} size="md">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="label">Name *</label><input {...register('name',{required:true})} className="input"/></div>
            <div><label className="label">Phone</label><input {...register('phone')} className="input"/></div>
            <div><label className="label">CNIC</label><input {...register('id_card')} className="input"/></div>
            <div className="col-span-2"><label className="label">Address</label><input {...register('address')} className="input"/></div>
            <div className="col-span-2"><label className="label">Bank Account</label><input {...register('bank_account')} className="input"/></div>
          </div>
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-600 flex items-center gap-2"><Percent size={14}/>Pricing</p>
            <div><label className="label">Base Rate (PKR/L) *</label><input type="number" step="0.01" {...register('base_rate',{required:true})} className="input font-mono"/></div>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={()=>setModal(null)} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving?'Saving…':editing?'Update':'Add'}</button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog isOpen={!!deactTarget} onClose={()=>setDeact(null)} onConfirm={deactivate} title="Deactivate" message={`Remove ${deactTarget?.name}?`}/>
    </div>
  );
}
