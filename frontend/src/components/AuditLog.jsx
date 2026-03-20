import React, { useEffect, useState } from 'react'
import { useStore } from '../store'
import { X, Activity, Trash2, RefreshCw, User, Zap, Search, BookMarked, Database, Shield } from 'lucide-react'

const ACTION_META = {
  query:       { color: 'var(--accent)',   icon: '🔍', label: 'Query' },
  save_view:   { color: 'var(--accent2)',  icon: '💾', label: 'Saved View' },
  delete_view: { color: 'var(--error)',    icon: '🗑', label: 'Deleted View' },
  index_csv:   { color: '#f97316',         icon: '⚡', label: 'Index CSV' },
  schedule:    { color: '#22c55e',         icon: '📅', label: 'Schedule' },
  default:     { color: 'var(--text-muted)', icon: '●', label: 'Action' },
}

function getActionMeta(action) {
  return ACTION_META[action] || ACTION_META.default
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (diff < 60)      return `${diff}s ago`
  if (diff < 3600)    return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)   return `${Math.floor(diff / 3600)}h ago`
  return new Date(dateStr).toLocaleDateString()
}

export default function AuditLog() {
  const {
    showAuditLog, setShowAuditLog,
    auditEntries, auditTotal, fetchAuditLog, clearAuditLog,
  } = useStore()

  const [page,    setPage]    = useState(1)
  const [search,  setSearch]  = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    if (showAuditLog) load(1)
  }, [showAuditLog])

  const load = async (p) => {
    setLoading(true)
    await fetchAuditLog(p)
    setPage(p)
    setLoading(false)
  }

  const handleClear = async () => {
    if (!confirmClear) { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3000); return }
    await clearAuditLog()
    setConfirmClear(false)
  }

  const filtered = search
    ? auditEntries.filter(e =>
        e.action?.includes(search) ||
        e.user_name?.toLowerCase().includes(search.toLowerCase()) ||
        e.detail?.name?.toLowerCase().includes(search.toLowerCase()) ||
        e.detail?.file?.toLowerCase().includes(search.toLowerCase())
      )
    : auditEntries

  if (!showAuditLog) return null

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(0,0,0,.45)' }} onClick={() => setShowAuditLog(false)} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 460,
        background: 'var(--bg2)', borderLeft: '1px solid var(--border)', zIndex: 151,
        display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Activity size={16} color="var(--accent)" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>Audit Log</div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{auditTotal} total entries</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-xs" onClick={() => load(page)} title="Refresh">
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            </button>
            <button className="btn btn-xs" onClick={handleClear} title="Clear all"
              style={{ borderColor: confirmClear ? 'var(--error)' : undefined, color: confirmClear ? 'var(--error)' : undefined }}>
              <Trash2 size={11} />
              {confirmClear ? 'Confirm?' : 'Clear'}
            </button>
            <button onClick={() => setShowAuditLog(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ position: 'relative' }}>
            <Search size={11} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
            <input className="input" placeholder="Search by action, user, file…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', paddingLeft: 27, fontSize: 11, height: 30 }} />
          </div>
        </div>

        {/* Log entries */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
              <RefreshCw size={16} className="animate-spin" style={{ color: 'var(--accent)' }} />
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-dim)' }}>
              <Activity size={36} style={{ opacity: .15, marginBottom: 12 }} />
              <div style={{ fontSize: 13, fontWeight: 600 }}>No audit entries</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Actions like queries, view saves, and CSV indexing are logged here</div>
            </div>
          )}
          {filtered.map((entry, i) => {
            const meta = getActionMeta(entry.action)
            return (
              <div key={entry.id || i} className="animate-fade" style={{
                display: 'flex', gap: 10, padding: '10px 12px', marginBottom: 4,
                background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
                borderRadius: 9, transition: 'background 0.12s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}>
                {/* Action badge */}
                <div style={{ fontSize: 18, flexShrink: 0, lineHeight: 1, marginTop: 2 }}>{meta.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: meta.color }}>{meta.label}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{timeAgo(entry.created_at)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <User size={10} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{entry.user_name}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', padding: '1px 5px', background: 'rgba(255,255,255,0.04)', borderRadius: 4 }}>
                      {entry.user_role}
                    </span>
                  </div>
                  {(entry.detail?.file || entry.detail?.name || entry.detail?.filters) && (
                    <div style={{ marginTop: 4, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {entry.detail.file && (
                        <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)', background: 'rgba(0,229,255,0.06)', padding: '1px 6px', borderRadius: 4, border: '1px solid rgba(0,229,255,0.15)' }}>
                          📄 {entry.detail.file}
                        </span>
                      )}
                      {entry.detail.name && (
                        <span style={{ fontSize: 10, color: 'var(--accent2)', fontFamily: 'var(--font-mono)', background: 'rgba(139,92,246,0.08)', padding: '1px 6px', borderRadius: 4 }}>
                          "{entry.detail.name}"
                        </span>
                      )}
                      {entry.detail.filters && (
                        <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                          {entry.detail.filters}
                        </span>
                      )}
                    </div>
                  )}
                  <div style={{ marginTop: 3, fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
                    {entry.ip} · {new Date(entry.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Pagination */}
        {auditTotal > 50 && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              Page {page} · {auditTotal} total
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-xs" onClick={() => load(Math.max(1, page - 1))} disabled={page === 1}>← Prev</button>
              <button className="btn btn-xs" onClick={() => load(page + 1)} disabled={page * 50 >= auditTotal}>Next →</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
