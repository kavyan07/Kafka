import React, { useState, useEffect } from 'react'
import { useStore } from '../store/index'
import { Activity, Database, CheckCircle, AlertCircle, RefreshCw, Cpu, Wifi } from 'lucide-react'

export default function StatusBar() {
  const { total, loading, queryError } = useStore()
  const [health, setHealth] = useState({ solr: null, kafka: null, records: 0 })

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/health')
        if (res.ok) {
          const data = await res.json()
          setHealth({ solr: data.solr === true, kafka: true, records: data.records || 0 })
        } else {
          setHealth({ solr: false, kafka: false, records: 0 })
        }
      } catch {
        setHealth({ solr: false, kafka: false, records: 0 })
      }
    }
    check()
    const id = setInterval(check, 10000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="status-bar">

      {/* ── Left: Infrastructure cluster indicators — each with unique color ── */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', paddingRight: 16, borderRight: '1px solid var(--border)' }}>

        {/* SOLR CORE — Cyan */}
        <StatusPill
          id="status-solr"
          label="SOLR CORE"
          ok={health.solr}
          activeColor="var(--status-solr)"
          icon={<Database size={11} />}
        />

        {/* KAFKA BUS — Purple */}
        <StatusPill
          id="status-kafka"
          label="KAFKA BUS"
          ok={health.kafka}
          activeColor="var(--status-kafka)"
          icon={<Wifi size={11} />}
        />
      </div>

      {/* ── Middle: Metrics — each with unique color ── */}
      <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>

        {/* STORAGE — Mint Green */}
        <Metric
          id="status-storage"
          icon={<Database size={11} />}
          label="STORAGE"
          value={health.records.toLocaleString() + ' DOCS'}
          color="var(--status-storage)"
        />

        {/* FOUND — Amber */}
        <Metric
          id="status-found"
          icon={<Activity size={11} />}
          label="FOUND"
          value={total.toLocaleString()}
          color="var(--status-found)"
        />

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent)' }}>
            <RefreshCw size={11} className="animate-spin" style={{ animationDuration: '0.8s' }} />
            <span>ANALYZING…</span>
          </div>
        )}

        {queryError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--error)' }}>
            <AlertCircle size={11} />
            <span>CLUSTER ERROR</span>
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* ── Right: hints ── */}
      <div id="keyboard-hint" style={{ color: 'var(--text-faint)', fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '.05em' }}>
        [CTRL + ENTER] TO FETCH
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-faint)', fontSize: 10, borderLeft: '1px solid var(--border)', paddingLeft: 12 }}>
        <Cpu size={10} />
        DATA-LENS-V6.1-RELEASE
      </div>
    </div>
  )
}

/* ── Status pill — each with own accent color ── */
function StatusPill({ id, label, ok, activeColor, icon }) {
  const color = ok === null ? 'var(--text-dim)' : ok ? activeColor : 'var(--error)'
  return (
    <div id={id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 6, height: 6, borderRadius: 999, background: color,
        boxShadow: ok ? `0 0 8px ${color}, 0 0 16px ${color}` : 'none',
        animation: ok ? 'pulse 2.5s ease-in-out infinite' : 'none',
      }} />
      <span style={{ color, fontWeight: 700 }}>{label}</span>
    </div>
  )
}

/* ── Metric with icon, label, and colored value ── */
function Metric({ id, icon, label, value, color }) {
  return (
    <div id={id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ color: 'var(--text-faint)' }}>{icon}</span>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ color, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  )
}
