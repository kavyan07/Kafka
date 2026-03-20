import React, { useState } from 'react'
import { useStore } from '../store/index'
import {
  Menu, RefreshCw, Download, Table2, BarChart2,
  Zap, ChevronDown, X, Terminal, Play, Info,
  Database, CheckCircle, XCircle, BookMarked,
} from 'lucide-react'

export default function TopBar() {
  const {
    query, loading, total, activeTab, setActiveTab,
    setSidebarOpen, sidebarOpen, rows, setRows,
    results, selectedColumns,
    produceStatus, produceMessage, produceLogs,
    triggerProduce, produceError,
    setShowViews,
  } = useStore()

  const [showExport,    setShowExport]    = useState(false)
  const [showLogs,      setShowLogs]      = useState(false)
  const [showIndexInfo, setShowIndexInfo] = useState(false)

  /* ── CSV export ── */
  const doExport = (fmt) => {
    if (!results.length) return
    const cols = selectedColumns.length
      ? selectedColumns
      : Object.keys(results[0]).filter(k => !k.startsWith('_') && k !== 'id')
    if (fmt === 'csv') {
      const row2 = r => cols.map(c => {
        const v = String(r[c] ?? '')
        return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v
      }).join(',')
      const blob = new Blob(['\uFEFF' + [cols.join(','), ...results.map(row2)].join('\n')], { type: 'text/csv;charset=utf-8' })
      dl(blob, `report_${ts()}.csv`)
    } else {
      dl(new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' }), `report_${ts()}.json`)
    }
    setShowExport(false)
  }
  const ts = () => new Date().toISOString().slice(0, 10)
  const dl = (blob, name) => {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name })
    a.click(); URL.revokeObjectURL(a.href)
  }

  const STATUS = {
    running: { bg: 'rgba(0,229,255,0.06)', border: 'rgba(0,229,255,0.2)', color: 'var(--accent)', icon: <RefreshCw size={13} className="animate-spin" /> },
    done:    { bg: 'rgba(34,197,94,0.07)', border: 'rgba(34,197,94,0.2)',  color: 'var(--success)', icon: <CheckCircle size={13} /> },
    error:   { bg: 'rgba(239,68,68,0.07)', border: 'rgba(239,68,68,0.2)', color: 'var(--error)',   icon: <XCircle size={13} /> },
  }

  return (
    <div className="topbar">

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', flexWrap: 'nowrap', overflowX: 'auto' }}>

        {/* Sidebar toggle */}
        <button id="sidebar-toggle" className="btn" onClick={() => setSidebarOpen(!sidebarOpen)} style={{ padding: '7px 10px' }} title="Toggle sidebar">
          <Menu size={16} />
        </button>

        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 8 }}>
          <div style={{
            width: 32, height: 32,
            background: 'linear-gradient(135deg, rgba(0,229,255,0.2) 0%, rgba(0,229,255,0.08) 100%)',
            border: '1px solid rgba(0,229,255,0.35)',
            borderRadius: 9,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 0 18px rgba(0,229,255,0.2)',
          }}>
            <Database size={16} color="var(--accent)" />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', lineHeight: 1, letterSpacing: '-0.3px', fontFamily: 'var(--font)' }}>
              DataLens <span style={{ color: 'var(--accent)', fontWeight: 500, fontSize: 12 }}>Reporting</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              {total > 0
                ? <span style={{ color: 'var(--accent)', opacity: 0.75 }}>{total.toLocaleString()} records</span>
                : <span style={{ color: 'var(--text-faint)' }}>No data yet</span>}
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* View switcher */}
        <div style={{
          display: 'flex',
          background: 'rgba(0,0,0,0.25)',
          border: '1px solid var(--border)',
          borderRadius: 9, padding: 3, gap: 3
        }}>
          {[
            { id: 'table',  icon: <Table2 size={13} />,    label: 'Table'  },
            { id: 'charts', icon: <BarChart2 size={13} />, label: 'Charts' },
          ].map(t => (
            <button key={t.id} id={`tab-${t.id}`} onClick={() => setActiveTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
              border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
              background: activeTab === t.id ? 'var(--accent)' : 'transparent',
              color: activeTab === t.id ? '#000' : 'var(--text-muted)',
              borderRadius: 6, transition: 'all 0.18s',
              fontFamily: 'var(--font)',
              boxShadow: activeTab === t.id ? '0 0 14px rgba(0,229,255,0.3)' : 'none',
            }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Rows per page */}
        <select id="rows-select" className="input" style={{ width: 105, fontWeight: 600 }} value={rows} onChange={e => setRows(Number(e.target.value))}>
          {[20, 50, 100, 200, 500].map(n => <option key={n} value={n}>{n} rows</option>)}
        </select>

        {/* ── Saved Views Button — NEW ── */}
        <button
          id="saved-views-btn"
          className="btn btn-violet"
          onClick={() => setShowViews(true)}
          title="Saved Views"
          style={{ gap: 6 }}
        >
          <BookMarked size={13} />
          Views
        </button>

        {/* ── Index CSV ── */}
        <div style={{ position: 'relative', display: 'flex', gap: 0 }}>
          <button
            id="index-csv-btn"
            className="btn btn-electric"
            onClick={() => triggerProduce()}
            disabled={produceStatus === 'running'}
            style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0, padding: '7px 14px' }}
            title="Stream CSV files through Kafka into Solr"
          >
            <Zap size={13} fill="currentColor" />
            {produceStatus === 'running' ? 'Indexing…' : 'Index CSV'}
          </button>
          <button
            id="index-info-btn"
            className="btn btn-electric"
            onClick={() => setShowIndexInfo(v => !v)}
            style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeft: '1px solid rgba(255,255,255,0.15)', padding: '7px 9px' }}
          >
            <Info size={13} />
          </button>

          {showIndexInfo && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 198 }} onClick={() => setShowIndexInfo(false)} />
              <div className="card-glass animate-fade" style={{ position: 'absolute', right: 0, top: 'calc(100% + 10px)', width: 340, zIndex: 199, padding: 18 }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontWeight: 800, fontSize: 13, color: 'var(--text)' }}>
                  <Zap size={15} color="var(--electric)" />
                  How to Index Data
                </h4>
                <ol style={{ paddingLeft: 20, fontSize: 12, color: 'var(--text-muted)', lineHeight: 2, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <li>Put your <strong style={{ color: 'var(--text)' }}>CSV files</strong> in the <code>sample-data/</code> folder</li>
                  <li>Click <strong style={{ color: 'var(--electric)' }}>Index CSV</strong> to stream CSV → Kafka → Solr</li>
                  <li>Wait for the green "Done" banner, then click <strong style={{ color: 'var(--emerald)' }}>Fetch Data</strong></li>
                </ol>
              </div>
            </>
          )}
        </div>

        {/* ── Fetch Data — FIXED: calls query() directly ── */}
        <button
          id="fetch-data-btn"
          className="btn btn-primary"
          onClick={() => query()}
          disabled={loading}
          style={{ minWidth: 120 }}
        >
          {loading
            ? <><RefreshCw size={13} className="animate-spin" /> Fetching…</>
            : <><Play size={13} fill="currentColor" /> Fetch Data</>}
        </button>

        {/* Export */}
        <div style={{ position: 'relative' }}>
          <button id="export-btn" className="btn" onClick={() => setShowExport(v => !v)} disabled={!results.length} title="Export data">
            <Download size={13} /> <ChevronDown size={11} />
          </button>
          {showExport && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 198 }} onClick={() => setShowExport(false)} />
              <div className="card-glass animate-fade" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', minWidth: 190, zIndex: 199, overflow: 'hidden', padding: '6px 0' }}>
                <DropItem id="export-csv"  onClick={() => doExport('csv')}  emoji="📄" label="Export CSV" />
                <DropItem id="export-json" onClick={() => doExport('json')} emoji="📋" label="Export JSON" />
              </div>
            </>
          )}
        </div>

        {/* Refresh icon */}
        <button id="refresh-btn" className="btn" onClick={() => query()} disabled={loading} style={{ padding: '7px 9px' }} title="Refresh data">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Producer status banner ── */}
      {produceStatus && (() => {
        const c = STATUS[produceStatus] || STATUS.running
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 18px', background: c.bg, borderTop: `1px solid ${c.border}`, color: c.color, fontSize: 12 }}>
            {c.icon}
            <span style={{ flex: 1, fontWeight: 600, fontFamily: 'var(--font)' }}>{produceMessage}</span>
            {produceLogs.length > 0 && (
              <button onClick={() => setShowLogs(v => !v)} className="btn btn-sm" style={{ background: 'none', borderColor: c.border, color: c.color }}>
                <Terminal size={11} /> {showLogs ? 'Hide' : 'Logs'}
              </button>
            )}
            <button
              onClick={() => useStore.setState?.({ produceStatus: null, produceLogs: [] })}
              style={{ background: 'none', border: 'none', color: c.color, cursor: 'pointer', padding: 2 }}
            >
              <X size={15} />
            </button>
          </div>
        )
      })()}

      {/* ── Log console ── */}
      {showLogs && produceLogs.length > 0 && (
        <div style={{ background: '#000', borderTop: '1px solid var(--border)', padding: '10px 18px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', maxHeight: 140, overflowY: 'auto' }}>
          {produceLogs.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  )
}

function DropItem({ id, onClick, emoji, label }) {
  const [hov, setHov] = useState(false)
  return (
    <button id={id} onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 16px',
        background: hov ? 'rgba(255,255,255,0.05)' : 'none', border: 'none', cursor: 'pointer',
        color: hov ? 'var(--accent)' : 'var(--text)', fontSize: 12, fontWeight: 600, textAlign: 'left',
        fontFamily: 'var(--font)',
      }}>
      <span style={{ fontSize: 14 }}>{emoji}</span>{label}
    </button>
  )
}
