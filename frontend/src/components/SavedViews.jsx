import React, { useState } from 'react'
import { useStore } from '../store'
import { X, Save, Trash2, BookMarked, Check, Columns, Filter } from 'lucide-react'

export default function SavedViews() {
  const { views, saveView, loadView, deleteView, showViews, setShowViews } = useStore()
  const [newName, setNewName] = useState('')
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)

  const handleSave = async () => {
    if (!newName.trim()) return
    setSaving(true)
    await saveView(newName.trim())
    setNewName(''); setSaving(false); setSaved(true)
    setTimeout(()=>setSaved(false), 2000)
  }

  if (!showViews) return null

  return (
    <>
      <div style={{ position:'fixed', inset:0, zIndex:150, background:'rgba(0,0,0,.3)' }} onClick={()=>setShowViews(false)}/>
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:360,
        background:'var(--bg2)', borderLeft:'1px solid var(--border)', zIndex:151,
        display:'flex', flexDirection:'column', boxShadow:'var(--shadow)' }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'16px 20px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <BookMarked size={16} style={{ color:'var(--accent)' }}/>
            <span style={{ fontWeight:700, fontSize:15 }}>Saved Views</span>
            {views.length > 0 && <span className="badge badge-accent">{views.length}</span>}
          </div>
          <button onClick={()=>setShowViews(false)}
            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text2)', padding:4 }}>
            <X size={18}/>
          </button>
        </div>

        {/* Save New */}
        <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', background:'var(--bg3)' }}>
          <div style={{ fontSize:11, fontWeight:600, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:8 }}>
            Save Current View
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <input className="input" placeholder="Enter view name..." value={newName}
              onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSave()}
              style={{ fontSize:13 }}/>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving||!newName.trim()}
              style={saved?{background:'var(--success)',borderColor:'var(--success)'}:{}}>
              {saved ? <Check size={15}/> : <Save size={15}/>}
            </button>
          </div>
          <div style={{ fontSize:11, color:'var(--text3)', marginTop:8 }}>
            Saves current columns, filters, and sort order
          </div>
        </div>

        {/* Views List */}
        <div style={{ flex:1, overflowY:'auto', padding:'12px' }}>
          {views.length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px 20px', color:'var(--text3)' }}>
              <BookMarked size={36} style={{ opacity:.2, marginBottom:12 }}/>
              <div style={{ fontSize:14, fontWeight:600, marginBottom:6 }}>No saved views yet</div>
              <div style={{ fontSize:12 }}>Set up your columns and filters, then save as a view</div>
            </div>
          ) : views.map(view => (
            <ViewCard key={view.id} view={view}
              onLoad={()=>{ loadView(view); setShowViews(false) }}
              onDelete={()=>deleteView(view.id)}/>
          ))}
        </div>
      </div>
    </>
  )
}

function ViewCard({ view, onLoad, onDelete }) {
  const [hov, setHov] = useState(false)
  return (
    <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ padding:'12px 14px', borderRadius:10, border:'1px solid var(--border2)',
        marginBottom:8, background:hov?'var(--bg3)':'transparent', transition:'all .15s' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:600, fontSize:13, marginBottom:6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {view.name}
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:6 }}>
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
          </div>
          <div style={{ fontSize:10, color:'var(--text3)' }}>
            Saved {new Date(view.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
          </div>
        </div>
        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
          <button className="btn btn-sm btn-primary" onClick={onLoad}>Load</button>
          <button onClick={onDelete} style={{ background:'none', border:'1px solid transparent', padding:'4px 6px',
            borderRadius:6, cursor:'pointer', color:'var(--text3)', transition:'all .15s' }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--error)';e.currentTarget.style.color='var(--error)'}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='transparent';e.currentTarget.style.color='var(--text3)'}}>
            <Trash2 size={13}/>
          </button>
        </div>
      </div>
    </div>
  )
}
