import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useStore } from '../store/index'
import {
  Search, Eye, EyeOff, GripVertical, ChevronDown, ChevronRight,
  Layers, Hash, FileText, ToggleLeft, Calendar, Link,
  CheckSquare, Square, RotateCcw, Save, Sparkles,
  DollarSign, Tag, Package, BarChart2, Clock,
} from 'lucide-react'

const GROUP_RULES = [
  { id: 'pricing',    label: 'Pricing',       icon: 'dollar',  color: '#f59e0b', keywords: ['price', 'cost', 'amount', 'map', 'msrp', 'fee', 'rate', 'margin'] },
  { id: 'product',    label: 'Product Info',  icon: 'package', color: '#00e5ff', keywords: ['name', 'sku', 'type', 'brand', 'category', 'product', 'title', 'description', 'parent'] },
  { id: 'inventory',  label: 'Inventory',     icon: 'bar',     color: '#22c55e', keywords: ['stock', 'quantity', 'qty', 'inventory', 'available', 'units'] },
  { id: 'violation',  label: 'MAP Violations',icon: 'tag',     color: '#f43f5e', keywords: ['violation', 'map_violation', 'screenshot', 'violation_date'] },
  { id: 'dates',      label: 'Dates & Times', icon: 'clock',   color: '#8b5cf6', keywords: ['date', 'time', 'change', 'updated', 'created', 'ingested'] },
  { id: 'urls',       label: 'Links & Media', icon: 'link',    color: '#60a5fa', keywords: ['url', 'link', 'image', 'photo', 'media', 'extracted'] },
  { id: 'identifiers',label: 'Identifiers',   icon: 'hash',    color: '#94a3b8', keywords: ['id', 'sku', 'code', 'ref', 'number', 'num'] },
]

function GroupIcon({ icon, color, size = 12 }) {
  const style = { color, flexShrink: 0 }
  if (icon === 'dollar')  return <DollarSign size={size} style={style} />
  if (icon === 'package') return <Package size={size} style={style} />
  if (icon === 'bar')     return <BarChart2 size={size} style={style} />
  if (icon === 'tag')     return <Tag size={size} style={style} />
  if (icon === 'clock')   return <Clock size={size} style={style} />
  if (icon === 'link')    return <Link size={size} style={style} />
  if (icon === 'hash')    return <Hash size={size} style={style} />
  return <Sparkles size={size} style={style} />
}

function assignGroup(fieldName, fieldLabel) {
  const h = (fieldName + ' ' + fieldLabel).toLowerCase()
  for (const r of GROUP_RULES) {
    if (r.keywords.some(kw => h.includes(kw))) return r.id
  }
  return 'other'
}

function getFieldIcon(field) {
  const t = field.type
  if (t === 'integer' || t === 'float') return <Hash size={11} style={{ color: '#f59e0b' }} />
  if (t === 'boolean')  return <ToggleLeft size={11} style={{ color: '#22c55e' }} />
  if (t === 'date')     return <Calendar size={11} style={{ color: '#8b5cf6' }} />
  const n = field.name.toLowerCase()
  if (n.includes('url') || n.includes('link') || n.includes('image'))
    return <Link size={11} style={{ color: '#60a5fa' }} />
  return <FileText size={11} style={{ color: '#94a3b8' }} />
}

export default function Sidebar() {
  const {
    schema, selectedColumns, columnOrder,
    setSelectedColumns, setColumnOrder, saveColumnConfig,
    selectedFile, stats,
  } = useStore()

  const [search,        setSearch]        = useState('')
  const [collapsed,     setCollapsed]     = useState({})
  const [groupMode,     setGroupMode]     = useState(true)
  const [dragItem,      setDragItem]      = useState(null)
  const [dragOverItem,  setDragOverItem]  = useState(null)
  const [dragOverGroup, setDragOverGroup] = useState(null)
  const [saved,         setSaved]         = useState(false)

  const SKIP = new Set(['id', '_version_', '_root_', 'source_file_s', 'ingested_at_dt', '_text_'])

  const fields = useMemo(() =>
    schema.filter(f => !SKIP.has(f.name) && !f.name.startsWith('_')),
    [schema]
  )

  const filtered = useMemo(() => {
    if (!search.trim()) return fields
    const q = search.toLowerCase()
    return fields.filter(f => f.name.toLowerCase().includes(q) || f.label.toLowerCase().includes(q))
  }, [fields, search])

  const effectiveOrder = useMemo(() => {
    const existing = new Set(fields.map(f => f.name))
    const ordered  = (columnOrder || []).filter(n => existing.has(n))
    fields.forEach(f => { if (!ordered.includes(f.name)) ordered.push(f.name) })
    return ordered
  }, [columnOrder, fields])

  const isSelected = (name) => selectedColumns.includes(name)

  const toggleColumn = (name) => {
    const next = isSelected(name)
      ? selectedColumns.filter(c => c !== name)
      : [...selectedColumns, name]
    setSelectedColumns(next)
    setTimeout(() => saveColumnConfig(), 300)
  }

  const selectAll  = () => { setSelectedColumns([...new Set([...selectedColumns, ...filtered.map(f => f.name)])]); setTimeout(() => saveColumnConfig(), 300) }
  const selectNone = () => { const names = new Set(filtered.map(f => f.name)); setSelectedColumns(selectedColumns.filter(c => !names.has(c))); setTimeout(() => saveColumnConfig(), 300) }
  const resetOrder = () => { setColumnOrder(fields.map(f => f.name)); setSelectedColumns(fields.slice(0, 10).map(f => f.name)); setTimeout(() => saveColumnConfig(), 300) }

  const handleSave = async () => {
    await saveColumnConfig()
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const groups = useMemo(() => {
    const map = {}
    GROUP_RULES.forEach(r => { map[r.id] = { ...r, fields: [] } })
    map.other = { id: 'other', label: 'Other', icon: 'sparkles', color: '#64748b', fields: [] }
    // Track seen field names globally to prevent any field appearing in multiple groups
    const seenNames = new Set()
    // Track seen labels per group to prevent duplicate-label columns within same group
    const seenLabelsPerGroup = {}
    effectiveOrder.forEach(name => {
      if (seenNames.has(name)) return // deduplicate by field name
      const field = fields.find(f => f.name === name)
      if (!field) return
      if (search && !filtered.find(f => f.name === name)) return
      const gid = assignGroup(field.name, field.label)
      const target = map[gid] || map.other
      if (!seenLabelsPerGroup[target.id]) seenLabelsPerGroup[target.id] = new Set()
      // Allow same label in different groups but not in same group
      if (!seenLabelsPerGroup[target.id].has(field.label)) {
        seenLabelsPerGroup[target.id].add(field.label)
        target.fields.push(field)
        seenNames.add(name)
      } else {
        // Label already in group — still track the name so it doesn't appear in 'other' either
        seenNames.add(name)
      }
    })
    return Object.values(map).filter(g => g.fields.length > 0)
  }, [effectiveOrder, fields, filtered, search])

  const flatList = useMemo(() =>
    effectiveOrder.map(n => fields.find(f => f.name === n)).filter(Boolean)
      .filter(f => !search || filtered.find(ff => ff.name === f.name)),
    [effectiveOrder, fields, filtered, search]
  )

  const onDragStart = (e, name) => { setDragItem(name); e.dataTransfer.effectAllowed = 'move' }
  const onDragOver  = (e, name) => { e.preventDefault(); setDragOverItem(name) }
  const onDrop = (e, targetName) => {
    e.preventDefault()
    if (!dragItem || dragItem === targetName) { cleanup(); return }
    const order   = [...effectiveOrder]
    const fromIdx = order.indexOf(dragItem)
    const toIdx   = order.indexOf(targetName)
    if (fromIdx < 0 || toIdx < 0) { cleanup(); return }
    order.splice(fromIdx, 1); order.splice(toIdx, 0, dragItem)
    setColumnOrder(order); cleanup()
    setTimeout(() => saveColumnConfig(), 400)
  }
  const onGroupDragOver = (e, gid) => { e.preventDefault(); setDragOverGroup(gid) }
  const onGroupDrop = (e, gid) => {
    e.preventDefault()
    if (!dragItem) { cleanup(); return }
    const tg = groups.find(g => g.id === gid)
    if (!tg || !tg.fields.length) { cleanup(); return }
    const last = tg.fields[tg.fields.length - 1]?.name
    if (!last) { cleanup(); return }
    const order = [...effectiveOrder]
    const fi = order.indexOf(dragItem), ti = order.indexOf(last)
    if (fi < 0 || ti < 0) { cleanup(); return }
    order.splice(fi, 1); order.splice(ti + (fi > ti ? 1 : 0), 0, dragItem)
    setColumnOrder(order); cleanup()
    setTimeout(() => saveColumnConfig(), 400)
  }
  const cleanup = () => { setDragItem(null); setDragOverItem(null); setDragOverGroup(null) }

  const selectedCount = selectedColumns.length
  const totalCount    = fields.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', userSelect: 'none' }}>

      {/* File badge */}
      {selectedFile && (
        <div style={{ padding: '8px 14px 0', flexShrink: 0 }}>
          <div style={{ padding: '5px 10px', borderRadius: 7, background: 'rgba(0,229,255,0.07)', border: '1px solid rgba(0,229,255,0.18)', fontSize: 10, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', boxShadow: '0 0 6px var(--accent)' }} />
            {selectedFile}
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ padding: '10px 14px 6px', flexShrink: 0 }}>
        <div style={{ position: 'relative' }}>
          <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', pointerEvents: 'none' }} />
          <input className="input" placeholder="Search columns…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', paddingLeft: 28, fontSize: 11, height: 30 }} />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ padding: '0 14px 8px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
          <span style={{ color: 'var(--accent)' }}>{selectedCount}</span>/{totalCount}
        </span>
        <div style={{ display: 'flex', gap: 3, marginLeft: 'auto' }}>
          <button onClick={selectAll}  title="Select all"  className="btn btn-xs" style={{ padding: '3px 7px' }}><CheckSquare size={10} /></button>
          <button onClick={selectNone} title="Select none" className="btn btn-xs" style={{ padding: '3px 7px' }}><Square size={10} /></button>
          <button onClick={() => setGroupMode(v => !v)} title={groupMode ? 'Flat view' : 'Grouped view'} className="btn btn-xs"
            style={{ padding: '3px 7px', borderColor: groupMode ? 'rgba(0,229,255,0.4)' : undefined, color: groupMode ? 'var(--accent)' : undefined }}>
            <Layers size={10} />
          </button>
          <button onClick={resetOrder} title="Reset" className="btn btn-xs" style={{ padding: '3px 7px' }}><RotateCcw size={10} /></button>
          <button onClick={handleSave} title="Save preferences" className="btn btn-xs"
            style={{ padding: '3px 7px', borderColor: saved ? 'rgba(34,197,94,0.5)' : undefined, color: saved ? 'var(--success)' : undefined }}>
            <Save size={10} />
          </button>
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--border)', flexShrink: 0 }} />

      {/* Column list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 12px' }}>
        {fields.length === 0 && (
          <p style={{ padding: '20px 8px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 11 }}>
            No schema loaded.<br />Select a file or fetch data.
          </p>
        )}
        {filtered.length === 0 && search && (
          <p style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 11 }}>
            No columns match "<span style={{ color: 'var(--accent)' }}>{search}</span>"
          </p>
        )}

        {groupMode
          ? groups.map(group => (
              <ColumnGroup key={group.id} group={group}
                collapsed={!!collapsed[group.id]}
                onToggleCollapse={() => setCollapsed(c => ({ ...c, [group.id]: !c[group.id] }))}
                selectedColumns={selectedColumns} onToggle={toggleColumn}
                dragItem={dragItem} dragOverItem={dragOverItem} dragOverGroup={dragOverGroup}
                onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}
                onGroupDragOver={onGroupDragOver} onGroupDrop={onGroupDrop} onDragEnd={cleanup}
              />
            ))
          : flatList.map(field => (
              <ColumnItem key={field.name} field={field}
                selected={isSelected(field.name)}
                isDragging={dragItem === field.name} isDragOver={dragOverItem === field.name}
                onToggle={() => toggleColumn(field.name)}
                onDragStart={e => onDragStart(e, field.name)} onDragOver={e => onDragOver(e, field.name)}
                onDrop={e => onDrop(e, field.name)} onDragEnd={cleanup}
              />
            ))
        }
      </div>

      {/* Footer */}
      <div style={{ flexShrink: 0, padding: '7px 14px', borderTop: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {stats?.total ? stats.total.toLocaleString() + ' docs' : 'No data'}
        </span>
        <span style={{ fontSize: 9, color: selectedCount > 0 ? 'var(--accent)' : 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
          {selectedCount} shown
        </span>
      </div>
    </div>
  )
}

function ColumnGroup({ group, collapsed, onToggleCollapse, selectedColumns, onToggle, dragItem, dragOverItem, dragOverGroup, onDragStart, onDragOver, onDrop, onGroupDragOver, onGroupDrop, onDragEnd }) {
  const selectedInGroup = group.fields.filter(f => selectedColumns.includes(f.name)).length
  const isDragTarget    = dragOverGroup === group.id
  return (
    <div style={{ marginBottom: 3 }} onDragOver={e => onGroupDragOver(e, group.id)} onDrop={e => onGroupDrop(e, group.id)}>
      <button onClick={onToggleCollapse} style={{
        display: 'flex', alignItems: 'center', gap: 7, width: '100%', padding: '5px 8px', marginBottom: 1,
        background: isDragTarget ? 'rgba(0,229,255,0.05)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${isDragTarget ? 'rgba(0,229,255,0.2)' : 'transparent'}`,
        borderRadius: 7, cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s',
      }}>
        <GroupIcon icon={group.icon} color={group.color} size={12} />
        <span style={{ flex: 1, fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {group.label}
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)', padding: '1px 6px', borderRadius: 999,
          background: selectedInGroup > 0 ? group.color + '22' : 'rgba(255,255,255,0.05)',
          color: selectedInGroup > 0 ? group.color : 'var(--text-dim)',
          border: `1px solid ${selectedInGroup > 0 ? group.color + '44' : 'transparent'}`,
        }}>{selectedInGroup}/{group.fields.length}</span>
        {collapsed ? <ChevronRight size={11} style={{ color: 'var(--text-dim)', flexShrink: 0 }} /> : <ChevronDown size={11} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />}
      </button>
      {!collapsed && (
        <div style={{ paddingLeft: 6 }}>
          {group.fields.map(field => (
            <ColumnItem key={field.name} field={field} selected={selectedColumns.includes(field.name)}
              isDragging={dragItem === field.name} isDragOver={dragOverItem === field.name}
              onToggle={() => onToggle(field.name)}
              onDragStart={e => onDragStart(e, field.name)} onDragOver={e => onDragOver(e, field.name)}
              onDrop={e => onDrop(e, field.name)} onDragEnd={onDragEnd} accentColor={group.color}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ColumnItem({ field, selected, isDragging, isDragOver, onToggle, onDragStart, onDragOver, onDrop, onDragEnd, accentColor = 'var(--accent)' }) {
  return (
    <div draggable onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd}
      className={`col-item ${selected ? 'active' : ''}`}
      onClick={onToggle}
      style={{
        opacity: isDragging ? 0.3 : 1,
        background: isDragOver ? 'rgba(0,229,255,0.07)' : selected ? accentColor + '12' : undefined,
        borderColor: isDragOver ? 'rgba(0,229,255,0.45)' : selected ? accentColor + '33' : undefined,
        transform: isDragOver ? 'translateX(4px)' : undefined,
        transition: 'all 0.1s', cursor: 'grab',
      }}>
      <GripVertical size={11} style={{ color: 'var(--text-faint)', flexShrink: 0, cursor: 'grab' }} />
      <span style={{ flexShrink: 0 }}>{getFieldIcon(field)}</span>
      <span className="col-label" style={{ color: selected ? 'var(--text)' : undefined }}>{field.label}</span>
      <span style={{ flexShrink: 0, opacity: selected ? 1 : 0.25, color: selected ? accentColor : 'var(--text-dim)', transition: 'all 0.15s' }}>
        {selected ? <Eye size={11} /> : <EyeOff size={11} />}
      </span>
    </div>
  )
}
