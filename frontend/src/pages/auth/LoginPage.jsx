import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, CheckCircle, ShoppingCart, Milk, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/client';
import useAuthStore from '../../store/authStore';

// Portal configs
const PORTALS = {
  admin: {
    label:      'Admin Portal',
    subtitle:   'Full system access',
    accent:     '#0d2137',
    accentBtn:  '#1b6ca8',
    accentRing: 'blue',
    icon:       Shield,
    features: [
      'Milk collection & FAT/SNF pricing',
      'Bulk, Household & Cash customers',
      'Auto invoicing & billing',
      'HR, payroll & advance management',
      'Real-time reports & analytics',
    ],
    redirectFn: () => '/admin/dashboard',
    allowedRole: 'admin',
  },
  sales: {
    label:      'Sales Portal',
    subtitle:   'Walk-in sales & customer management',
    accent:     '#0f3d2e',
    accentBtn:  '#16a34a',
    accentRing: 'green',
    icon:       ShoppingCart,
    features: [
      'Walk-in sales entry',
      'Customer management',
      'Daily sales history',
      
      'Sales dashboard',
    ],
    redirectFn: () => '/sales',
    allowedRole: 'staff',
    allowedDept: 'sales',
  },
  purchase: {
    label:      'Purchase Portal',
    subtitle:   'Milk collection & supplier management',
    accent:     '#1e1b4b',
    accentBtn:  '#7c3aed',
    accentRing: 'purple',
    icon:       Milk,
    features: [
      'Milk collection entry',
      'FAT/SNF auto calculation',
      'Supplier (farmer) view',
      'Collection history',
      'Purchase dashboard',
    ],
    redirectFn: () => '/staff',
    allowedRole: 'staff',
    allowedDept: 'purchase',
  },
};

export default function LoginPage({ portal = 'admin' }) {
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [logo, setLogo]         = useState('');
  const [appName, setAppName]   = useState('Brimi Dairy');
  const { login } = useAuthStore();
  const navigate  = useNavigate();
  const { register, handleSubmit, formState: { errors } } = useForm();

  const cfg = PORTALS[portal] || PORTALS.admin;
  const Icon = cfg.icon;

  useEffect(() => {
    api.get('/settings').then(({ data }) => {
      if (data.settings?.logo_url) setLogo(data.settings.logo_url);
      if (data.settings?.app_name) setAppName(data.settings.app_name);
    }).catch(() => {});
  }, []);

  // Where a logged-in user actually belongs, regardless of which portal they typed in on
  const homeFor = (user) => {
    if (user.role === 'admin') return '/admin/dashboard';
    if (user.department === 'sales') return '/sales';
    if (user.department === 'purchase') return '/staff';
    return '/login';
  };

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const res = await api.post('/auth/login', data);
      if (res.data.success) {
        const user = res.data.data.user;

        // The dedicated portal pages (/admin/login, /sales/login, /purchase/login) still
        // enforce that you're using the right one — this avoids a sales user accidentally
        // landing on the admin-branded screen and vice versa. The generic /login page
        // (portal=admin, used as the catch-all / and 404 redirect target) does NOT block —
        // it just sends every valid user to wherever they actually belong.
        const isGenericLogin = portal === 'admin' && window.location.pathname === '/login';

        if (!isGenericLogin) {
          if (portal === 'sales' && (user.role === 'admin' || user.department !== 'sales')) {
            toast.error('Access denied. Use the correct portal.');
            setLoading(false);
            return;
          }
          if (portal === 'purchase' && (user.role === 'admin' || user.department !== 'purchase')) {
            toast.error('Access denied. Use the correct portal.');
            setLoading(false);
            return;
          }
          if (portal === 'admin' && user.role !== 'admin' && !isGenericLogin) {
            toast.error('Access denied. Use the correct portal.');
            setLoading(false);
            return;
          }
        }

        login(user, res.data.data.accessToken, res.data.data.refreshToken);
        navigate(isGenericLogin ? homeFor(user) : cfg.redirectFn());
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed');
    } finally { setLoading(false); }
  };

  const ringColor = {
    blue:   'focus:ring-blue-500/30 focus:border-blue-500',
    green:  'focus:ring-green-500/30 focus:border-green-500',
    purple: 'focus:ring-purple-500/30 focus:border-purple-500',
  }[cfg.accentRing];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">

      {/* ── LEFT PANEL ── */}
      <div className="hidden lg:flex flex-col justify-between w-[46%] min-h-screen p-12"
        style={{ background: cfg.accent }}>

        {/* Logo + Portal badge */}
        <div className="flex items-center gap-4">
          {logo
            ? <img src={logo} alt="logo" className="w-12 h-12 rounded-xl object-contain"
                style={{ background: 'rgba(255,255,255,0.1)', padding: 4 }}/>
            : <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black text-white"
                style={{ background: cfg.accentBtn }}>{appName[0]}</div>
          }
          <div>
            <p className="text-white font-bold text-lg leading-none">{appName}</p>
            <p className="text-xs mt-0.5 opacity-60 text-white">{cfg.label}</p>
          </div>
        </div>

        {/* Headline */}
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Icon size={20} style={{ color: cfg.accentBtn === '#1b6ca8' ? '#60a5fa' : cfg.accentBtn === '#16a34a' ? '#4ade80' : '#a78bfa' }}/>
              <span className="text-xs font-semibold uppercase tracking-widest opacity-60 text-white">{cfg.label}</span>
            </div>
            <h1 className="text-4xl font-extrabold leading-tight text-white">
              {portal === 'admin' && <>Complete dairy<br/>management,<br/><span style={{ color: '#60a5fa' }}>simplified.</span></>}
              {portal === 'sales' && <>Walk-in sales,<br/>customers,<br/><span style={{ color: '#4ade80' }}>simplified.</span></>}
              {portal === 'purchase' && <>Milk collection,<br/>suppliers,<br/><span style={{ color: '#a78bfa' }}>simplified.</span></>}
            </h1>
            <p className="text-slate-400 mt-4 text-sm leading-relaxed max-w-xs">
              {portal === 'admin' && 'From farm gate to customer — track every liter, every payment, every employee.'}
              {portal === 'sales' && 'Manage walk-in customers, process daily sales, and track your shop performance.'}
              {portal === 'purchase' && 'Record milk collections, calculate FAT/SNF automatically, and manage suppliers.'}
            </p>
          </div>

          <ul className="space-y-3">
            {cfg.features.map(f => (
              <li key={f} className="flex items-center gap-3 text-sm text-slate-300">
                <CheckCircle size={15} style={{ color: cfg.accentBtn === '#1b6ca8' ? '#60a5fa' : cfg.accentBtn === '#16a34a' ? '#4ade80' : '#a78bfa', flexShrink: 0 }}/>
                {f}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-slate-600 text-xs">
          Developed by <span className="text-slate-400 font-medium">Quantum Solution Group</span> · © 2025
        </p>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 flex items-center justify-center min-h-screen bg-slate-50 p-6">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            {logo
              ? <img src={logo} alt="logo" className="w-10 h-10 rounded-lg object-contain"/>
              : <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                  style={{ background: cfg.accentBtn }}>{appName[0]}</div>
            }
            <div>
              <span className="font-bold text-slate-800 block">{appName}</span>
              <span className="text-xs text-slate-400">{cfg.label}</span>
            </div>
          </div>

          {/* Portal badge on mobile */}
          <div className="flex items-center gap-2 mb-4 lg:hidden">
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: cfg.accentBtn }}>
              <Icon size={13} className="text-white"/>
            </div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{cfg.label}</span>
          </div>

          <h2 className="text-2xl font-bold text-slate-800 mb-1">Welcome back</h2>
          <p className="text-slate-400 text-sm mb-8">Sign in to your account</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Email</label>
              <input type="email" placeholder="your@email.com" autoComplete="email"
                className={`w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm
                           focus:outline-none focus:ring-2 transition ${ringColor}`}
                {...register('email', { required: 'Required' })}/>
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Password</label>
                <Link to="/forgot-password" className="text-xs font-medium hover:opacity-80"
                  style={{ color: cfg.accentBtn }}>Forgot?</Link>
              </div>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} placeholder="••••••••" autoComplete="current-password"
                  className={`w-full px-4 py-3 pr-11 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm
                             focus:outline-none focus:ring-2 transition ${ringColor}`}
                  {...register('password', { required: 'Required' })}/>
                <button type="button" onClick={() => setShowPass(p => !p)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="rem" className="w-4 h-4 rounded" {...register('rememberMe')}
                style={{ accentColor: cfg.accentBtn }}/>
              <label htmlFor="rem" className="text-sm text-slate-500 cursor-pointer">Remember me for 30 days</label>
            </div>

            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm transition
                         flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: loading ? '#94a3b8' : cfg.accentBtn,
                       boxShadow: `0 4px 14px ${cfg.accentBtn}55` }}>
              {loading
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Signing in…</>
                : <><Icon size={15}/>Sign In</>}
            </button>
          </form>

          {/* Portal switcher links */}
          <div className="mt-8 pt-6 border-t border-slate-200">
            <p className="text-xs text-slate-400 text-center mb-3">Wrong portal?</p>
            <div className="flex justify-center gap-4">
              {portal !== 'admin' && (
                <a href="/admin/login" className="text-xs font-medium text-slate-500 hover:text-slate-700 flex items-center gap-1">
                  <Shield size={11}/> Admin
                </a>
              )}
              {portal !== 'sales' && (
                <a href="/sales/login" className="text-xs font-medium text-slate-500 hover:text-slate-700 flex items-center gap-1">
                  <ShoppingCart size={11}/> Sales
                </a>
              )}
              {portal !== 'purchase' && (
                <a href="/purchase/login" className="text-xs font-medium text-slate-500 hover:text-slate-700 flex items-center gap-1">
                  <Milk size={11}/> Purchase
                </a>
              )}
            </div>
          </div>

          <p className="text-center text-xs text-slate-400 mt-6">
            Developed by <span className="font-medium text-slate-500">Quantum Solution Group</span>
          </p>
        </div>
      </div>
    </div>
  );
}
