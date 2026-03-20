import React, { useEffect } from 'react'
import { useStore } from './store/index'
import Sidebar       from './components/Sidebar'
import TopBar        from './components/TopBar'
import FilterBar     from './components/FilterBar'
import DataTable     from './components/DataTable'
import ChartPanel    from './components/ChartPanel'
import SavedViews    from './components/SavedViews'
import StatusBar     from './components/StatusBar'
import AuditLog      from './components/AuditLog'
import SchedulePanel from './components/SchedulePanel'
import './App.css'
import './index.css'

export default function App() {
  const { fetchSchema, fetchStats, fetchViews, query, activeTab, sidebarOpen, fetchCurrentUser, fetchSchedules } = useStore()

  useEffect(() => {
    ;(async () => {
      await fetchSchema()
      await fetchStats()
      fetchViews()
      fetchCurrentUser()
      fetchSchedules()
      query()
    })()
  }, [])

  // Keyboard shortcut: Ctrl+Enter to fetch
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        useStore.getState().query()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="app-container">

      {/* ── Sidebar ───────────────────────────────── */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        {/* Logo strip */}
        <div className="sidebar-logo">
          <span className="logo-icon">◈</span>
          <div>
            <div className="logo-text">DataLens</div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', letterSpacing: '.08em', textTransform: 'uppercase', marginTop: 1 }}>
              Reporting v8
            </div>
          </div>
        </div>

        {/* Column selector */}
        <Sidebar />
      </aside>

      {/* ── Main content ───────────────────────────── */}
      <main className="main-content">
        <TopBar />
        <FilterBar />
        <div className="results-panel">
          {activeTab === 'table' ? <DataTable /> : <ChartPanel />}
        </div>
        <StatusBar />
      </main>

      {/* ── Drawers ────────────────────────────────── */}
      <SavedViews />
      <AuditLog />
      <SchedulePanel />
    </div>
  )
}
