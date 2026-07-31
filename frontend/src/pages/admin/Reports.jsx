import { useState } from 'react';
import {
  BarChart3, Download, TrendingUp, TrendingDown,
  DollarSign, Droplets, Store, Printer, Calendar
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell
} from 'recharts';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import api from '../../api/client';
import { PageHeader } from '../../components/ui';
import { jsPDF } from 'jspdf';
import { useLogo } from '../../hooks/UseLogo';
import autoTable from 'jspdf-autotable';
import useAuthStore from '../../store/authStore';

const fmtPKR = n => `Rs ${Number(n||0).toLocaleString('en-PK',{maximumFractionDigits:0})}`;
const fmtN   = n => Number(n||0).toFixed(1);
const COLORS  = ['#1d6faa','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316'];

const MONTHS = ['','January','February','March','April','May','June',
                 'July','August','September','October','November','December'];

const TENURES = [
  { key:'month',  label:'Monthly' },
  { key:'custom', label:'Custom Range' },
];

/* ══════════════════════════════════════════════════════ */
export default function Reports() {
  const { user }            = useAuthStore();
  const { logo, name: appName } = useLogo();

  const [tenure, setTenure]     = useState('month');
  const [month, setMonth]       = useState(format(new Date(),'yyyy-MM'));
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [activeTab, setActiveTab] = useState('finance'); // finance | sales | purchase

  // ── load ───────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      let url;
      if (tenure === 'month') {
        url = `/reports/pl?month=${month}`;
      } else {
        if (!dateFrom || !dateTo) { toast.error('Select date range'); setLoading(false); return; }
        url = `/reports/pl?date_from=${dateFrom}&date_to=${dateTo}`;
      }
      const r = await api.get(url);
      setData(r.data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  // ── PDF generator ──────────────────────────────────────────────────
  const generatePDF = (section = 'all') => {
    if (!data) return;
    const s    = data.summary;
    const now  = new Date();
    const printedAt = format(now, 'dd MMM yyyy, hh:mm a');
    const printedBy = user?.name || user?.username || 'Admin';

    const [yr, mn] = (month || '').split('-');
    const periodLabel = tenure === 'month'
      ? `${MONTHS[parseInt(mn)] || ''} ${yr}`
      : `${dateFrom} to ${dateTo}`;

    const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
    const W   = 210;

    // ── Header band ──────────────────────────────────────────────────
    doc.setFillColor(29, 111, 170);
    doc.rect(0, 0, W, 36, 'F');

    // Logo (if available)
    if (logo) {
      try { doc.addImage(logo, 'PNG', 10, 5, 22, 22); } catch {}
    }

    const textX = logo ? 36 : 14;
    doc.setTextColor(255,255,255);
    doc.setFontSize(18); doc.setFont('helvetica','bold');
    doc.text(appName || 'Dairy ERP', textX, 14);
    doc.setFontSize(10); doc.setFont('helvetica','normal');
    doc.text(
      section === 'all'     ? `Financial Report — ${periodLabel}`  :
      section === 'sales'   ? `Sales Report — ${periodLabel}`      :
      `Purchase Report — ${periodLabel}`,
      textX, 22
    );
    doc.setFontSize(8);
    doc.text(`Generated: ${printedAt}`, textX, 29);

    // Top-right: period badge
    doc.setFontSize(8);
    doc.text(periodLabel, W-14, 14, { align:'right' });
    doc.text(`Quantum Solution Group`, W-14, 20, { align:'right' });

    let y = 46;

    // ── Finance Summary (always shown in 'all') ───────────────────────
    if (section === 'all' || section === 'finance') {
      doc.setTextColor(30,41,59);
      doc.setFontSize(12); doc.setFont('helvetica','bold');
      doc.text('Financial Summary', 14, y); y += 4;

      autoTable(doc, {
        startY: y,
        head: [['Description','Amount (PKR)']],
        body: [
          ['Milk Purchased (Cost)',  fmtPKR(s.milk_purchase)],
          ['Total Litres Purchased', `${fmtN(s.milk_liters)} L`],
          ['Sales Revenue',          fmtPKR(s.sales_revenue)],
          ['Cash Received',          fmtPKR(s.sales_received)],
          ['Total Litres Sold',      `${fmtN(s.sold_liters)} L`],
          ['Total Expenses',         fmtPKR(s.total_expenses)],
          ['Gross Profit',           fmtPKR(s.gross_profit)],
          ['Net Profit',             fmtPKR(s.net_profit)],
          ['Net Margin',             `${s.margin_pct}%`],
        ],
        headStyles:{ fillColor:[29,111,170], textColor:[255,255,255], fontStyle:'bold' },
        alternateRowStyles:{ fillColor:[241,245,249] },
        columnStyles:{ 1:{ halign:'right', font:'courier' } },
        didParseCell: h => {
          if (h.row.index === 7) {
            h.cell.styles.textColor = parseFloat(s.net_profit)>=0 ? [16,185,129]:[239,68,68];
            h.cell.styles.fontStyle = 'bold';
          }
        },
        margin:{ left:14, right:14 },
      });
      y = doc.lastAutoTable.finalY + 10;
    }

    // ── Expense breakdown ─────────────────────────────────────────────
    if (section === 'all' || section === 'finance') {
      if (data.expense_breakdown?.length) {
        doc.setFontSize(12); doc.setFont('helvetica','bold');
        doc.text('Expense Breakdown', 14, y); y += 4;
        autoTable(doc, {
          startY: y,
          head: [['Category','Amount (PKR)']],
          body: data.expense_breakdown.map(e=>[e.category, fmtPKR(e.amount)]),
          headStyles:{ fillColor:[100,116,139], textColor:[255,255,255] },
          columnStyles:{ 1:{ halign:'right', font:'courier' } },
          margin:{ left:14, right:14 },
        });
        y = doc.lastAutoTable.finalY + 10;
      }
    }

    // ── Purchase breakdown ────────────────────────────────────────────
    if (section === 'all' || section === 'purchase') {
      if (data.farmer_breakdown?.length) {
        if (y > 220) { doc.addPage(); y = 20; }
        doc.setFontSize(12); doc.setFont('helvetica','bold');
        doc.text('Farmer-wise Purchase', 14, y); y += 4;
        autoTable(doc, {
          startY: y,
          head: [['Code','Farmer','Location','Litres','Avg FAT%','Amount (PKR)']],
          body: data.farmer_breakdown.map(f=>[
            f.farmer_code, f.name,
            f.location||'—',
            fmtN(f.liters),
            fmtN(f.avg_fat),
            fmtPKR(f.amount),
          ]),
          headStyles:{ fillColor:[29,111,170], textColor:[255,255,255] },
          columnStyles:{
            3:{ halign:'right' }, 4:{ halign:'right' },
            5:{ halign:'right', font:'courier' }
          },
          margin:{ left:14, right:14 },
        });
        y = doc.lastAutoTable.finalY + 10;
      }
    }

    // ── Sales (company) breakdown ─────────────────────────────────────
    if ((section === 'all' || section === 'sales') && data.sales_breakdown?.length) {
      if (y > 220) { doc.addPage(); y = 20; }
      doc.setFontSize(12); doc.setFont('helvetica','bold');
      doc.text('Sales by Company', 14, y); y += 4;
      autoTable(doc, {
        startY: y,
        head: [['Company','Litres','Revenue (PKR)']],
        body: data.sales_breakdown.map(s=>[s.company, fmtN(s.liters), fmtPKR(s.revenue)]),
        headStyles:{ fillColor:[16,185,129], textColor:[255,255,255] },
        columnStyles:{ 1:{ halign:'right' }, 2:{ halign:'right', font:'courier' } },
        margin:{ left:14, right:14 },
      });
      y = doc.lastAutoTable.finalY + 10;
    }

    // ── Footer on every page ──────────────────────────────────────────
    const pages = doc.getNumberOfPages();
    for (let i=1; i<=pages; i++) {
      doc.setPage(i);
      // Footer line
      doc.setDrawColor(220,230,240);
      doc.line(14, 282, W-14, 282);
      doc.setFontSize(7.5); doc.setTextColor(148,163,184);
      doc.text(`${appName} · Quantum Solution Group`, 14, 287);
      doc.text(`Printed by ${printedBy} at ${printedAt}`, W/2, 287, { align:'center' });
      doc.text(`Page ${i} of ${pages}`, W-14, 287, { align:'right' });
    }

    const prefix = section === 'all' ? 'FullReport' : section.charAt(0).toUpperCase()+section.slice(1)+'Report';
    doc.save(`${prefix}_${periodLabel.replace(/\s+/g,'_')}.pdf`);
    toast.success('PDF downloaded');
  };

  const s = data?.summary;
  const expChart = (data?.expense_breakdown||[])
    .filter(e=>parseFloat(e.amount)>0)
    .map(e=>({ name:e.category, value:parseFloat(e.amount) }));

  // ── UI ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader title="Reports" subtitle="Sales, purchase and finance reports"/>

      {/* ── Controls ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        {/* Tenure tabs */}
        <div className="flex gap-2">
          {TENURES.map(t=>(
            <button key={t.key}
              onClick={()=>setTenure(t.key)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition
                ${tenure===t.key
                  ? 'bg-[#1d6faa] text-white border-[#1d6faa]'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-[#1d6faa]'}`}
            >{t.label}</button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {tenure==='month' ? (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Month</label>
              <input type="month" className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1d6faa]"
                value={month} onChange={e=>setMonth(e.target.value)}/>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">From</label>
                <input type="date" className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1d6faa]"
                  value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">To</label>
                <input type="date" className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1d6faa]"
                  value={dateTo} onChange={e=>setDateTo(e.target.value)}/>
              </div>
            </>
          )}

          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 px-5 py-2 bg-[#1d6faa] text-white rounded-xl text-sm font-semibold hover:bg-[#1557a0] transition disabled:opacity-60">
            {loading
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
              : <><BarChart3 size={15}/> Generate</>}
          </button>

          {/* Download buttons */}
          {data && (
            <div className="flex gap-2 ml-auto flex-wrap">
              {[
                { key:'all',      label:'Full Report' },
                { key:'finance',  label:'Finance' },
                { key:'sales',    label:'Sales' },
                { key:'purchase', label:'Purchase' },
              ].map(b=>(
                <button key={b.key} onClick={()=>generatePDF(b.key)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:border-[#1d6faa] hover:text-[#1d6faa] transition">
                  <Download size={13}/>{b.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Report body ───────────────────────────────────────────── */}
      {data && (
        <div className="space-y-5">

          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label:'Milk Purchased',  val:fmtPKR(s.milk_purchase),  sub:`${fmtN(s.milk_liters)} L`, icon:Droplets,    c:'text-[#1d6faa]',    bg:'bg-blue-50' },
              { label:'Sales Revenue',   val:fmtPKR(s.sales_revenue),  sub:`${fmtN(s.sold_liters)} L sold`, icon:TrendingUp, c:'text-emerald-600', bg:'bg-emerald-50' },
              { label:'Total Expenses',  val:fmtPKR(s.total_expenses), sub:'This period', icon:DollarSign,   c:'text-amber-600', bg:'bg-amber-50' },
              {
                label:'Net Profit', val:fmtPKR(s.net_profit), sub:`Margin: ${s.margin_pct}%`,
                icon: parseFloat(s.net_profit)>=0 ? TrendingUp : TrendingDown,
                c:  parseFloat(s.net_profit)>=0 ? 'text-emerald-600':'text-red-500',
                bg: parseFloat(s.net_profit)>=0 ? 'bg-emerald-50':'bg-red-50',
              },
            ].map(({ label,val,sub,icon:Icon,c,bg })=>(
              <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-3`}>
                  <Icon size={18} className={c}/>
                </div>
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">{label}</p>
                <p className={`text-xl font-bold font-mono ${c}`}>{val}</p>
                <p className="text-xs text-slate-400 mt-1">{sub}</p>
              </div>
            ))}
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
            {['finance','sales','purchase'].map(t=>(
              <button key={t} onClick={()=>setActiveTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition
                  ${activeTab===t ? 'bg-white text-[#1d6faa] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {t}
              </button>
            ))}
          </div>

          {/* Finance tab */}
          {activeTab==='finance' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Expense chart */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <p className="font-semibold text-slate-700 mb-4">Expense Breakdown</p>
                {expChart.length ? (
                  <ResponsiveContainer width="100%" height={230}>
                    <BarChart data={expChart} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false}/>
                      <XAxis type="number" tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false}
                        tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                      <YAxis type="category" dataKey="name" width={100} tick={{fontSize:11,fill:'#64748b'}} axisLine={false} tickLine={false}/>
                      <Tooltip formatter={v=>[fmtPKR(v)]} contentStyle={{borderRadius:10,border:'1px solid #e2e8f0',fontSize:12}}/>
                      <Bar dataKey="value" radius={[0,6,6,0]}>
                        {expChart.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-slate-400 text-sm text-center py-16">No expenses recorded</p>}
              </div>

              {/* P&L summary table */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100">
                  <p className="font-semibold text-slate-700">P&L Summary</p>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {[
                      ['Milk Purchased',    fmtPKR(s.milk_purchase),  ''],
                      ['Sales Revenue',     fmtPKR(s.sales_revenue),  ''],
                      ['Cash Received',     fmtPKR(s.sales_received), ''],
                      ['Total Expenses',    fmtPKR(s.total_expenses), ''],
                      ['Gross Profit',      fmtPKR(s.gross_profit),   ''],
                      ['Net Profit',        fmtPKR(s.net_profit),     parseFloat(s.net_profit)>=0?'profit':'loss'],
                      ['Net Margin',        `${s.margin_pct}%`,       ''],
                    ].map(([label,val,flag],i)=>(
                      <tr key={i} className={i%2===0?'bg-slate-50':''}>
                        <td className="px-5 py-2.5 text-slate-600">{label}</td>
                        <td className={`px-5 py-2.5 font-mono font-semibold text-right
                          ${flag==='profit'?'text-emerald-600':flag==='loss'?'text-red-500':'text-slate-800'}`}>
                          {val}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sales tab */}
          {activeTab==='sales' && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100">
                <p className="font-semibold text-slate-700">Sales by Company</p>
              </div>
              {data.sales_breakdown?.length ? (
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 text-xs text-slate-500 uppercase">
                    <th className="px-5 py-2.5 text-left">Company</th>
                    <th className="px-5 py-2.5 text-right">Litres</th>
                    <th className="px-5 py-2.5 text-right">Revenue</th>
                  </tr></thead>
                  <tbody>
                    {data.sales_breakdown.map((r,i)=>(
                      <tr key={i} className={i%2===0?'bg-white':'bg-slate-50/50'}>
                        <td className="px-5 py-3 font-medium text-slate-700">{r.company}</td>
                        <td className="px-5 py-3 text-right font-mono text-slate-600">{fmtN(r.liters)} L</td>
                        <td className="px-5 py-3 text-right font-mono font-semibold text-emerald-600">{fmtPKR(r.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="text-slate-400 text-sm text-center py-12">No sales data for this period</p>}
            </div>
          )}

          {/* Purchase tab */}
          {activeTab==='purchase' && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100">
                <p className="font-semibold text-slate-700">Farmer-wise Purchase</p>
              </div>
              {data.farmer_breakdown?.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-50 text-xs text-slate-500 uppercase">
                      <th className="px-5 py-2.5 text-left">Farmer</th>
                      <th className="px-5 py-2.5 text-left">Location</th>
                      <th className="px-5 py-2.5 text-right">Litres</th>
                      <th className="px-5 py-2.5 text-right">Avg FAT%</th>
                      <th className="px-5 py-2.5 text-right">Amount</th>
                    </tr></thead>
                    <tbody>
                      {data.farmer_breakdown.map((f,i)=>(
                        <tr key={i} className={i%2===0?'bg-white':'bg-slate-50/50'}>
                          <td className="px-5 py-3">
                            <p className="font-medium text-slate-700">{f.name}</p>
                            <p className="text-xs text-slate-400 font-mono">{f.farmer_code}</p>
                          </td>
                          <td className="px-5 py-3 text-slate-500 text-xs">{f.location||'—'}</td>
                          <td className="px-5 py-3 text-right font-mono text-slate-600">{fmtN(f.liters)} L</td>
                          <td className="px-5 py-3 text-right font-mono text-slate-600">{fmtN(f.avg_fat)}%</td>
                          <td className="px-5 py-3 text-right font-mono font-semibold text-[#1d6faa]">{fmtPKR(f.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-slate-400 text-sm text-center py-12">No purchase data for this period</p>}
            </div>
          )}
        </div>
      )}

      {!data && !loading && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center justify-center h-52">
          <div className="text-center">
            <BarChart3 size={32} className="text-slate-300 mx-auto mb-3"/>
            <p className="text-slate-400 text-sm">Select a period and click Generate</p>
          </div>
        </div>
      )}
    </div>
  );
}
