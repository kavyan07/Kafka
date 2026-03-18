import { create } from 'zustand'

const API = '/api'

export const useStore = create((set, get) => ({
  // ── Schema ────────────────────────────────────────────────────────
  schema: [],
  schemaLoading: false,
  fetchSchema: async () => {
    set({ schemaLoading: true })
    try {
      const res = await fetch(`${API}/schema`)
      const data = await res.json()
      set({ schema: data.fields || [] })
    } catch (e) {
      console.error('Schema fetch failed', e)
    } finally {
      set({ schemaLoading: false })
    }
  },

  // ── Column Config ─────────────────────────────────────────────────
  selectedColumns: [],
  columnWidths: {},
  columnOrder: [],
  setSelectedColumns: (cols) => set({ selectedColumns: cols }),
  setColumnOrder: (order) => set({ columnOrder: order }),
  setColumnWidth: (col, width) =>
    set(s => ({ columnWidths: { ...s.columnWidths, [col]: width } })),
  initColumns: (schema) => {
    const cols = schema.slice(0, 8).map(f => f.name)
    set({ selectedColumns: cols, columnOrder: cols })
  },

  // ── Filters ───────────────────────────────────────────────────────
  filters: [],
  addFilter: (filter) => set(s => ({ filters: [...s.filters, filter] })),
  updateFilter: (idx, filter) => set(s => ({
    filters: s.filters.map((f, i) => i === idx ? { ...f, ...filter } : f)
  })),
  removeFilter: (idx) => set(s => ({
    filters: s.filters.filter((_, i) => i !== idx)
  })),
  clearFilters: () => set({ filters: [] }),

  // ── Date ──────────────────────────────────────────────────────────
  dateRange: { from: '', to: '' },
  dateCompare: null,
  setDateRange: (dr) => set({ dateRange: dr }),
  setDateCompare: (dc) => set({ dateCompare: dc }),

  // ── Query / Results ───────────────────────────────────────────────
  results: [],
  total: 0,
  page: 1,
  rows: 50,
  sort: 'score desc',
  loading: false,
  compareResult: null,
  setPage: (page) => { set({ page }); get().query() },
  setRows: (rows) => { set({ rows, page: 1 }); get().query() },
  setSort: (sort) => { set({ sort }); get().query() },

  query: async () => {
    const s = get()
    set({ loading: true, compareResult: null })

    const activeFilters = s.filters.filter(f => f.field && f.value !== '')
    const body = {
      rows: s.rows,
      page: s.page,
      sort: s.sort,
      fields: s.selectedColumns.length ? s.selectedColumns : ['*'],
      filters: activeFilters,
      dateCompare: s.dateCompare,
    }

    try {
      const res = await fetch(`${API}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (data.current) {
        // Date compare mode
        set({
          results: data.current.docs || [],
          total: data.current.total || 0,
          compareResult: data,
        })
      } else {
        set({ results: data.docs || [], total: data.total || 0 })
      }
    } catch (e) {
      console.error('Query failed', e)
    } finally {
      set({ loading: false })
    }
  },

  // ── Facets ───────────────────────────────────────────────────────
  facets: {},
  fetchFacets: async (fields) => {
    try {
      const res = await fetch(`${API}/facets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields, limit: 30 }),
      })
      const data = await res.json()
      set({ facets: data.facets || {} })
    } catch (e) {
      console.error('Facets failed', e)
    }
  },

  // ── Saved Views ───────────────────────────────────────────────────
  views: [],
  fetchViews: async () => {
    try {
      const res = await fetch(`${API}/views`)
      const data = await res.json()
      set({ views: data.views || [] })
    } catch (e) {}
  },
  saveView: async (name) => {
    const s = get()
    await fetch(`${API}/views`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        columns: s.selectedColumns,
        filters: s.filters,
        sort: s.sort,
      }),
    })
    get().fetchViews()
  },
  loadView: (view) => {
    set({
      selectedColumns: view.columns || [],
      columnOrder: view.columns || [],
      filters: view.filters || [],
      sort: view.sort || 'score desc',
    })
    get().query()
  },
  deleteView: async (id) => {
    await fetch(`${API}/views`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    get().fetchViews()
  },

  // ── UI State ──────────────────────────────────────────────────────
  activeTab: 'table',   // table | charts
  sidebarOpen: true,
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
}))
