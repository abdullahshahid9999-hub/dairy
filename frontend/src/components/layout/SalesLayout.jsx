import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ShoppingBag, LayoutDashboard, LogOut, Menu, X, History, Store } from 'lucide-react';
import useAuthStore from '../../store/authStore';
import api from '../../api/client';
import toast from 'react-hot-toast';

export default function SalesLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [logo,    setLogo]    = useState('');
  const [appName, setAppName] = useState('Brimi Dairy');
  const [open,    setOpen]    = useState(false);

  useEffect(() => {
    api.get('/settings')
      .then(({ data }) => {
        if (data.settings?.logo_url) setLogo(data.settings.logo_url);
        if (data.settings?.app_name) setAppName(data.settings.app_name);
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out');
    navigate('/login');
  };

  const NAV = [
    { to: '/sales',         icon: LayoutDashboard, label: 'Dashboard', end: true },
    { to: '/sales/history', icon: History,         label: 'History',   end: true },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f0f4f8' }}>
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          {logo
            ? <img src={logo} alt="logo" className="h-8 w-8 object-contain rounded-lg"/>
            : <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                   style={{ background: '#1b6ca8' }}>{appName[0]}</div>}
          <div>
            <p className="font-bold text-slate-800 text-sm">{appName}</p>
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <Store size={10}/>{user?.shop_name || 'Sales Portal'}
            </p>
          </div>
        </div>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-1">
          {NAV.map(({ to, icon: Icon, label, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition
                 ${isActive ? 'bg-[#1b6ca8] text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              <Icon size={16}/>{label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition">
            <LogOut size={15}/><span className="hidden sm:inline">Logout</span>
          </button>
          <button onClick={() => setOpen(p => !p)} className="sm:hidden p-2 text-slate-600">
            {open ? <X size={20}/> : <Menu size={20}/>}
          </button>
        </div>
      </header>

      {open && (
        <div className="sm:hidden bg-white border-b border-slate-200 px-4 py-2 space-y-1">
          {NAV.map(({ to, icon: Icon, label, end }) => (
            <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition
                 ${isActive ? 'bg-[#1b6ca8] text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              <Icon size={16}/>{label}
            </NavLink>
          ))}
        </div>
      )}

      <main className="flex-1 p-4 sm:p-6 max-w-2xl mx-auto w-full">
        <Outlet/>
      </main>
    </div>
  );
}
