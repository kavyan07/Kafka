import React, { useState, useMemo, useRef } from 'react'
import { useStore } from '../store'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Brush
} from 'recharts'
import { Download, Info, BarChart3, LineChart as LineIcon, PieChart as PieIcon, Group, Layers, Zap } from 'lucide-react'

const COLORS = [
  '#00ffc8', // Cyan (Accent)
  '#8b5cf6', // Violet (Accent 2)
  '#f97316', // Orange (Warning)
  '#10b981', // Green
  '#f43f5e', // Red
  '#3b82f6', // Blue
  '#e879f9', // Pink
  '#fbbf24', // Amber
  '#2dd4bf', // Teal
  '#6366f1', // Indigo
]

const SKIP_GROUP = ['id','url','sku','name','description','image','link','title','slug']

export default function ChartPanel() {
  const { results, schema, addFilter, query } = useStore()
  const [chartType, setChartType] = useState('bar')
  const [xField,    setXField]    = useState('')
  const [yField,    setYField]    = useState('')
  const [aggFunc,   setAggFunc]   = useState('count')
  const chartRef = useRef(null)

  const categoricalFields = schema.filter(f => {
    if (f.type !== 'string' && f.type !== 'text') return false
    const n = f.name.toLowerCase()
    return !SKIP_GROUP.some(skip => n.includes(skip))
  })

  const numericFields = schema.filter(f => f.type === 'integer' || f.type === 'float')

  const defaultX = xField || (() => {
    const priority = ['type','brand','category','status','source_file','country','region']
    for (const p of priority) {
      const found = categoricalFields.find(f => f.name.toLowerCase().includes(p))
      if (found) return found.name
    }
    return categoricalFields[0]?.name || schema[0]?.name || ''
  })()

  const defaultY = yField || numericFields[0]?.name || ''

  const getLabel = (n) => {
    const f = schema.find(s => s.name === n)
    return f?.label || n.replace(/(_s|_i|_f|_b|_dt|_txt)$/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  const chartData = useMemo(() => {
    if (!defaultX || !results.length) return []
    const agg = {}
    results.forEach(row => {
      const key = String(row[defaultX] ?? 'Unknown').trim().slice(0, 40) || 'Unknown'
      if (!agg[key]) agg[key] = { name: key, count: 0, values: [] }
      agg[key].count += 1
      if (defaultY && row[defaultY] != null) {
        const n = Number(row[defaultY])
        if (!isNaN(n)) agg[key].values.push(n)
      }
    })

    return Object.values(agg).map(d => {
      let yVal = d.count
      if (defaultY && d.values.length) {
        if (aggFunc === 'sum')   yVal = d.values.reduce((a,b)=>a+b, 0)
        if (aggFunc === 'avg')   yVal = d.values.reduce((a,b)=>a+b, 0) / d.values.length
        if (aggFunc === 'count') yVal = d.count
      }
      return { 
          name: d.name, 
          [defaultY||'count']: Math.round(yVal * 100) / 100, 
          _count: d.count 
      }
    })
    .sort((a, b) => (b[defaultY||'count']||0) - (a[defaultY||'count']||0))
    .slice(0, 15)
  }, [results, defaultX, defaultY, aggFunc])

  const yKey   = defaultY || 'count'
  const yLabel = aggFunc === 'count' ? 'Count'
    : `${aggFunc.charAt(0).toUpperCase()+aggFunc.slice(1)} of ${getLabel(defaultY)}`

  const handleClick = (payload) => {
    const val = payload?.activePayload?.[0]?.payload?.name || payload?.name
    if (!val || !defaultX) return
    addFilter({ field: defaultX, type: 'text', value: val, op: 'AND' })
    query()
  }

  const exportSVG = () => {
    const svg = chartRef.current?.querySelector('svg')
    if (!svg) return
    const blob = new Blob([svg.outerHTML], { type:'image/svg+xml' })
    const url  = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = `lens_chart_${Date.now()}.svg`; a.click(); URL.revokeObjectURL(url)
  }

  const stats = chartData.length ? {
    count: chartData.length,
    max:   Math.max(...chartData.map(d=>d[yKey]||0)),
    total: chartData.reduce((s,d)=>s+(d[yKey]||0),0),
  } : null

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', background:'var(--bg)' }}>
      
      {/* Chart Headers & Controls */}
      <div style={{ 
        display:'flex', alignItems:'center', gap:16, padding:'20px', 
        borderBottom:'1px solid var(--border)', background:'var(--bg-subtle)', flexShrink:0 
      }}>
        
        {/* Toggle View Type */}
        <div style={{ 
          display:'flex', background:'rgba(255,255,255,0.03)', 
          border:'1px solid var(--border)', borderRadius:12, padding:4, gap:4 
        }}>
          {[
            { id:'bar',  icon:<BarChart3 size={14}/> },
            { id:'line', icon:<LineIcon size={14}/> },
            { id:'pie',  icon:<PieIcon size={14}/> },
          ].map(t => (
            <button key={t.id} onClick={()=>setChartType(t.id)} style={{
              width:36, height:36, borderRadius:8, border:'none', cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center',
              background: chartType === t.id ? 'var(--accent)' : 'transparent',
              color: chartType === t.id ? '#000' : 'var(--text-muted)',
              transition:'all 0.2s'
            }}>
              {t.icon}
            </button>
          ))}
        </div>

        {/* Grouping Field */}
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
          <label style={{ fontSize:10, fontWeight:800, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.5px' }}>Group By</label>
          <select className="input" style={{ width:180, fontWeight:700 }} value={xField} onChange={e=>setXField(e.target.value)}>
            <option value="">Auto Detect</option>
            {categoricalFields.map(f=><option key={f.name} value={f.name}>{f.label}</option>)}
          </select>
        </div>

        {/* Value Field */}
        {chartType !== 'pie' && (
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            <label style={{ fontSize:10, fontWeight:800, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.5px' }}>Aggregate Metrics</label>
            <div style={{ display:'flex', gap:8 }}>
              <select className="input" style={{ width:160, fontWeight:700 }} value={yField} onChange={e=>setYField(e.target.value)}>
                <option value="">Total Count</option>
                {numericFields.map(f=><option key={f.name} value={f.name}>{f.label}</option>)}
              </select>
              {yField && (
                <select className="input" style={{ width:100, fontWeight:800, color:'var(--accent2)' }} value={aggFunc} onChange={e=>setAggFunc(e.target.value)}>
                  <option value="count">COUNT</option>
                  <option value="sum">SUM</option>
                  <option value="avg">AVG</option>
                </select>
              )}
            </div>
          </div>
        )}

        <div style={{ flex:1 }}/>
        
        <button className="btn btn-sm" onClick={exportSVG} disabled={!chartData.length} style={{ border:'1px dashed var(--border-strong)' }}>
          <Download size={14}/> Export SVG
        </button>
      </div>

      {/* Chart Canvas */}
      <div ref={chartRef} style={{ flex:1, padding:'24px', position:'relative' }}>
        {chartData.length === 0 ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:20 }}>
            <div style={{ width:60, height:60, borderRadius:20, background:'var(--bg-subtle)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-dim)' }}>
                <Zap size={32}/>
            </div>
            <div style={{ textAlign:'center' }}>
                <h3 style={{ fontSize:16, fontWeight:800, marginBottom:4 }}>Visual Analysis Pending</h3>
                <p style={{ color:'var(--text-dim)', fontSize:12 }}>Select a categorical field to generate insights from the current dataset.</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart data={chartData} onClick={handleClick} throttleDelay={100}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false}/>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill:'var(--text-dim)', fontSize:11 }} interval={0}/>
                <YAxis axisLine={false} tickLine={false} tick={{ fill:'var(--text-dim)', fontSize:11 }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}/>
                <Tooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  contentStyle={{ background:'var(--bg-subtle)', border:'1px solid var(--border)', borderRadius:12, boxShadow: 'var(--shadow-lg)' }}
                />
                <Bar dataKey={yKey} radius={[6,6,0,0]} maxBarSize={40}>
                  {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            ) : chartType === 'line' ? (
              <LineChart data={chartData} onClick={handleClick}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false}/>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill:'var(--text-dim)', fontSize:11 }}/>
                <YAxis axisLine={false} tickLine={false} tick={{ fill:'var(--text-dim)', fontSize:11 }}/>
                <Tooltip contentStyle={{ background:'var(--bg-subtle)', border:'1px solid var(--border)', borderRadius:12 }}/>
                <Line type="monotone" dataKey={yKey} stroke="var(--accent)" strokeWidth={3} dot={{ fill:'var(--bg)', stroke:'var(--accent)', strokeWidth:2, r:4 }} activeDot={{ r:8, strokeWidth:0 }} />
              </LineChart>
            ) : (
              <PieChart>
                <Pie data={chartData} dataKey={yKey} nameKey="name" cx="50%" cy="50%" innerRadius="40%" outerRadius="70%" paddingAngle={4} onClick={handleClick}>
                   {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="var(--bg)" strokeWidth={2} />)}
                </Pie>
                <Tooltip contentStyle={{ background:'var(--bg-subtle)', border:'1px solid var(--border)', borderRadius:12 }}/>
              </PieChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      {/* Metrics Banner */}
      {stats && (
        <div style={{ display:'flex', padding:'12px 24px', borderTop:'1px solid var(--border)', background:'var(--bg-subtle)', gap:40 }}>
            <SummaryMetric label="Top Segments" value={stats.count}/>
            <SummaryMetric label="Max Peak" value={stats.max.toLocaleString()} color="var(--warning)"/>
            <SummaryMetric label="Cumulative Distribution" value={stats.total.toLocaleString()} color="var(--accent)"/>
        </div>
      )}
    </div>
  )
}

function SummaryMetric({ label, value, color='var(--text)' }) {
    return (
        <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
            <span style={{ fontSize:10, fontWeight:800, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.5px' }}>{label}</span>
            <span style={{ fontSize:16, fontWeight:800, color, fontFamily:'var(--font-mono)' }}>{value}</span>
        </div>
    )
}
