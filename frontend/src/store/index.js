import { create } from 'zustand'

const API = '/api'
const csvSchemaCache = {}

let queryTimer = null
const scheduleQuery = (fn, delay = 350) => {
  clearTimeout(queryTimer)
  queryTimer = setTimeout(fn, delay)
}

export const useStore = create((set, get) => ({

  // ── Schema ─────────────────────────────────────────────────────────
  schema: [], schemaLoading: false,

  fetchSchema: async (file = null) => {
    set({ schemaLoading: true })
    try {
      if (file && csvSchemaCache[file]) {
        const fields = csvSchemaCache[file]
        set({ schema: fields })
        get()._applyDefaultColumns(fields)
        return
      }
      const url  = file ? `${API}/schema?file=${encodeURIComponent(file)}` : `${API}/schema`
      const data = await apiFetch(url)
      const fields = data.fields || []
      if (file) csvSchemaCache[file] = fields
      set({ schema: fields })
      get()._applyDefaultColumns(fields)
    } catch (e) { console.error('Schema error:', e) }
    finally { set({ schemaLoading: false }) }
  },

  _applyDefaultColumns: (fields) => {
    const SKIP         = new Set(['id', '_version_', '_root_', 'source_file_s', 'ingested_at_dt', '_text_'])
    const skipPatterns = ['url', 'link', 'image', 'extracted', '_text_', '_version_', 'ingested']

    // Deduplicate by label — keep only first field per label to avoid duplicate columns
    const seenLabels = new Set()
    const deduped = fields.filter(f => {
      if (SKIP.has(f.name) || skipPatterns.some(s => f.name.toLowerCase().includes(s))) return false
      if (seenLabels.has(f.label)) return false
      seenLabels.add(f.label)
      return true
    })

    // Selected = first 10 non-URL deduplicated fields
    const cols  = deduped.slice(0, 10).map(f => f.name)
    // Order = all deduplicated fields (full list for sidebar)
    const order = deduped.map(f => f.name)
    set({ selectedColumns: cols, columnOrder: order })
  },

  // ── Stats ──────────────────────────────────────────────────────────
  stats: { total: 0, files: [] },
  fetchStats: async () => {
    try {
      const data = await apiFetch(`${API}/stats`)
      set({ stats: data })
    } catch (e) { console.error('Stats error:', e) }
  },

  // ── Columns ────────────────────────────────────────────────────────
  selectedColumns: [],
  columnWidths:    {},
  columnOrder:     [],

  setSelectedColumns: (cols) => set({ selectedColumns: cols }),
  setColumnOrder:     (order) => set({ columnOrder: order }),
  setColumnWidth: (col, w) => {
    set(s => ({ columnWidths: { ...s.columnWidths, [col]: w } }))
    scheduleQuery(() => get().saveColumnConfig(), 1200)
  },

  // ── Column config persistence ──────────────────────────────────────
  saveColumnConfig: async () => {
    const s = get()
    try {
      await apiFetch(`${API}/column-config`, {
        method: 'POST',
        body: JSON.stringify({
          report_id: s.selectedFile || 'default',
          user_id:   'default',
          config: {
            selected: s.selectedColumns,
            order:    s.columnOrder,
            widths:   s.columnWidths,
          },
        }),
      })
    } catch { /* silent */ }
  },

  loadColumnConfig: async (file = null) => {
    try {
      const rid  = encodeURIComponent(file || 'default')
      const data = await apiFetch(`${API}/column-config?report_id=${rid}&user_id=default`)
      const cfg  = data.config || {}
      const updates = {}
      if (cfg.selected?.length) updates.selectedColumns = cfg.selected
      if (cfg.order?.length)    updates.columnOrder     = cfg.order
      if (cfg.widths)           updates.columnWidths    = cfg.widths
      if (Object.keys(updates).length) set(updates)
    } catch { /* silent */ }
  },

  // ── Filters ────────────────────────────────────────────────────────
  filters: [],
  addFilter:    (f) => set(s => ({ filters: [...s.filters, f] })),
  updateFilter: (i, u) => set(s => ({ filters: s.filters.map((x, j) => j === i ? { ...x, ...u } : x) })),
  removeFilter: (i)  => set(s => ({ filters: s.filters.filter((_, j) => j !== i) })),
  clearFilters: () => {
    const { selectedFile } = get()
    const keep = selectedFile
      ? [{ field: 'source_file_s', type: 'term', value: selectedFile, op: 'AND' }]
      : []
    set({ filters: keep, filterGroups: null, useAdvancedFilters: false })
    get().query()
  },

  // ── Advanced filter groups ─────────────────────────────────────────
  filterGroups:       null,
  useAdvancedFilters: false,

  setUseAdvancedFilters: (v) => set({
    useAdvancedFilters: v,
    filterGroups: v ? [{ id: 'g1', op: 'AND', conditions: [] }] : null,
  }),

  addFilterGroup: () => set(s => ({
    filterGroups: [...(s.filterGroups || []), { id: 'g' + Date.now(), op: 'AND', conditions: [] }],
  })),
  removeFilterGroup: (gid) => set(s => ({
    filterGroups: (s.filterGroups || []).filter(g => g.id !== gid),
  })),
  addConditionToGroup: (gid, cond) => set(s => ({
    filterGroups: (s.filterGroups || []).map(g =>
      g.id === gid ? { ...g, conditions: [...g.conditions, { ...cond, id: 'c' + Date.now() }] } : g
    ),
  })),
  updateCondition: (gid, cid, u) => set(s => ({
    filterGroups: (s.filterGroups || []).map(g =>
      g.id === gid ? { ...g, conditions: g.conditions.map(c => c.id === cid ? { ...c, ...u } : c) } : g
    ),
  })),
  removeCondition: (gid, cid) => set(s => ({
    filterGroups: (s.filterGroups || []).map(g =>
      g.id === gid ? { ...g, conditions: g.conditions.filter(c => c.id !== cid) } : g
    ),
  })),
  setGroupOp: (gid, op) => set(s => ({
    filterGroups: (s.filterGroups || []).map(g => g.id === gid ? { ...g, op } : g),
  })),

  // ── File filter ────────────────────────────────────────────────────
  selectedFile: '',
  setSelectedFile: async (file) => {
    const currentFilters = get().filters.filter(f => f.field !== 'source_file_s')
    const newFilters     = file
      ? [{ field: 'source_file_s', type: 'term', value: file, op: 'AND' }, ...currentFilters]
      : currentFilters

    set({ selectedFile: file, filters: newFilters, page: 1, filterGroups: null, useAdvancedFilters: false })

    if (file) {
      await get().fetchSchema(file)
      await get().loadColumnConfig(file)
    } else {
      await get().fetchSchema()
      await get().loadColumnConfig(null)
    }
    get().query()
  },

  // ── Date range & compare ───────────────────────────────────────────
  dateRange:     { from: '', to: '' },
  compareMode:   false,
  compareType:   'previous_period',
  dateCompare:   null,
  compareResult: null,
  setDateRange:   (dr) => set({ dateRange: dr }),
  setCompareMode: (v)  => set({ compareMode: v }),
  setCompareType: (t)  => set({ compareType: t }),

  // ── Results ────────────────────────────────────────────────────────
  results: [], total: 0, page: 1, rows: 50,
  sort: 'score desc', loading: false,
  queryError: null, lastQuery: null,

  setPage: (p) => { set({ page: p }); get().query() },
  setRows: (r) => { set({ rows: r, page: 1 }); get().query() },
  setSort: (s) => { set({ sort: s }); get().query() },

  // ── Query ──────────────────────────────────────────────────────────
  query: async () => {
    const s = get()
    set({ loading: true, queryError: null })

    // Always ensure file filter is present
    let baseFilters = [...s.filters]
    if (s.selectedFile && !baseFilters.some(f => f.field === 'source_file_s')) {
      baseFilters = [{ field: 'source_file_s', type: 'term', value: s.selectedFile, op: 'AND' }, ...baseFilters]
    }

    // Active filters only
    const activeFilters = baseFilters.filter(f => {
      if (!f.field) return false
      if (f.type === 'range' || f.type === 'number_range')
        return (f.min !== '' && f.min != null) || (f.max !== '' && f.max != null)
      if (f.type === 'date_range')   return f.from || f.to
      if (f.type === 'boolean')      return f.value !== '' && f.value != null
      if (f.type === 'multi_select') return Array.isArray(f.value) && f.value.length > 0
      return f.value !== '' && f.value != null
    })

    const sanitized = activeFilters.map(f =>
      (f.type === 'range' || f.type === 'number_range')
        ? { ...f, min: f.min !== '' && f.min != null ? Number(f.min) : '', max: f.max !== '' && f.max != null ? Number(f.max) : '' }
        : f
    )

    let allFilters = [...sanitized]
    if (!s.compareMode && s.dateRange.from && s.dateRange.to) {
      if (!allFilters.some(f => f.field === 'ingested_at_dt')) {
        allFilters.push({ field: 'ingested_at_dt', type: 'date_range', from: s.dateRange.from, to: s.dateRange.to, op: 'AND' })
      }
    }

    let dateCompare = null
    if (s.compareMode && s.dateRange.from && s.dateRange.to) {
      dateCompare = { field: 'ingested_at_dt', type: s.compareType, from: s.dateRange.from, to: s.dateRange.to }
    }

    // ALWAYS request all fields from Solr — column visibility is handled client-side in DataTable.
    // Requesting only selectedColumns causes blank cells when Solr field names have
    // type suffixes (_s, _f, _i) that don't exactly match what the schema returns.
    const requestFields = ['*']

    // Active filter groups
    const activeGroups = s.useAdvancedFilters && s.filterGroups
      ? s.filterGroups.filter(g => g.conditions.some(c => c.field && (c.value || c.min || c.from)))
      : null

    const body = {
      rows: s.rows, page: s.page, sort: s.sort,
      fields: requestFields, filters: allFilters,
      filterGroups: activeGroups, dateCompare,
    }
    set({ lastQuery: body })

    try {
      const data = await apiFetch(`${API}/query`, { method: 'POST', body: JSON.stringify(body) })
      if (data.error) { set({ queryError: data.error, loading: false }); return }
      if (data.current) {
        set({ results: data.current.docs || [], total: data.current.total || 0, compareResult: data, loading: false })
      } else {
        set({ results: data.docs || [], total: data.total || 0, compareResult: null, loading: false })
      }
    } catch (e) {
      set({ queryError: e.message, loading: false })
    }
  },

  // Trigger a debounced re-query (for filter input changes)
  debouncedQuery: (delay = 400) => {
    scheduleQuery(() => get().query(), delay)
  },

  // ── Facets ─────────────────────────────────────────────────────────
  facets: {},
  fetchFacets: async (fields) => {
    try {
      const s = get()
      const ctx = s.filters.filter(f => f.field && f.value && !fields.includes(f.field))
      const data = await apiFetch(`${API}/facets`, {
        method: 'POST',
        body: JSON.stringify({ fields, limit: 100, filters: ctx }),
      })
      set(s => ({ facets: { ...s.facets, ...(data.facets || {}) } }))
    } catch (e) { console.error('Facets error:', e) }
  },

  // ── Saved views ────────────────────────────────────────────────────
  views: [], showViews: false,
  setShowViews: (v) => set({ showViews: v }),

  fetchViews: async () => {
    try {
      const data = await apiFetch(`${API}/views`)
      set({ views: data.views || [] })
    } catch { }
  },

  saveView: async (name) => {
    const s = get()
    await apiFetch(`${API}/views`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        columns:      s.selectedColumns,
        columnOrder:  s.columnOrder,
        columnWidths: s.columnWidths,
        filters:      s.filters,
        filterGroups: s.filterGroups,
        sort:         s.sort,
      }),
    })
    await get().fetchViews()
  },

  loadView: (view) => {
    const fileFilter = (view.filters || []).find(f => f.field === 'source_file_s')
    set({
      selectedColumns: view.columns      || [],
      columnOrder:     view.columnOrder  || view.columns || [],
      columnWidths:    view.columnWidths || {},
      filters:         view.filters      || [],
      filterGroups:    view.filterGroups || null,
      useAdvancedFilters: !!(view.filterGroups),
      sort:            view.sort         || 'score desc',
      selectedFile:    fileFilter?.value || '',
    })
    get().query()
  },

  deleteView: async (id) => {
    await apiFetch(`${API}/views`, { method: 'DELETE', body: JSON.stringify({ id }) })
    await get().fetchViews()
  },

  // ── Produce ────────────────────────────────────────────────────────
  produceStatus:  null,
  produceMessage: '',
  produceLogs:    [],
  produceError:   null,

  triggerProduce: async (file = null) => {
    if (get().produceStatus === 'running') return
    set({ produceStatus: 'running', produceMessage: 'Starting CSV indexing…', produceLogs: [], produceError: null })
    try {
      const data = await apiFetch(`${API}/produce`, { method: 'POST', body: JSON.stringify(file ? { file } : {}) })
      if (data.success) {
        set({ produceStatus: 'running', produceMessage: data.message || 'Streaming CSV → Kafka → Solr…', produceLogs: data.log_tail || [] })
        get()._pollProduce()
      } else {
        set({ produceStatus: 'error', produceMessage: data.error || 'Failed to start producer', produceError: data })
      }
    } catch (e) {
      set({ produceStatus: 'error', produceMessage: 'Network error: ' + e.message })
    }
  },

  _pollProduce: () => {
    const poll = async () => {
      try {
        const data = await apiFetch(`${API}/produce-status`)
        if (data.log?.length) set({ produceLogs: data.log })
        if (data.running) {
          setTimeout(poll, 3000)
        } else {
          set({ produceStatus: 'done', produceMessage: '✅ Indexing complete! Refreshing…' })
          setTimeout(() => { get().query(); get().fetchStats(); get().fetchSchema(get().selectedFile || null) }, 1000)
          setTimeout(() => set({ produceStatus: null, produceLogs: [] }), 6000)
        }
      } catch {
        set({ produceStatus: 'done', produceMessage: 'Indexing finished.' })
        setTimeout(() => { get().query(); get().fetchStats(); set({ produceStatus: null }) }, 3000)
      }
    }
    setTimeout(poll, 3000)
  },

  // ── UI ─────────────────────────────────────────────────────────────
  activeTab:   'table',
  sidebarOpen: true,
  setActiveTab:   (t) => set({ activeTab: t }),
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
}))

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text.slice(0, 300)}`)
  }
  return res.json()
}