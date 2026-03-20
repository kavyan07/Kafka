import React, { useState } from 'react'
import { useStore } from '../store'
import { X, Save, Trash2, BookMarked, Check, Columns, Filter, Share2, Star, StarOff, Clock } from 'lucide-react'

export default function SavedViews() {
  const { views, saveView, loadView, deleteView, showViews, setShowViews } = useStore()
  const [newName,   setNewName]   = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [isShared,  setIsShared]  = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [filter,    setFilter]    = useState('all') // all, mine, shared

  const handleSave = async () => {
    if (!newName.trim()) return
    setSaving(true)
    await saveView({ name: newName.trim(), is_default: isDefault, shared: isShared })
    setNewName(''); setSaving(false); setSaved(true); setIsDefault(false); setIsShared(false)
    setTimeout(() => setSaved(false), 2000)
  }

  const filtered = views.filter(v => {
    if (filter === 'shared') return v.shared
    if (filter === 'default') return v.is_default
    return true
  })

  if (!showViews) return null

  return (
    <>
      <div style={{ position:'fixed', inset:0, zIndex:150, background:'rgba(0,0,0,.35)' }} onClick={() => setShowViews(false)}/>
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:380,
        background:'var(--bg2)', borderLeft:'1px solid var(--border)', zIndex:151,
        display:'flex', flexDirection:'column', boxShadow:'var(--shadow)' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <BookMarked size={16} style={{ color:'var(--accent)' }}/>
            <span style={{ fontWeight:700, fontSize:15 }}>Saved Views</span>
            {views.length > 0 && <span className="badge badge-accent">{views.length}</span>}
          </div>
          <button onClick={() => setShowViews(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:4 }}>
            <X size={18}/>
          </button>
        </div>

        {/* Save New */}
        <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', background:'var(--bg3)' }}>
          <div style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:10 }}>
            Save Current View
          </div>
          <div style={{ display:'flex', gap:8, marginBottom:8 }}>
            <input className="input" placeholder="View name…" value={newName}
              onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()}
              style={{ fontSize:13 }}/>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || !newName.trim()}
              style={saved ? { background:'var(--success)', borderColor:'var(--success)' } : {}}>
              {saved ? <Check size={15}/> : <Save size={15}/>}
            </button>
          </div>
          <div style={{ display:'flex', gap:14 }}>
            <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'var(--text-muted)', cursor:'pointer' }}>
              <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} style={{ accentColor:'var(--accent)' }}/>
              <Star size={11}/> Default view
            </label>
            <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'var(--text-muted)', cursor:'pointer' }}>
              <input type="checkbox" checked={isShared} onChange={e => setIsShared(e.target.checked)} style={{ accentColor:'var(--accent2)' }}/>
              <Share2 size={11}/> Share with team
            </label>
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display:'flex', gap:2, padding:'8px 12px', borderBottom:'1px solid var(--border)' }}>
          {[['all','All'],['shared','Shared'],['default','Default']].map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)} className="btn btn-xs"
              style={{ borderColor: filter === v ? 'rgba(0,229,255,0.4)' : undefined, color: filter === v ? 'var(--accent)' : undefined }}>
              {l}
            </button>
          ))}
        </div>

        {/* Views List */}
        <div style={{ flex:1, overflowY:'auto', padding:'10px 12px' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px 20px', color:'var(--text-muted)' }}>
              <BookMarked size={36} style={{ opacity:.2, marginBottom:12 }}/>
              <div style={{ fontSize:14, fontWeight:600, marginBottom:6 }}>No views here</div>
              <div style={{ fontSize:12 }}>Set up columns and filters, then save as a view</div>
            </div>
          ) : filtered.map(view => (
            <ViewCard key={view.id} view={view}
              onLoad={() => { loadView(view); setShowViews(false) }}
              onDelete={() => deleteView(view.id)}/>
          ))}
        </div>
      </div>
    </>
  )
}

function ViewCard({ view, onLoad, onDelete }) {
  const [hov, setHov] = useState(false)
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ padding:'12px 14px', borderRadius:10, border:`1px solid ${view.is_default ? 'rgba(245,158,11,0.25)' : 'var(--border)'}`,
        marginBottom:8, background: hov ? 'var(--bg3)' : view.is_default ? 'rgba(245,158,11,0.04)' : 'transparent',
        transition:'all .15s' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
            {view.is_default && <Star size={11} style={{ color:'var(--amber)', flexShrink:0 }} />}
            {view.shared && <Share2 size={10} style={{ color:'var(--accent2)', flexShrink:0 }} />}
            <div style={{ fontWeight:700, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {view.name}
            </div>
          </div>
          <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:6 }}>
            {view.columns?.length > 0 && (
              <span className="badge" style={{ display:'flex', alignItems:'center', gap:3 }}>
                <Columns size={9}/> {view.columns.length} cols
              </span>
            )}
            {view.filters?.length > 0 && (
              <span className="badge badge-accent" style={{ display:'flex', alignItems:'center', gap:3 }}>
                <Filter size={9}/> {view.filters.length} filters
              </span>
            )}
            {view.version > 1 && (
              <span className="badge badge-violet" style={{ display:'flex', alignItems:'center', gap:3 }}>
                v{view.version}
              </span>
            )}
          </div>
          <div style={{ fontSize:10, color:'var(--text-dim)', display:'flex', alignItems:'center', gap:5 }}>
            <Clock size={9}/>
            {new Date(view.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
            {view.created_by && view.created_by !== 'anonymous' && (
              <span style={{ marginLeft:4, padding:'1px 5px', background:'rgba(255,255,255,0.04)', borderRadius:4 }}>
                {view.created_by}
              </span>
            )}
          </div>
        </div>
        <div style={{ display:'flex', gap:5, flexShrink:0 }}>
          <button className="btn btn-sm btn-primary" onClick={onLoad}>Load</button>
          <button onClick={onDelete} style={{ background:'none', border:'1px solid transparent', padding:'4px 6px',
            borderRadius:6, cursor:'pointer', color:'var(--text-muted)', transition:'all .15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--error)'; e.currentTarget.style.color = 'var(--error)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}>
            <Trash2 size={13}/>
          </button>
        </div>
      </div>
    </div>
  )
}
