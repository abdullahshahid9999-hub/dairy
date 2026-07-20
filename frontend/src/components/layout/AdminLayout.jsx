import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard, Users, Milk, Package, UserCheck2, FileText, TrendingUp, ShoppingBag,
  Truck, Store, UserCheck, Receipt, BarChart3, Shield, LogOut, Menu, X,
  Settings, ChevronDown, ChevronRight, DollarSign, Building2,
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import api from '../../api/client';
import toast from 'react-hot-toast';

const NAV_GROUPS=[
  {label:null,items:[{to:'dashboard',icon:LayoutDashboard,label:'Dashboard'}]},
  {label:'Purchase',items:[{to:'farmers',icon:Users,label:'Collection Centre'},{to:'milk',icon:Milk,label:'Milk Collection'}]},
  {label:'Sales',items:[{to:'customers',icon:UserCheck,label:'Customers'},{to:'bulk-sales',icon:Building2,label:'Bulk Sales Portal'},{to:'invoices',icon:FileText,label:'Invoices'},{to:'billing',icon:Receipt,label:'Billing'}]},
  {label:'Resources',items:[{to:'shops',icon:Store,label:'Shops'},{to:'hr',icon:UserCheck2,label:'HR & Payroll'}]},
  {label:'Expenses',items:[{to:'expenses',icon:DollarSign,label:'Expenses'}]},
  {label:'Reports',adminOnly:true,items:[{to:'reports',icon:BarChart3,label:'Reports'}]},
  {label:null,items:[{to:'settings',icon:Settings,label:'Settings'}]},
];

export default function AdminLayout() {
  const [mobileOpen,setMobileOpen]=useState(false); const [collapsed,setCollapsed]=useState({});
  const [logoUrl,setLogoUrl]=useState(''); const [appName,setAppName]=useState('Brimi Dairy');
  const {user,logout}=useAuthStore(); const navigate=useNavigate(); const location=useLocation();

  useEffect(()=>{
    const fetch=()=>api.get('/settings').then(({data})=>{if(data.settings?.logo_url)setLogoUrl(data.settings.logo_url);if(data.settings?.app_name)setAppName(data.settings.app_name);}).catch(()=>{});
    fetch();
    window.addEventListener('logo-updated',fetch);
    return ()=>window.removeEventListener('logo-updated',fetch);
  },[]);
  useEffect(()=>{setMobileOpen(false);},[location.pathname]);

  const handleLogout=async()=>{await logout();toast.success('Logged out');navigate('/login');};

  const SidebarContent=()=>(
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 h-16 border-b border-white/10 flex-shrink-0">
        {logoUrl?<img src={logoUrl} alt="logo" className="w-8 h-8 rounded-lg object-contain flex-shrink-0" style={{background:'rgba(255,255,255,0.1)',padding:2}}/>
          :<div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-sm flex-shrink-0" style={{background:'rgba(255,255,255,0.15)'}}>{appName[0]}</div>}
        <div className="min-w-0"><p className="text-white font-bold text-sm truncate">{appName}</p><p className="text-blue-300/70 text-xs">Management</p></div>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-2 scrollbar-thin">
        {NAV_GROUPS.filter(g=>!g.adminOnly||user?.role==='admin').map((group,gi)=>(
          <div key={gi} className={gi>0?'mt-1':''}>
            {group.label&&(
              <button onClick={()=>setCollapsed(p=>({...p,[group.label]:!p[group.label]}))}
                className="w-full flex items-center justify-between px-2 py-1.5 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-300/50">{group.label}</span>
                {collapsed[group.label]?<ChevronRight size={10} className="text-blue-300/40"/>:<ChevronDown size={10} className="text-blue-300/40"/>}
              </button>
            )}
            {!collapsed[group.label]&&group.items.map(({to,icon:Icon,label})=>(
              <NavLink key={to} to={to} className={({isActive})=>`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${isActive?'bg-white/15 text-white':'text-blue-100/70 hover:bg-white/8 hover:text-white'}`}>
                <Icon size={16} className="flex-shrink-0"/><span className="truncate">{label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3 flex-shrink-0">
        <div className="flex items-center gap-2.5 px-2 py-1.5 mb-1">
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{user?.name?.[0]?.toUpperCase()||'A'}</div>
          <div className="min-w-0"><p className="text-white text-xs font-semibold truncate">{user?.name}</p><p className="text-blue-300/60 text-[10px] truncate">{user?.role}</p></div>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium text-red-300 hover:bg-red-500/15 transition">
          <LogOut size={15}/>Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{background:'#f0f4f8'}}>
      <aside className="hidden lg:flex flex-col w-56 flex-shrink-0" style={{background:'linear-gradient(180deg,#0d2137 0%,#0f2d4a 100%)'}}>
        <SidebarContent/>
      </aside>
      {mobileOpen&&(
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={()=>setMobileOpen(false)}/>
          <aside className="relative z-50 flex flex-col w-64 h-full" style={{background:'linear-gradient(180deg,#0d2137 0%,#0f2d4a 100%)'}}>
            <SidebarContent/>
          </aside>
        </div>
      )}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="lg:hidden flex items-center justify-between h-14 px-4 bg-white border-b border-slate-200 flex-shrink-0">
          <button onClick={()=>setMobileOpen(true)} className="text-slate-600 p-1"><Menu size={22}/></button>
          <div className="flex items-center gap-2">
            {logoUrl?<img src={logoUrl} alt="logo" className="h-7 w-7 object-contain rounded-lg"/>
              :<div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{background:'#1b6ca8'}}>{appName[0]}</div>}
            <span className="font-bold text-slate-800 text-sm">{appName}</span>
          </div>
          <div className="w-8"/>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6"><Outlet/></main>
      </div>
    </div>
  );
}
