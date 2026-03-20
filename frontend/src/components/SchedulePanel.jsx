import React, { useState, useEffect } from 'react'
import { useStore } from '../store'
import { X, Clock, Plus, Trash2, CheckCircle, Mail, Calendar, RefreshCw, BookMarked, Download, AlarmClock } from 'lucide-react'

const FREQ_OPTS = [
  { value: 'daily',   label: '📅 Daily' },
  { value: 'weekly',  label: '📆 Weekly' },
  { value: 'monthly', label: '🗓 Monthly' },
]
const FMT_OPTS = [
  { value: 'csv',   label: '📄 CSV' },
  { value: 'excel', label: '📊 Excel' },
]

function timeUntil(dateStr) {
  if (!dateStr) return 'N/A'
  const diff = new Date(dateStr) - Date.now()
  if (diff < 0) return 'Overdue'
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(h / 24)
  if (d > 0) return `in ${d}d ${h % 24}h`
  return `in ${h}h ${Math.floor((diff % 3600000) / 60000)}m`
}

export default function SchedulePanel() {
  const {
    showSchedules, setShowSchedules,
    schedules, fetchSchedules, saveSchedule, deleteSchedule,
    selectedColumns, filters, sort, views,
  } = useStore()

  const [form, setForm]     = useState({ name: '', frequency: 'daily', time: '08:00', email: '', format: 'csv', view_id: '' })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [loading,setLoading]= useState(false)

  useEffect(() => {
    if (showSchedules) load()
  }, [showSchedules])

  const load = async () => {
    setLoading(true)
    await fetchSchedules()
    setLoading(false)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) return
    setSaving(true)
    await saveSchedule({
      ...form,
      columns: selectedColumns,
      filters,
      sort,
    })
    setSaving(false)
    setSaved(true)
    setForm({ name: '', frequency: 'daily', time: '08:00', email: '', format: 'csv', view_id: '' })
    setTimeout(() => setSaved(false), 2000)
  }

  if (!showSchedules) return null

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(0,0,0,.4)' }} onClick={() => setShowSchedules(false)} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 420,
        background: 'var(--bg2)', borderLeft: '1px solid var(--border)', zIndex: 151,
        display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlarmClock size={16} color="#22c55e" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>Scheduled Reports</div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Auto-deliver reports via email</div>
            </div>
          </div>
          <button onClick={() => setShowSchedules(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Create new */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg3)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>
            + New Schedule
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input className="input" placeholder="Report name…" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              style={{ fontSize: 12 }} />
            <input className="input" placeholder="Email address…" type="email" value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              style={{ fontSize: 12 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <select className="input" style={{ flex: 1, fontSize: 11 }} value={form.frequency}
                onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}>
                {FREQ_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input type="time" className="input" style={{ width: 100, fontSize: 11 }} value={form.time}
                onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <select className="input" style={{ flex: 1, fontSize: 11 }} value={form.format}
                onChange={e => setForm(f => ({ ...f, format: e.target.value }))}>
                {FMT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {views.length > 0 && (
                <select className="input" style={{ flex: 1, fontSize: 11 }} value={form.view_id}
                  onChange={e => setForm(f => ({ ...f, view_id: e.target.value }))}>
                  <option value="">Current filters</option>
                  {views.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              )}
            </div>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name.trim() || !form.email.trim()}
              style={saved ? { background: '#22c55e', borderColor: '#22c55e' } : {}}>
              {saved ? <><CheckCircle size={13} /> Scheduled!</> : saving ? <><RefreshCw size={12} className="animate-spin" /> Saving…</> : <><Plus size={13} /> Schedule Report</>}
            </button>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 8 }}>
            Uses current column selection and filters
          </div>
        </div>

        {/* Schedule list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {loading && <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><RefreshCw size={16} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>}
          {!loading && schedules.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-dim)' }}>
              <AlarmClock size={36} style={{ opacity: .15, marginBottom: 12 }} />
              <div style={{ fontSize: 13, fontWeight: 600 }}>No scheduled reports</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Create a schedule to auto-deliver reports to your inbox</div>
            </div>
          )}
          {schedules.map(sched => (
            <div key={sched.id} style={{
              padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)',
              marginBottom: 8, background: 'rgba(255,255,255,0.02)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 5 }}>{sched.name}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span className="badge" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Calendar size={9} /> {sched.frequency}
                    </span>
                    <span className="badge badge-accent" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Clock size={9} /> {sched.time}
                    </span>
                    <span className="badge badge-violet" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Download size={9} /> {sched.format?.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Mail size={10} /> {sched.email}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                    Next run: <span style={{ color: '#22c55e' }}>{timeUntil(sched.next_run)}</span> · {new Date(sched.next_run).toLocaleString()}
                  </div>
                </div>
                <button onClick={() => deleteSchedule(sched.id)} style={{ background: 'none', border: '1px solid transparent', padding: '5px 7px', borderRadius: 6, cursor: 'pointer', color: 'var(--text-dim)', transition: 'all .15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--error)'; e.currentTarget.style.color = 'var(--error)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = 'var(--text-dim)' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
