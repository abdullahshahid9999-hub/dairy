import { useState, useEffect, useRef } from 'react';
import { Settings as SettingsIcon, Upload, Link, Save, RotateCcw, Building2, MessageCircle } from 'lucide-react';
import api from '../../api/client';
import toast from 'react-hot-toast';

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [preview, setPreview]   = useState(null);
  const [logoName, setLogoName] = useState('Brimi Dairy');
  const [logoUrl, setLogoUrl]   = useState('');
  const [mode, setMode]         = useState('upload');
  const [whatsapp, setWhatsapp] = useState('');
  const [waSaving, setWaSaving] = useState(false);
  const fileRef                 = useRef(null);

  useEffect(() => {
    api.get('/settings').then(({ data }) => {
      setSettings(data.settings || {});
      setPreview(data.settings?.logo_url || null);
      setLogoName(data.settings?.logo_name || 'Brimi Dairy');
    }).finally(() => setLoading(false));
    // admin_whatsapp is a private key — fetched separately via its own admin-only route
    api.get('/settings/admin_whatsapp').then(({ data }) => {
      setWhatsapp(data.value || '');
    }).catch(() => {});
  }, []);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!['image/png','image/jpeg','image/svg+xml','image/webp'].includes(file.type)) {
      toast.error('Only PNG, JPG, SVG, WebP allowed'); return;
    }
    if (file.size > 300 * 1024) { toast.error('Max 300KB'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const saveLogo = async () => {
    const logoValue = mode === 'upload' ? preview : logoUrl;
    if (!logoValue) { toast.error('Select a logo first'); return; }
    setSaving(true);
    try {
      await api.post('/settings/logo', { logo: logoValue, name: logoName });
      toast.success('Logo updated!');
      window.dispatchEvent(new Event('logo-updated'));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save logo');
    } finally { setSaving(false); }
  };

  const resetLogo = async () => {
    if (!window.confirm('Reset logo?')) return;
    setSaving(true);
    try {
      await api.delete('/settings/logo');
      setPreview(null);
      if (fileRef.current) fileRef.current.value = '';
      toast.success('Logo reset');
      window.dispatchEvent(new Event('logo-updated'));
    } catch { toast.error('Failed'); } finally { setSaving(false); }
  };

  const saveSetting = async (key, value) => {
    try {
      await api.put(`/settings/${key}`, { value });
      toast.success('Saved');
    } catch { toast.error('Failed to save'); }
  };

  const saveWhatsapp = async () => {
    setWaSaving(true);
    try {
      await api.put('/settings/admin_whatsapp', { value: whatsapp });
      toast.success('WhatsApp number saved');
    } catch { toast.error('Failed to save'); } finally { setWaSaving(false); }
  };

  if (loading) return <div className="p-8 text-slate-500">Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <SettingsIcon size={24} className="text-[#1d6faa]" /> Settings
        </h1>
      </div>

      {/* Logo */}
      <div className="card space-y-5">
        <h2 className="font-semibold text-slate-700 flex items-center gap-2">
          <Building2 size={18} className="text-[#1d6faa]" /> Company Logo
        </h2>

        <div className="flex items-center gap-4">
          <div className="w-20 h-20 border-2 border-dashed border-[#d1dce8] rounded-xl
                          flex items-center justify-center overflow-hidden bg-slate-50">
            {preview
              ? <img src={preview} alt="Logo" className="max-w-full max-h-full object-contain p-1" />
              : <span className="text-slate-400 text-xs text-center px-2">No logo</span>
            }
          </div>
          <div className="text-sm text-slate-500">
            <p>SVG or PNG recommended</p>
            <p>Max 300 KB</p>
          </div>
        </div>

        <div className="flex gap-2">
          {['upload','url'].map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition
                ${mode === m ? 'bg-[#1d6faa] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {m === 'upload' ? <><Upload size={13} className="inline mr-1" />Upload</> : <><Link size={13} className="inline mr-1" />URL</>}
            </button>
          ))}
        </div>

        {mode === 'upload'
          ? <input ref={fileRef} type="file" accept="image/*" onChange={handleFile}
              className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4
                         file:rounded-lg file:border-0 file:bg-blue-50 file:text-[#1d6faa]
                         hover:file:bg-blue-100 cursor-pointer" />
          : <input type="url" value={logoUrl} onChange={e => { setLogoUrl(e.target.value); setPreview(e.target.value); }}
              placeholder="https://..." className="input" />
        }

        <div>
          <label className="label">Company Name (next to logo)</label>
          <input type="text" value={logoName} onChange={e => setLogoName(e.target.value)}
            maxLength={60} className="input" />
        </div>

        <div className="flex gap-3">
          <button onClick={saveLogo} disabled={saving} className="btn-primary">
            <Save size={15} />{saving ? 'Saving...' : 'Save Logo'}
          </button>
          {preview && (
            <button onClick={resetLogo} disabled={saving} className="btn-danger">
              <RotateCcw size={15} />Reset
            </button>
          )}
        </div>
      </div>

      {/* General settings */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-slate-700">General Settings</h2>
        {[
          { key: 'app_name', label: 'Application Name' },
          { key: 'currency', label: 'Currency Symbol' },
          { key: 'timezone', label: 'Timezone' },
        ].map(({ key, label }) => (
          <div key={key} className="flex items-center gap-4">
            <label className="w-40 text-sm font-medium text-slate-600 shrink-0">{label}</label>
            <input type="text" defaultValue={settings[key] || ''} onBlur={e => saveSetting(key, e.target.value)}
              className="input flex-1" />
          </div>
        ))}
        <p className="text-xs text-slate-400">Saves automatically when you leave the field.</p>
      </div>

      {/* WhatsApp Notifications */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-slate-700 flex items-center gap-2">
          <MessageCircle size={18} className="text-[#1d6faa]" /> WhatsApp Notifications
        </h2>
        <p className="text-xs text-slate-400 -mt-2">
          This number receives a WhatsApp alert for every milk purchase (collection) entry. The supplier (farmer) is also notified automatically using their own phone number on file.
        </p>
        <div className="flex items-center gap-4">
          <label className="w-40 text-sm font-medium text-slate-600 shrink-0">Admin WhatsApp #</label>
          <input type="tel" placeholder="03001234567" value={whatsapp}
            onChange={e => setWhatsapp(e.target.value)}
            className="input flex-1" />
        </div>
        <button onClick={saveWhatsapp} disabled={waSaving} className="btn-primary">
          <Save size={15} />{waSaving ? 'Saving...' : 'Save Number'}
        </button>
      </div>

      {/* Pricing Configuration */}
      <div className="card space-y-4">
        <div>
          <h2 className="font-semibold text-slate-700">Milk Pricing Configuration</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            TS formula: X = (c1 × FAT) + c2 + (LR ÷ c3) + FAT &nbsp;·&nbsp;
            Standardised = X × (scale ÷ target_ts) &nbsp;·&nbsp;
            Rate = Standardised × base_rate
          </p>
        </div>
        {[
          { key:'target_ts',      label:'Target TS',        hint:'Standard total solids target (default 13.00)',     type:'number', step:'0.01' },
          { key:'base_rate',      label:'Base Rate (Rs)',    hint:'Price per standardised unit — set by admin',       type:'number', step:'0.0001' },
          { key:'constant_c1',    label:'Constant C1',       hint:'FAT multiplier (default 0.22)',                    type:'number', step:'0.0001' },
          { key:'constant_c2',    label:'Constant C2',       hint:'Base addition constant (default 0.72)',            type:'number', step:'0.0001' },
          { key:'constant_c3',    label:'Constant C3 (LR÷)', hint:'Lactometer reading divisor — cannot be 0 (default 4.00)', type:'number', step:'0.0001' },
          { key:'constant_scale', label:'Scale Factor',      hint:'Formula scaling factor (default 200.00)',          type:'number', step:'0.01' },
        ].map(({ key, label, hint, type, step }) => (
          <div key={key} className="flex items-start gap-4">
            <div className="w-44 shrink-0">
              <p className="text-sm font-medium text-slate-700">{label}</p>
              <p className="text-xs text-slate-400 mt-0.5 leading-snug">{hint}</p>
            </div>
            <input
              type={type}
              step={step}
              defaultValue={settings[key] || ''}
              onBlur={e => {
                const v = e.target.value;
                if (key === 'target_ts' && (parseFloat(v) === 0 || !v)) {
                  toast.error('target_ts cannot be zero'); return;
                }
                if (key === 'constant_c3' && (parseFloat(v) === 0 || !v)) {
                  toast.error('constant_c3 cannot be zero'); return;
                }
                saveSetting(key, v);
              }}
              className="input flex-1 font-mono"
            />
          </div>
        ))}
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-700">
          ⚠️ <strong>target_ts</strong> and <strong>constant_c3</strong> must never be set to zero — system will block calculations.
          Changes here take effect on the <strong>next</strong> milk collection entry.
        </div>
      </div>
    </div>
  );
}
