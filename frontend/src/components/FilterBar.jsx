import React, { useState } from 'react'
import { useStore } from '../store/index'
import {
  Filter, Plus, Trash2, ChevronDown, ChevronUp, X, AlertCircle,
  Hash, FileText, Globe, RefreshCw, Layers, ToggleLeft,
  Calendar, List, Search, GitMerge, Zap,
} from 'lucide-react'

const FILTER_TYPES = [
  { value: 'text',         label: 'Contains'     },
  { value: 'exact',        label: 'Exact Match'  },
  { value: 'number_range', label: 'Number Range' },
  { value: 'date_range',   label: 'Date Range'   },
  { value: 'multi_select', label: 'Multi Select' },
  { value: 'boolean',      label: 'Boolean'      },
]

const defaultFilter = () => ({
  field: '', type: 'text', value: '', op: 'AND',
  min: '', max: '', from: '', to: '',
})

export default function FilterBar() {
  const {
    filters, addFilter, removeFilter, updateFilter, clearFilters,
    query, loading,
    facets, fetchFacets, schema,
    stats, queryError,
    selectedFile, setSelectedFile, schemaLoading,
    useAdvancedFilters, setUseAdvancedFilters,
    filterGroups, addFilterGroup, removeFilterGroup,
    addConditionToGroup, updateCondition, removeCondition, setGroupOp,
    dateRange, setDateRange, compareMode, setCompareMode,
    compareType, setCompareType, compareResult,
  } = useStore()

  const [open, setOpen]               = useState(true)
  const [showDatePanel, setShowDatePanel] = useState(false)

  const csvFiles   = stats?.files?.map(f => f.file) ?? []
  const userFilters = filters.filter(f => f.field !== 'source_file_s')

  const handleAdd = () => {
    addFilter(defaultFilter())
    setOpen(true)
  }

  // ── Run Query: explicit button, always fires immediately
  const handleRunQuery = () => {
    query()
  }

  return (
    <div className="filter-glass" style={{ flexShrink: 0, zIndex: 100 }}>

      {/* ── Header row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px', flexWrap: 'wrap' }}>

        {/* Collapse toggle */}
        <button onClick={() => setOpen(v => !v)} style={{
          display: 'flex', alignItems: 'center', gap: 7,
          background: 'none', border: 'none', cursor: 'pointer',
          color: userFilters.length > 0 ? 'var(--accent)' : 'var(--text-muted)',
          fontWeight: 700, fontSize: 12, padding: 0, fontFamily: 'var(--font)',
        }}>
          <Filter size={14} />
          Filters
          {userFilters.length > 0 && (
            <span className="badge badge-accent" style={{ fontSize: 9, padding: '2px 7px' }}>
              {userFilters.length}
            </span>
          )}
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>

        {/* CSV file selector */}
        {csvFiles.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select className="input" style={{
              width: 200, fontWeight: 700, fontSize: 11,
              borderColor: selectedFile ? 'rgba(0,229,255,0.35)' : 'var(--border-strong)',
              color: selectedFile ? 'var(--accent)' : 'var(--text)',
              background: selectedFile ? 'rgba(0,229,255,0.04)' : 'rgba(0,0,0,0.3)',
            }} value={selectedFile} onChange={e => setSelectedFile(e.target.value)}>
              <option value="">All files ({stats?.total?.toLocaleString()})</option>
              {csvFiles.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            {schemaLoading && <RefreshCw size={11} className="animate-spin" style={{ color: 'var(--accent)' }} />}
          </div>
        )}

        {/* Date panel toggle */}
        <button onClick={() => setShowDatePanel(v => !v)} className="btn btn-sm" style={{
          borderColor: showDatePanel ? 'rgba(0,229,255,0.4)' : undefined,
          color: showDatePanel ? 'var(--accent)' : undefined,
        }}>
          <Calendar size={12} /> Date
          {compareMode && <span className="badge badge-accent" style={{ fontSize: 8, padding: '1px 5px' }}>CMP</span>}
        </button>

        {/* Advanced toggle */}
        <button onClick={() => setUseAdvancedFilters(!useAdvancedFilters)} className="btn btn-sm" style={{
          borderColor: useAdvancedFilters ? 'rgba(139,92,246,0.5)' : undefined,
          color: useAdvancedFilters ? 'var(--accent2)' : undefined,
        }}>
          <Layers size={12} /> {useAdvancedFilters ? 'Advanced' : 'Simple'}
        </button>

        <div style={{ flex: 1 }} />

        {/* Add / Clear */}
        <button className="btn btn-sm" onClick={handleAdd}>
          <Plus size={13} /> Add Filter
        </button>
        {userFilters.length > 0 && (
          <button className="btn btn-sm btn-danger" onClick={clearFilters}>
            <Trash2 size={12} /> Clear
          </button>
        )}

        {/* ── RUN QUERY — always calls query() directly ── */}
        <button
          id="run-query-btn"
          className="btn btn-primary"
          onClick={handleRunQuery}
          disabled={loading}
          style={{ minWidth: 110, gap: 6 }}
        >
          {loading
            ? <><RefreshCw size={12} className="animate-spin" /> Running…</>
            : <><Zap size={12} fill="currentColor" /> Run Query</>}
        </button>
      </div>

      {/* ── Active file strip ── */}
      {selectedFile && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '4px 18px',
          background: 'rgba(0,229,255,0.03)', borderTop: '1px solid rgba(0,229,255,0.07)', fontSize: 11,
        }}>
          <span style={{ color: 'var(--text-dim)' }}>WHERE</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent)', fontSize: 11 }}>source_file</span>
          <span style={{ color: 'var(--text-dim)' }}>=</span>
          <span className="badge badge-accent" style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{selectedFile}</span>
          <button onClick={() => setSelectedFile('')} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '0 4px', display: 'flex', alignItems: 'center' }}>
            <X size={11} />
          </button>
        </div>
      )}

      {/* ── Date compare panel ── */}
      {showDatePanel && (
        <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', background: 'rgba(0,229,255,0.02)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>From</span>
          <input type="date" className="input" style={{ fontSize: 11, width: 155 }}
            value={dateRange.from} onChange={e => setDateRange({ ...dateRange, from: e.target.value })} />
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>→</span>
          <input type="date" className="input" style={{ fontSize: 11, width: 155 }}
            value={dateRange.to} onChange={e => setDateRange({ ...dateRange, to: e.target.value })} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={compareMode} onChange={e => setCompareMode(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
            <GitMerge size={12} /> Compare Period
          </label>
          {compareMode && (
            <select className="input" style={{ fontSize: 11, width: 200 }}
              value={compareType} onChange={e => setCompareType(e.target.value)}>
              <option value="previous_period">vs Previous Period</option>
              <option value="same_period_last_year">vs Same Period Last Year</option>
            </select>
          )}
          {compareResult && <CompareResultBadge compareResult={compareResult} />}
        </div>
      )}

      {/* ── Filter rows ── */}
      {open && (
        <div style={{ padding: '4px 18px 12px' }}>
          {useAdvancedFilters
            ? <AdvancedFilterBuilder
                groups={filterGroups || []}
                schema={schema}
                facets={facets}
                fetchFacets={fetchFacets}
                onAddGroup={addFilterGroup}
                onRemoveGroup={removeFilterGroup}
                onAddCondition={addConditionToGroup}
                onUpdateCondition={updateCondition}
                onRemoveCondition={removeCondition}
                onSetGroupOp={setGroupOp}
              />
            : <SimpleFilters
                filters={filters}
                schema={schema}
                facets={facets}
                fetchFacets={fetchFacets}
                onUpdate={updateFilter}
                onRemove={removeFilter}
                onAdd={handleAdd}
              />
          }
        </div>
      )}

      {/* ── Query error ── */}
      {queryError && (
        <div style={{ margin: '0 18px 12px', padding: '8px 12px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--error)' }}>
          <AlertCircle size={13} />
          <span style={{ flex: 1 }}>{queryError}</span>
          <button className="btn btn-sm" onClick={handleRunQuery} style={{ background: 'var(--error)', color: '#fff', border: 'none' }}>Retry</button>
        </div>
      )}
    </div>
  )
}

// ── Compare badge ─────────────────────────────────────────────────────────────
function CompareResultBadge({ compareResult }) {
  const { difference, current, compare } = compareResult
  const abs = difference?.absolute ?? 0
  const pct = difference?.percentage
  const isUp = abs >= 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 11 }}>
      <Metric label="Current"  value={current?.total?.toLocaleString()} color="var(--accent)" />
      <Metric label="Previous" value={compare?.total?.toLocaleString()} color="var(--text-muted)" />
      <Metric label="Change"   value={(isUp ? '▲ ' : '▼ ') + (pct !== null ? Math.abs(pct) + '%' : Math.abs(abs))} color={isUp ? 'var(--success)' : 'var(--error)'} />
    </div>
  )
}
function Metric({ label, value, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{label}</span>
      <span style={{ color, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  )
}

// ── Simple flat filters ───────────────────────────────────────────────────────
const SKIP = new Set(['id', '_version_', '_root_', 'source_file_s', 'ingested_at_dt', '_text_'])

function SimpleFilters({ filters, schema, facets, fetchFacets, onUpdate, onRemove, onAdd }) {
  const userFilters = filters
    .map((f, i) => ({ ...f, _idx: i }))
    .filter(f => f.field !== 'source_file_s')

  const handleFieldChange = (idx, field) => {
    const schField = schema.find(s => s.name === field)
    let type = 'text'
    if (schField) {
      if (schField.type === 'integer' || schField.type === 'float') type = 'number_range'
      else if (schField.type === 'date')    type = 'date_range'
      else if (schField.type === 'boolean') type = 'boolean'
    }
    onUpdate(idx, { field, type, value: '', min: '', max: '', from: '', to: '' })
    if (field && (type === 'text' || type === 'exact')) fetchFacets([field])
  }

  if (userFilters.length === 0) {
    return (
      <div onClick={onAdd} style={{
        margin: '4px 0 0', padding: '10px 16px', border: '1px dashed var(--border)',
        borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
        color: 'var(--text-dim)', fontSize: 12, transition: 'all 0.2s',
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,229,255,0.35)'; e.currentTarget.style.color = 'var(--accent)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)' }}
      >
        <Plus size={13} /> Click to add a filter…
      </div>
    )
  }

  // Determine the "first user filter" index (after the file filter)
  const firstUserIdx = filters.findIndex(f => f.field !== 'source_file_s')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4 }}>
      {userFilters.map(f => (
        <FilterRow
          key={f._idx}
          filter={f}
          isFirst={f._idx === firstUserIdx}
          fields={schema.filter(s => !SKIP.has(s.name))}
          facetOptions={f.field && facets[f.field] ? facets[f.field] : []}
          onFieldChange={field => handleFieldChange(f._idx, field)}
          onChange={updates => onUpdate(f._idx, updates)}
          onRemove={() => onRemove(f._idx)}
        />
      ))}
    </div>
  )
}

// ── Single filter row ─────────────────────────────────────────────────────────
function FilterRow({ filter, isFirst, fields, facetOptions, onFieldChange, onChange, onRemove }) {
  return (
    <div className="animate-fade" style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '7px 10px',
    }}>
      {/* AND/OR connector or WHERE label */}
      {isFirst ? (
        <span style={{
          color: 'var(--text-dim)', fontSize: 10, fontWeight: 800,
          textTransform: 'uppercase', fontFamily: 'var(--font-mono)',
          flexShrink: 0, width: 44, textAlign: 'center',
        }}>WHERE</span>
      ) : (
        <select className="input" value={filter.op || 'AND'} onChange={e => onChange({ op: e.target.value })}
          style={{ width: 60, fontSize: 10, fontWeight: 800, padding: '3px 6px', flexShrink: 0,
            color: filter.op === 'OR' ? 'var(--accent2)' : 'var(--accent)' }}>
          <option value="AND">AND</option>
          <option value="OR">OR</option>
        </select>
      )}

      {/* Field selector */}
      <select className="input" style={{ flex: '0 0 175px', fontWeight: 600, fontSize: 11 }}
        value={filter.field} onChange={e => onFieldChange(e.target.value)}>
        <option value="">— pick field —</option>
        {fields.map(f => <option key={f.name} value={f.name}>{f.label}</option>)}
      </select>

      {/* Filter type */}
      <select className="input" style={{ flex: '0 0 135px', fontSize: 11 }}
        value={filter.type || 'text'}
        onChange={e => onChange({ type: e.target.value, value: '', min: '', max: '', from: '', to: '' })}>
        {FILTER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>

      {/* Value input */}
      <FilterValueInput
        filter={filter}
        facetOptions={facetOptions}
        onChange={onChange}
      />

      {/* Remove */}
      <button onClick={onRemove} style={{
        background: 'none', border: 'none', color: 'var(--text-dim)',
        cursor: 'pointer', padding: 4, flexShrink: 0, transition: 'color 0.15s',
      }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--error)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dim)'}>
        <X size={14} />
      </button>
    </div>
  )
}

// ── Filter value inputs ───────────────────────────────────────────────────────
function FilterValueInput({ filter, facetOptions, onChange }) {
  const type = filter.type || 'text'

  // Number range — FIXED: sends min/max separately
  if (type === 'number_range' || type === 'range') {
    return (
      <div style={{ display: 'flex', flex: 1, gap: 6, alignItems: 'center' }}>
        <input className="input" type="number" placeholder="Min"
          style={{ flex: 1, fontSize: 11 }}
          value={filter.min ?? ''}
          onChange={e => onChange({ min: e.target.value })} />
        <span style={{ color: 'var(--text-dim)', fontSize: 11, flexShrink: 0 }}>→</span>
        <input className="input" type="number" placeholder="Max"
          style={{ flex: 1, fontSize: 11 }}
          value={filter.max ?? ''}
          onChange={e => onChange({ max: e.target.value })} />
      </div>
    )
  }

  // Date range
  if (type === 'date_range') {
    return (
      <div style={{ display: 'flex', flex: 1, gap: 6, alignItems: 'center' }}>
        <input type="date" className="input" style={{ flex: 1, fontSize: 11 }}
          value={filter.from ?? ''}
          onChange={e => onChange({ from: e.target.value })} />
        <span style={{ color: 'var(--text-dim)', fontSize: 11, flexShrink: 0 }}>→</span>
        <input type="date" className="input" style={{ flex: 1, fontSize: 11 }}
          value={filter.to ?? ''}
          onChange={e => onChange({ to: e.target.value })} />
      </div>
    )
  }

  // Boolean
  if (type === 'boolean') {
    return (
      <select className="input" style={{ flex: 1, fontSize: 11 }}
        value={filter.value === true || filter.value === 'true' ? 'true' : filter.value === false || filter.value === 'false' ? 'false' : ''}
        onChange={e => onChange({ value: e.target.value === '' ? '' : e.target.value === 'true' })}>
        <option value="">— any —</option>
        <option value="true">True</option>
        <option value="false">False</option>
      </select>
    )
  }

  // Multi select
  if (type === 'multi_select') {
    return (
      <select className="input" style={{ flex: 1, fontSize: 11 }} multiple
        value={Array.isArray(filter.value) ? filter.value : []}
        onChange={e => onChange({ value: Array.from(e.target.selectedOptions, o => o.value) })}
        size={Math.min(4, facetOptions.length || 3)}>
        {facetOptions.length > 0
          ? facetOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.value} ({opt.count})</option>)
          : <option disabled>No facets — select a string field first</option>}
      </select>
    )
  }

  // Text / exact with autocomplete dropdown when facets available
  if (facetOptions.length > 0 && (type === 'text' || type === 'exact')) {
    return (
      <select className="input" style={{ flex: 1, fontSize: 11 }}
        value={filter.value || ''}
        onChange={e => onChange({ value: e.target.value })}>
        <option value="">— any —</option>
        {facetOptions.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.value} ({opt.count})</option>
        ))}
      </select>
    )
  }

  // Default text input
  return (
    <input className="input" style={{ flex: 1, fontSize: 11 }} placeholder="Value…"
      value={filter.value ?? ''}
      onChange={e => onChange({ value: e.target.value })} />
  )
}

// ── Advanced nested filter builder ────────────────────────────────────────────
function AdvancedFilterBuilder({
  groups, schema, facets, fetchFacets,
  onAddGroup, onRemoveGroup,
  onAddCondition, onUpdateCondition, onRemoveCondition, onSetGroupOp,
}) {
  const fields = schema.filter(s => !SKIP.has(s.name))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
      {(groups || []).map((group, gi) => (
        <div key={group.id} style={{
          border: '1px solid rgba(139,92,246,0.25)', borderRadius: 10,
          background: 'rgba(139,92,246,0.04)', overflow: 'hidden',
        }}>
          {/* Group header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderBottom: '1px solid rgba(139,92,246,0.12)', background: 'rgba(139,92,246,0.06)' }}>
            <span style={{ fontSize: 10, color: 'var(--accent2)', fontWeight: 800, textTransform: 'uppercase' }}>
              Group {gi + 1}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>— join with</span>
            {['AND', 'OR'].map(op => (
              <button key={op} onClick={() => onSetGroupOp(group.id, op)} style={{
                padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(139,92,246,0.3)',
                cursor: 'pointer', fontSize: 10, fontWeight: 800,
                background: group.op === op ? 'var(--accent2)' : 'transparent',
                color: group.op === op ? '#fff' : 'var(--text-muted)',
              }}>{op}</button>
            ))}
            <div style={{ flex: 1 }} />
            <button onClick={() => onAddCondition(group.id, { field: '', type: 'text', value: '' })}
              className="btn btn-xs" style={{ borderColor: 'rgba(139,92,246,0.4)', color: 'var(--accent2)' }}>
              <Plus size={10} /> Condition
            </button>
            {groups.length > 1 && (
              <button onClick={() => onRemoveGroup(group.id)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 2 }}>
                <Trash2 size={12} />
              </button>
            )}
          </div>

          {/* Conditions */}
          <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {group.conditions.length === 0 && (
              <p style={{ color: 'var(--text-dim)', fontSize: 11, textAlign: 'center', margin: '6px 0' }}>
                No conditions — click "+ Condition"
              </p>
            )}
            {group.conditions.map((cond, ci) => (
              <div key={cond.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 800, fontFamily: 'var(--font-mono)', minWidth: 30, color: ci === 0 ? 'var(--text-dim)' : group.op === 'OR' ? 'var(--accent2)' : 'var(--accent)' }}>
                  {ci === 0 ? 'IF' : group.op}
                </span>
                <select className="input" style={{ flex: '0 0 155px', fontSize: 11 }}
                  value={cond.field}
                  onChange={e => onUpdateCondition(group.id, cond.id, { field: e.target.value, value: '', min: '', max: '' })}>
                  <option value="">— field —</option>
                  {fields.map(f => <option key={f.name} value={f.name}>{f.label}</option>)}
                </select>
                <select className="input" style={{ flex: '0 0 120px', fontSize: 11 }}
                  value={cond.type || 'text'}
                  onChange={e => onUpdateCondition(group.id, cond.id, { type: e.target.value, value: '', min: '', max: '' })}>
                  {FILTER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <FilterValueInput
                  filter={cond}
                  facetOptions={cond.field && facets[cond.field] ? facets[cond.field] : []}
                  onChange={u => onUpdateCondition(group.id, cond.id, u)}
                />
                <button onClick={() => onRemoveCondition(group.id, cond.id)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4 }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--error)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dim)'}>
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      <button onClick={onAddGroup} className="btn btn-sm" style={{ borderColor: 'rgba(139,92,246,0.3)', color: 'var(--accent2)', alignSelf: 'flex-start', marginTop: 4 }}>
        <Plus size={12} /> Add Group
        <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 4 }}>(groups are AND-ed together)</span>
      </button>
    </div>
  )
}
