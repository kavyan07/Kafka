import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useStore } from '../store/index'
import {
  ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight,
  HelpCircle, ExternalLink, Loader, Download, GripVertical,
} from 'lucide-react'

const INTERNAL = new Set(['id', '_version_', '_root_', 'source_file_s', 'ingested_at_dt', '_text_'])
const PRICE_KEYS = ['price', 'cost', 'amount', 'value', 'fee', 'rate', 'msrp', 'map']
const isPriceField = (f) => PRICE_KEYS.some(k => (f || '').toLowerCase().includes(k))
const isStockField = (f) => (f || '').toLowerCase().includes('stock')

// Virtual scrolling constants
const ROW_HEIGHT = 38
const BUFFER_ROWS = 10

export default function DataTable() {
  const {
    results, total, loading, page, rows,
    setPage, selectedColumns, columnOrder, columnWidths,
    setColumnWidth, setColumnOrder, sort, setSort, schema, queryError,
    saveColumnConfig,
  } = useStore()

  const [resizing,   setResizing]   = useState(null)
  const [dragging,   setDragging]   = useState(null)
  const [dragOver,   setDragOver]   = useState(null)
  const [scrollTop,  setScrollTop]  = useState(0)
  const [tableHeight, setTableHeight] = useState(400)

  const startX    = useRef(0)
  const startW    = useRef(0)
  const tableRef  = useRef(null)
  const bodyRef   = useRef(null)

  // Measure container height
  useEffect(() => {
    if (!tableRef.current) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) setTableHeight(entry.contentRect.height - 120)
    })
    ro.observe(tableRef.current)
    return () => ro.disconnect()
  }, [])

  // ── fieldName → label (1:1, no merging)
  const fieldLabelMap = useMemo(() => {
    const m = {}
    schema.forEach(f => { if (!INTERNAL.has(f.name)) m[f.name] = f.label })
    return m
  }, [schema])

  // ── STRICTLY respect selectedColumns — only show what user checked
  // Order by columnOrder if available, otherwise selectedColumns order
  // Deduplicate by label so fields like BBB_SKU_s + BBB_SKU_i don't show twice
  const cols = useMemo(() => {
    // Base order: columnOrder filtered to only selected
    const ordered = columnOrder.length
      ? columnOrder.filter(name => selectedColumns.includes(name))
      : [...selectedColumns]

    // Filter to valid schema fields only (not internal)
    const valid = ordered.filter(name =>
      !INTERNAL.has(name) && schema.some(f => f.name === name)
    )

    // Build columns deduplicating by LABEL — first field wins per label
    const seenLabels = new Set()
    return valid
      .map(name => ({ fieldName: name, label: fieldLabelMap[name] || name }))
      .filter(({ label }) => {
        if (seenLabels.has(label)) return false
        seenLabels.add(label)
        return true
      })
  }, [columnOrder, selectedColumns, schema, fieldLabelMap])

  // ── getValue: try the exact fieldName first, then try sibling fields that share the same label
  // This handles cases where BBB_SKU_s is selected but data comes back as BBB_SKU_i
  const getValue = useCallback((row, fieldName) => {
    // 1. Try exact field name first
    const direct = row[fieldName]
    if (direct != null && direct !== '') return { val: direct, field: fieldName }

    // 2. Try other fields in schema that share the same label (type variants)
    const label = fieldLabelMap[fieldName]
    if (label) {
      for (const f of schema) {
        if (f.name !== fieldName && fieldLabelMap[f.name] === label) {
          const v = row[f.name]
          if (v != null && v !== '') return { val: v, field: f.name }
        }
      }
    }

    return { val: null, field: fieldName }
  }, [schema, fieldLabelMap])

  // ── Column resize (keyed by fieldName)
  const startResize = useCallback((e, fieldName) => {
    e.preventDefault(); e.stopPropagation()
    setResizing(fieldName)
    startX.current = e.clientX
    startW.current = columnWidths[fieldName] || 150
    const move = ev => setColumnWidth(fieldName, Math.max(60, startW.current + ev.clientX - startX.current))
    const up   = () => {
      setResizing(null)
      saveColumnConfig()
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }, [columnWidths, setColumnWidth, saveColumnConfig])

  // ── Column drag reorder (by fieldName)
  const handleDragStart = (e, fieldName) => {
    setDragging(fieldName)
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleDragOver = (e, fieldName) => {
    e.preventDefault()
    setDragOver(fieldName)
  }
  const handleDrop = (e, targetFieldName) => {
    e.preventDefault()
    if (!dragging || dragging === targetFieldName) { setDragging(null); setDragOver(null); return }
    const names   = cols.map(c => c.fieldName)
    const fromIdx = names.indexOf(dragging)
    const toIdx   = names.indexOf(targetFieldName)
    if (fromIdx < 0 || toIdx < 0) { setDragging(null); setDragOver(null); return }
    names.splice(fromIdx, 1)
    names.splice(toIdx, 0, dragging)
    setColumnOrder(names)
    setDragging(null); setDragOver(null)
    setTimeout(() => saveColumnConfig(), 500)
  }
  const handleDragEnd = () => { setDragging(null); setDragOver(null) }

  // ── Sort (by fieldName directly)
  const handleSort = (fieldName) => {
    if (!sort.startsWith(fieldName))  setSort(`${fieldName} asc`)
    else if (sort.endsWith('asc'))    setSort(`${fieldName} desc`)
    else                              setSort('score desc')
  }

  const sortIcon = (fieldName) => {
    if (!sort.startsWith(fieldName)) return <ArrowUpDown size={10} style={{ opacity: .2 }} />
    return sort.endsWith('asc')
      ? <ArrowUp size={10} style={{ color: 'var(--accent)' }} />
      : <ArrowDown size={10} style={{ color: 'var(--accent)' }} />
  }

  // ── Virtual scrolling
  const visibleRows = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS)
    const end   = Math.min(results.length, start + Math.ceil(tableHeight / ROW_HEIGHT) + BUFFER_ROWS * 2)
    return { start, end, rows: results.slice(start, end), offsetTop: start * ROW_HEIGHT }
  }, [results, scrollTop, tableHeight])

  const totalPages = Math.max(1, Math.ceil(total / rows))

  // ── CSV Export
  const handleExport = () => {
    if (!results.length) return
    const headers = cols.map(c => c.label)
    const csvRows = results.map(row => cols.map(c => {
      const { val } = getValue(row, c.fieldName)
      const v = String(val ?? '')
      return v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v
    }).join(','))
    const blob = new Blob(['\uFEFF' + [headers.join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `export_${Date.now()}.csv` })
    a.click(); URL.revokeObjectURL(a.href)
  }

  if (loading && results.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <Loader size={32} className="animate-spin" style={{ color: 'var(--accent)', filter: 'drop-shadow(0 0 12px rgba(0,229,255,0.5))' }} />
        <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>Fetching records…</span>
      </div>
    )
  }

  if (results.length === 0 && !loading) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40 }}>
        <HelpCircle size={44} style={{ opacity: .2, color: 'var(--accent)' }} />
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>
            {queryError ? 'Query Error' : 'No Results Found'}
          </h3>
          <p style={{ maxWidth: 380, lineHeight: 1.7, fontSize: 13, color: 'var(--text-muted)' }}>
            {queryError || 'Try adjusting your filters or indexing new CSV data using the Index CSV button.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div ref={tableRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {loading && <div className="loading-bar" />}

      {/* Table */}
      <div ref={bodyRef} style={{ flex: 1, overflow: 'auto' }}
        onScroll={e => setScrollTop(e.currentTarget.scrollTop)}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12, tableLayout: 'fixed' }}>
          <thead className="table-thead">
            <tr>
              {cols.map(({ fieldName, label }) => {
                const active  = sort.startsWith(fieldName)
                const isPrice = isPriceField(fieldName) || isPriceField(label)
                const w       = columnWidths[fieldName] || 160
                return (
                  <th key={fieldName}
                    draggable
                    onDragStart={e => handleDragStart(e, fieldName)}
                    onDragOver={e  => handleDragOver(e, fieldName)}
                    onDrop={e      => handleDrop(e, fieldName)}
                    onDragEnd={handleDragEnd}
                    style={{
                      width: w, minWidth: w, maxWidth: w,
                      padding: '11px 14px', textAlign: 'left', fontWeight: 700, fontSize: 10,
                      letterSpacing: '.1em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                      background: dragOver === fieldName ? 'rgba(0,229,255,0.08)' : 'var(--bg3)',
                      borderBottom: '2px solid rgba(0,229,255,0.12)',
                      color: active ? 'var(--accent)' : isPrice ? 'rgba(245,158,11,0.8)' : 'var(--text-muted)',
                      userSelect: 'none', position: 'relative', cursor: 'grab',
                      borderRight: '1px solid var(--border)',
                      transition: 'background 0.15s, color 0.15s',
                      opacity: dragging === fieldName ? 0.4 : 1,
                    }}
                    onClick={() => handleSort(fieldName)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                      <GripVertical size={10} style={{ opacity: .3, flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
                      {sortIcon(fieldName)}
                    </div>
                    {/* Resize handle */}
                    <div onMouseDown={e => startResize(e, fieldName)}
                      style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, cursor: 'col-resize', background: resizing === fieldName ? 'var(--accent)' : 'transparent', zIndex: 1 }} />
                  </th>
                )
              })}
            </tr>
          </thead>

          {/* Virtual scrolling body */}
          <tbody>
            {/* Spacer top */}
            {visibleRows.offsetTop > 0 && (
              <tr><td colSpan={cols.length} style={{ height: visibleRows.offsetTop, padding: 0, border: 'none' }} /></tr>
            )}

            {visibleRows.rows.map((row, ri) => {
              const absIdx = visibleRows.start + ri
              return (
                <tr key={absIdx} className={absIdx % 2 === 0 ? 'table-row-even' : 'table-row-odd'} style={{ height: ROW_HEIGHT }}>
                  {cols.map(({ fieldName, label }) => {
                    const { val, field } = getValue(row, fieldName)
                    const w = columnWidths[fieldName] || 160
                    return (
                      <td key={fieldName} style={{
                        padding: '0 14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        width: w, maxWidth: w, height: ROW_HEIGHT,
                        borderBottom: '1px solid var(--border)',
                        borderRight: '1px solid rgba(255,255,255,0.025)',
                      }} title={val != null ? String(val) : ''}>
                        <Cell value={val} field={field} label={label} />
                      </td>
                    )
                  })}
                </tr>
              )
            })}

            {/* Spacer bottom */}
            {(() => {
              const bottomSpace = (results.length - visibleRows.end) * ROW_HEIGHT
              return bottomSpace > 0
                ? <tr><td colSpan={cols.length} style={{ height: bottomSpace, padding: 0, border: 'none' }} /></tr>
                : null
            })()}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '9px 18px', borderTop: '1px solid var(--border)',
        background: 'var(--bg2)', flexShrink: 0, gap: 12,
      }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
          {((page - 1) * rows + 1).toLocaleString()}–{Math.min(page * rows, total).toLocaleString()}
          <span style={{ color: 'var(--text-dim)', margin: '0 4px' }}>of</span>
          <strong style={{ color: 'var(--accent)' }}>{total.toLocaleString()}</strong>
        </span>

        {/* Export button */}
        <button className="btn btn-sm" onClick={handleExport} style={{ gap: 5 }}>
          <Download size={12} /> Export CSV
        </button>

        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} style={{ gap: 4 }}>
            <ChevronLeft size={13} /> Prev
          </button>

          {(() => {
            const pages = []; const delta = 2
            const start = Math.max(1, page - delta); const end = Math.min(totalPages, page + delta)
            if (start > 1) { pages.push(1); if (start > 2) pages.push('...') }
            for (let n = start; n <= end; n++) pages.push(n)
            if (end < totalPages) { if (end < totalPages - 1) pages.push('...'); pages.push(totalPages) }
            return pages.map((n, i) =>
              n === '...'
                ? <span key={`e${i}`} style={{ color: 'var(--text-dim)', fontSize: 12, padding: '0 4px', fontFamily: 'var(--font-mono)' }}>…</span>
                : <button key={n} onClick={() => setPage(n)} className={`pagination-btn ${page === n ? 'active' : ''}`}>{n}</button>
            )
          })()}

          <button className="btn btn-sm" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} style={{ gap: 4 }}>
            Next <ChevronRight size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Cell renderer ─────────────────────────────────────────────────────────────
function Cell({ value, field, label }) {
  if (value == null || value === '')
    return <span style={{ opacity: .2, fontStyle: 'italic', fontSize: 11, fontFamily: 'var(--font-mono)' }}>—</span>

  if (typeof value === 'boolean')
    return value ? <span className="badge badge-success">True</span> : <span className="badge badge-error">False</span>

  if (field?.endsWith('_dt') || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)))
    return <span style={{ color: 'var(--accent2)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{new Date(value).toLocaleDateString()}</span>

  if (isStockField(field || label)) {
    const v = String(value).toLowerCase().trim()
    if (v === 'in stock') return <span className="badge badge-success">In Stock</span>
    if (v === 'out of stock') return <span className="badge badge-error">Out of Stock</span>
    return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{String(value)}</span>
  }

  if (isPriceField(field || label)) {
    const numVal = typeof value === 'number' ? value : parseFloat(value)
    if (!isNaN(numVal)) return (
      <span style={{ color: 'var(--amber)', fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: 12, textShadow: '0 0 6px rgba(245,158,11,0.3)' }}>
        {numVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    )
  }

  if (field?.endsWith('_f') || field?.endsWith('_i') || typeof value === 'number') {
    const numVal = typeof value === 'number' ? value : parseFloat(value)
    if (!isNaN(numVal)) return (
      <span style={{ color: 'var(--amber)', fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        {numVal.toLocaleString()}
      </span>
    )
  }

  if (typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'))) {
    if (/\.(jpg|jpeg|png|gif|webp)$/i.test(value))
      return <img src={value} alt="" style={{ height: 26, borderRadius: 4, border: '1px solid var(--border)' }} onError={e => e.target.style.display = 'none'} />
    return (
      <a href={value} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11 }}>
        <ExternalLink size={10} /> Link
      </a>
    )
  }

  return <span style={{ color: 'var(--text)' }}>{String(value)}</span>
}
