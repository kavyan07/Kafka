import React, { useState, useCallback } from 'react'
import { useStore } from '../store'
import { Eye, EyeOff, GripVertical, ChevronDown, ChevronRight } from 'lucide-react'

export default function Sidebar() {
  const { schema, selectedColumns, setSelectedColumns, columnOrder, setColumnOrder } = useStore()
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState({})
  const [dragging, setDragging] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  // Group columns by suffix type
  const groups = {}
  schema.forEach(f => {
    const type = f.type || 'string'
    if (!groups[type]) groups[type] = []
    groups[type].push(f)
  })

  const filtered = schema.filter(f =>
    f.label.toLowerCase().includes(search.toLowerCase()) ||
    f.name.toLowerCase().includes(search.toLowerCase())
  )

  const toggleColumn = (name) => {
    setSelectedColumns(
      selectedColumns.includes(name)
        ? selectedColumns.filter(c => c !== name)
        : [...selectedColumns, name]
    )
  }

  const toggleAll = () => {
    if (selectedColumns.length === schema.length) {
      setSelectedColumns([])
    } else {
      setSelectedColumns(schema.map(f => f.name))
    }
  }

  // Drag to reorder
  const onDragStart = (e, name) => {
    setDragging(name)
    e.dataTransfer.effectAllowed = 'move'
  }
  const onDragOver = (e, name) => {
    e.preventDefault()
    setDragOver(name)
  }
  const onDrop = (e, name) => {
    e.preventDefault()
    if (!dragging || dragging === name) return
    const order = [...(columnOrder.length ? columnOrder : selectedColumns)]
    const fromIdx = order.indexOf(dragging)
    const toIdx = order.indexOf(name)
    if (fromIdx === -1 || toIdx === -1) return
    order.splice(fromIdx, 1)
    order.splice(toIdx, 0, dragging)
    setColumnOrder(order)
    setDragging(null)
    setDragOver(null)
  }

  const typeColors = {
    string: '#6c63ff',
    integer: '#43e97b',
    float: '#f9c74f',
    boolean: '#ff6584',
    date: '#4fc3f7',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Search */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <input
          className="input"
          placeholder="Search columns..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ fontSize: '12px' }}
        />
      </div>

      {/* Header actions */}
      <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
          Columns ({selectedColumns.length}/{schema.length})
        </span>
        <button
          className="btn btn-sm"
          onClick={toggleAll}
          style={{ fontSize: '11px', padding: '2px 8px' }}
        >
          {selectedColumns.length === schema.length ? 'None' : 'All'}
        </button>
      </div>

      {/* Column List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px' }}>
        {filtered.map(field => {
          const isSelected = selectedColumns.includes(field.name)
          const isOver = dragOver === field.name
          return (
            <div
              key={field.name}
              draggable
              onDragStart={e => onDragStart(e, field.name)}
              onDragOver={e => onDragOver(e, field.name)}
              onDrop={e => onDrop(e, field.name)}
              onDragEnd={() => { setDragging(null); setDragOver(null) }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 8px',
                borderRadius: 6,
                marginBottom: 2,
                cursor: 'grab',
                background: isOver ? 'var(--bg3)' : 'transparent',
                border: isOver ? '1px dashed var(--accent)' : '1px solid transparent',
                opacity: dragging === field.name ? .4 : 1,
                transition: 'all .1s',
              }}
            >
              <GripVertical size={12} color="var(--text3)" style={{ flexShrink: 0 }} />

              {/* Type dot */}
              <span style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: typeColors[field.type] || '#888',
              }} />

              {/* Label */}
              <span
                onClick={() => toggleColumn(field.name)}
                style={{
                  flex: 1,
                  fontSize: 12,
                  color: isSelected ? 'var(--text)' : 'var(--text3)',
                  cursor: 'pointer',
                  fontWeight: isSelected ? 500 : 400,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={field.name}
              >
                {field.label}
              </span>

              {/* Toggle */}
              <button
                onClick={() => toggleColumn(field.name)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: isSelected ? 'var(--accent)' : 'var(--text3)' }}
              >
                {isSelected ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text3)', fontSize: 12 }}>
            No columns found
          </div>
        )}
      </div>

      {/* Type Legend */}
      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {Object.entries(typeColors).map(([type, color]) => (
          <span key={type} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text3)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
            {type}
          </span>
        ))}
      </div>
    </div>
  )
}
