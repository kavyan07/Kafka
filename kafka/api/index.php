<?php
/**
 * Dynamic Reporting API - v8.0
 * Enhanced: SSE, Audit Logs, Scheduled Reports, Excel Export, RBAC, Aggregations
 */
require_once __DIR__ . '/../vendor/autoload.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$solrUrl     = getenv('SOLR_URL')     ?: 'http://solr:8983/solr/csvcore';
$kafkaBroker = getenv('KAFKA_BROKER') ?: 'kafka:9092';

$uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];
$uri    = preg_replace('#^/api#', '', $uri);

// ── RBAC: resolve current user ───────────────────────────────────────────────
$currentUser = resolveUser();

switch (true) {
    case $uri === '/query'           && $method === 'POST':   logAudit($currentUser, 'query',   $uri); handleQuery($solrUrl);          break;
    case $uri === '/schema'          && $method === 'GET':    handleSchema($solrUrl);         break;
    case $uri === '/facets'          && $method === 'POST':   handleFacets($solrUrl);         break;
    case $uri === '/views'           && $method === 'GET':    handleGetViews();               break;
    case $uri === '/views'           && $method === 'POST':   logAudit($currentUser, 'save_view', $uri); handleSaveView($currentUser);   break;
    case $uri === '/views'           && $method === 'DELETE': logAudit($currentUser, 'delete_view', $uri); handleDeleteView();             break;
    case $uri === '/column-config'   && $method === 'POST':   handleSaveColumnConfig();       break;
    case $uri === '/column-config'   && $method === 'GET':    handleGetColumnConfig();        break;
    case $uri === '/produce'         && $method === 'POST':   logAudit($currentUser, 'index_csv', $uri); handleProduce($kafkaBroker);    break;
    case $uri === '/produce-status'  && $method === 'GET':    handleProduceStatus();          break;
    case $uri === '/health'          && $method === 'GET':    handleHealth($solrUrl);         break;
    case $uri === '/stats'           && $method === 'GET':    handleStats($solrUrl);          break;
    // ── NEW ENDPOINTS ──────────────────────────────────────────────────────────
    case $uri === '/stream'          && $method === 'GET':    handleStream();                 break;
    case $uri === '/audit-log'       && $method === 'GET':    handleGetAuditLog();            break;
    case $uri === '/audit-log'       && $method === 'DELETE': handleClearAuditLog();          break;
    case $uri === '/schedules'       && $method === 'GET':    handleGetSchedules();           break;
    case $uri === '/schedules'       && $method === 'POST':   logAudit($currentUser,'schedule',$uri); handleSaveSchedule($currentUser); break;
    case $uri === '/schedules'       && $method === 'DELETE': handleDeleteSchedule();         break;
    case $uri === '/export/excel'    && $method === 'POST':   handleExcelExport($solrUrl);    break;
    case $uri === '/aggregate'       && $method === 'POST':   handleAggregate($solrUrl);      break;
    case $uri === '/me'              && $method === 'GET':    json(['user' => $currentUser]); break;
    default: http_response_code(404); json(['error' => 'Not found', 'path' => $uri]);
}

// ── HEALTH ────────────────────────────────────────────────────────────────────
function handleHealth(string $solrUrl): void {
    $solrResp = @solrGet($solrUrl . '/admin/ping?wt=json');
    $solrOk   = $solrResp && str_contains($solrResp, 'OK');
    $cnt      = json_decode(solrGet($solrUrl . '/select?q=*:*&rows=0&wt=json'), true);
    json(['status' => 'ok', 'solr' => $solrOk, 'records' => $cnt['response']['numFound'] ?? 0, 'time' => date('c')]);
}

// ── STATS ─────────────────────────────────────────────────────────────────────
function handleStats(string $solrUrl): void {
    $resp  = json_decode(solrGet($solrUrl . '/select?q=*:*&rows=0&wt=json&facet=true&facet.field=source_file_s&facet.limit=200'), true);
    $files = [];
    $ff    = $resp['facet_counts']['facet_fields']['source_file_s'] ?? [];
    for ($i = 0; $i < count($ff); $i += 2) {
        if ($ff[$i] !== '' && $ff[$i + 1] > 0)
            $files[] = ['file' => $ff[$i], 'count' => $ff[$i + 1]];
    }
    json(['total' => $resp['response']['numFound'] ?? 0, 'files' => $files]);
}

// ── SCHEMA ────────────────────────────────────────────────────────────────────
function handleSchema(string $solrUrl): void {
    $SKIP = ['id', '_version_', '_root_', 'source_file_s', '_text_', 'ingested_at_dt'];
    $file = $_GET['file'] ?? null;

    if ($file) {
        // Build fq param for Solr POST - handles spaces and special chars correctly
        $params = [
            'q'      => '*:*',
            'fq'     => 'source_file_s:' . $file,
            'rows'   => 20,
            'wt'     => 'json',
            'indent' => 'false',
        ];
        $resp = json_decode(solrRequest($solrUrl . '/select', $params), true);
    } else {
        $resp = json_decode(solrGet($solrUrl . '/select?q=*:*&rows=20&wt=json&indent=false'), true);
    }
    $docs = $resp['response']['docs'] ?? [];

    // Assign semantic groups
    $GROUP_RULES = [
        ['id' => 'pricing',    'keywords' => ['price', 'cost', 'amount', 'map', 'msrp', 'fee', 'rate', 'margin']],
        ['id' => 'product',    'keywords' => ['name', 'sku', 'type', 'brand', 'category', 'product', 'title', 'description', 'parent']],
        ['id' => 'inventory',  'keywords' => ['stock', 'quantity', 'qty', 'inventory', 'available', 'units']],
        ['id' => 'violation',  'keywords' => ['violation', 'map_violation', 'screenshot', 'violation_date']],
        ['id' => 'dates',      'keywords' => ['date', 'time', 'change', 'updated', 'created', 'ingested']],
        ['id' => 'urls',       'keywords' => ['url', 'link', 'image', 'photo', 'media', 'extracted']],
        ['id' => 'identifiers','keywords' => ['id', 'sku', 'code', 'ref', 'number', 'num']],
    ];

    $fieldMap = [];
    foreach ($docs as $doc) {
        foreach ($doc as $key => $val) {
            if (str_starts_with($key, '_') || in_array($key, $SKIP)) continue;
            if (!isset($fieldMap[$key])) {
                $label = formatLabel($key);
                $group = 'other';
                $h = strtolower($key . ' ' . $label);
                foreach ($GROUP_RULES as $rule) {
                    foreach ($rule['keywords'] as $kw) {
                        if (str_contains($h, $kw)) { $group = $rule['id']; break 2; }
                    }
                }
                $fieldMap[$key] = [
                    'name'       => $key,
                    'label'      => $label,
                    'type'       => inferType($key, $val),
                    'group'      => $group,
                    'sortable'   => true,
                    'filterable' => true,
                ];
            }
        }
    }

    $schemaResp = json_decode(solrGet($solrUrl . '/schema/fields?wt=json'), true);
    foreach (($schemaResp['fields'] ?? []) as $f) {
        $n = $f['name'];
        if (str_starts_with($n, '_') || in_array($n, $SKIP)) continue;
        if (!isset($fieldMap[$n])) {
            $label = formatLabel($n);
            $fieldMap[$n] = ['name' => $n, 'label' => $label, 'type' => inferType($n, null), 'group' => 'other', 'sortable' => true, 'filterable' => true];
        }
    }

    $sorted = array_values($fieldMap);
    usort($sorted, fn($a, $b) => (
        (str_contains(strtolower($a['name']), 'url') || str_contains(strtolower($a['name']), 'link'))
        <=> (str_contains(strtolower($b['name']), 'url') || str_contains(strtolower($b['name']), 'link'))
    ) ?: strcmp($a['name'], $b['name']));

    json(['fields' => $sorted, 'total' => count($sorted)]);
}

// ── QUERY ─────────────────────────────────────────────────────────────────────
function handleQuery(string $solrUrl): void {
    $body        = getBody();
    $rows        = min((int)($body['rows'] ?? 50), 1000);
    $page        = max(1, (int)($body['page'] ?? 1));
    $start       = ($page - 1) * $rows;
    $sort        = sanitizeSort($body['sort'] ?? 'score desc');
    $q           = $body['q'] ?? '*:*';
    $fields      = $body['fields'] ?? ['*'];
    $filters     = $body['filters'] ?? [];
    $filterGroups = $body['filterGroups'] ?? null;
    $dateCompare = $body['dateCompare'] ?? null;

    if (is_array($fields) && !in_array('*', $fields)) {
        $fields = array_filter($fields, fn($f) => $f !== 'id' && $f !== '_version_');
        if (empty($fields)) $fields = ['*'];
    }

    // ── Build fq array
    // Strategy: source_file_s always goes as its own fq (best Solr caching)
    // User filters are combined respecting AND/OR ops
    $fqs = [];

    if ($filterGroups) {
        // Advanced nested mode
        $groupFqs = buildNestedFilterGroups($filterGroups);
        $fqs      = array_merge($fqs, $groupFqs);
    } else {
        // Flat mode — separate file filter from user filters
        $fileFilter  = null;
        $userFilters = [];
        foreach ($filters as $f) {
            if (($f['field'] ?? '') === 'source_file_s') {
                $fileFilter = $f;
            } else {
                $userFilters[] = $f;
            }
        }

        // File filter always as its own fq
        if ($fileFilter) {
            $fqs[] = 'source_file_s:' . ($fileFilter['value'] ?? '');
        }

        // User filters combined with AND/OR
        if (!empty($userFilters)) {
            $combined = buildCombinedUserFilters($userFilters);
            if ($combined !== null) {
                $fqs[] = $combined;
            }
        }
    }

    $params = [
        'q'      => $q ?: '*:*',
        'rows'   => $rows,
        'start'  => $start,
        'sort'   => $sort,
        'fl'     => implode(',', (array)$fields),
        'wt'     => 'json',
        'indent' => 'false',
    ];
    if (!empty($fqs)) $params['fq'] = $fqs;

    if ($dateCompare && !empty($dateCompare['from']) && !empty($dateCompare['to'])) {
        json(executeDateCompare($solrUrl, $params, $dateCompare));
        return;
    }

    $response = solrRequest($solrUrl . '/select', $params);
    $data     = json_decode($response, true);

    if (!$data) {
        http_response_code(500);
        json(['error' => 'Solr returned invalid response', 'raw' => substr($response, 0, 500)]);
        return;
    }

    json([
        'total'   => $data['response']['numFound'] ?? 0,
        'page'    => $page,
        'rows'    => $rows,
        'docs'    => $data['response']['docs']        ?? [],
        'timing'  => $data['responseHeader']['QTime'] ?? null,
        'debug_fq' => $fqs,  // helpful for debugging
    ]);
}

// ── COMBINED USER FILTERS (AND/OR) ────────────────────────────────────────────
// Builds a single Solr query string from flat filter array respecting op field
// Example output: "(Price_f:[30 TO 40]) AND (Brand_Name_s:*Ashley*)"
// Or with OR:    "(Price_f:[30 TO 40]) OR (Brand_Name_s:*Ashley*)"
function buildCombinedUserFilters(array $filters): ?string {
    if (empty($filters)) return null;

    // Build clause for each filter
    $clauses = [];
    foreach ($filters as $f) {
        $clause = buildSingleFilterClause($f);
        if ($clause !== null) {
            $clauses[] = [
                'op'     => strtoupper(trim($f['op'] ?? 'AND')),
                'clause' => $clause,
            ];
        }
    }

    if (empty($clauses)) return null;
    if (count($clauses) === 1) return $clauses[0]['clause'];

    // Build the combined query string
    // First clause has no operator prefix
    // Subsequent clauses use their op
    $result = '(' . $clauses[0]['clause'] . ')';
    for ($i = 1; $i < count($clauses); $i++) {
        $op      = $clauses[$i]['op'] === 'OR' ? 'OR' : 'AND';
        $result .= ' ' . $op . ' (' . $clauses[$i]['clause'] . ')';
    }

    return $result;
}

// ── NESTED FILTER GROUPS ──────────────────────────────────────────────────────
function buildNestedFilterGroups(array $groups): array {
    $fqs = [];
    foreach ($groups as $group) {
        $conditions = $group['conditions'] ?? [];
        $groupOp    = strtoupper($group['op'] ?? 'AND');
        $clauses    = [];
        foreach ($conditions as $c) {
            $clause = buildSingleFilterClause($c);
            if ($clause !== null) $clauses[] = '(' . $clause . ')';
        }
        if (!empty($clauses)) {
            $fqs[] = implode(' ' . $groupOp . ' ', $clauses);
        }
    }
    return $fqs;
}

// ── SINGLE FILTER CLAUSE ──────────────────────────────────────────────────────
function buildSingleFilterClause(array $f): ?string {
    $field = trim($f['field'] ?? '');
    $type  = strtolower(trim($f['type']  ?? 'text'));
    $value = $f['value'] ?? null;
    if (!$field) return null;

    // source_file_s: always plain term (handled separately, but just in case)
    if ($field === 'source_file_s') {
        if ($value === null || $value === '') return null;
        return $field . ':' . $value;
    }

    switch ($type) {
        case 'term':
            if ($value === null || $value === '') return null;
            return "$field:$value";

        case 'exact':
            if ($value === null || $value === '') return null;
            $v = (string)$value;
            // Plain single token on _s fields — no quotes
            if (str_ends_with($field, '_s') && !str_contains($v, ' ') && !str_contains($v, ':'))
                return "$field:$v";
            return $field . ':"' . addslashes($v) . '"';

        case 'range':
        case 'number_range':
            // FIXED: properly handle numeric ranges
            $min = $f['min'] ?? '';
            $max = $f['max'] ?? '';
            // Treat empty string, null, undefined as wildcard
            $minVal = ($min !== '' && $min !== null) ? (string)$min : '*';
            $maxVal = ($max !== '' && $max !== null) ? (string)$max : '*';
            // Validate numeric
            if ($minVal !== '*' && !is_numeric($minVal)) $minVal = '*';
            if ($maxVal !== '*' && !is_numeric($maxVal)) $maxVal = '*';
            if ($minVal === '*' && $maxVal === '*') return null;
            return "$field:[$minVal TO $maxVal]";

        case 'date_range':
            $from = $f['from'] ?? '';
            $to   = $f['to']   ?? '';
            if (!$from && !$to) return null;
            $from = $from ? date('Y-m-d\TH:i:s\Z', strtotime($from)) : '*';
            $to   = $to   ? date('Y-m-d\TH:i:s\Z', strtotime($to))   : '*';
            return "$field:[$from TO $to]";

        case 'multi_select':
            $vals = array_filter(is_array($value) ? $value : [$value]);
            if (empty($vals)) return null;
            $escaped = array_map(fn($v) => '"' . addslashes((string)$v) . '"', $vals);
            return "$field:(" . implode(' OR ', $escaped) . ")";

        case 'boolean':
            if ($value === null || $value === '') return null;
            $boolVal = ($value === true || $value === 'true' || $value === 1 || $value === '1') ? 'true' : 'false';
            return "$field:$boolVal";

        default: // text wildcard — FIXED: handles dates and mixed strings
            if ($value === null || $value === '') return null;
            $v       = (string)$value;
            // Escape Solr special chars (keep alphanumeric, spaces, slashes, colons for dates)
            $escaped = preg_replace('/([+\-&|!(){}\[\]\^"~?\\\\])/', '\\\\$1', $v);
            if ($escaped === '') return null;
            // If it looks like a date/datetime, try exact match first
            if (preg_match('/^\d{2}\/\d{2}\/\d{4}/', $escaped)) {
                return "$field:*$escaped*";
            }
            return "$field:*$escaped*";
    }
}

// ── FACETS ────────────────────────────────────────────────────────────────────
function handleFacets(string $solrUrl): void {
    $body   = getBody();
    $fields = (array)($body['fields'] ?? []);
    $limit  = min((int)($body['limit'] ?? 50), 500);
    $q      = $body['q'] ?? '*:*';

    // Build context fqs for facets
    $fqs = [];
    $fileFilter  = null;
    $userFilters = [];
    foreach (($body['filters'] ?? []) as $f) {
        if (($f['field'] ?? '') === 'source_file_s') {
            $fileFilter = $f;
        } else {
            $userFilters[] = $f;
        }
    }
    if ($fileFilter) $fqs[] = 'source_file_s:' . ($fileFilter['value'] ?? '');
    $combined = buildCombinedUserFilters($userFilters);
    if ($combined !== null) $fqs[] = $combined;

    if (empty($fields)) { json(['facets' => []]); return; }

    $params = [
        'q'              => $q,
        'rows'           => 0,
        'facet'          => 'true',
        'facet.limit'    => $limit,
        'facet.mincount' => 1,
        'wt'             => 'json',
    ];
    foreach ($fields as $f) $params['facet.field'][] = $f;
    if (!empty($fqs)) $params['fq'] = $fqs;

    $response = solrRequest($solrUrl . '/select', $params);
    $data     = json_decode($response, true);

    $facets = [];
    foreach (($data['facet_counts']['facet_fields'] ?? []) as $field => $values) {
        $facets[$field] = [];
        for ($i = 0; $i < count($values); $i += 2) {
            $facets[$field][] = ['value' => $values[$i], 'count' => $values[$i + 1]];
        }
    }
    json(['facets' => $facets]);
}

// ── COLUMN CONFIG ─────────────────────────────────────────────────────────────
function handleSaveColumnConfig(): void {
    $body     = getBody();
    $reportId = preg_replace('/[^a-zA-Z0-9_\-\.]/', '_', $body['report_id'] ?? 'default');
    $userId   = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $body['user_id']   ?? 'default');
    $config   = $body['config'] ?? [];
    $f        = __DIR__ . "/../storage/column_configs/{$userId}_{$reportId}.json";
    @mkdir(dirname($f), 0777, true);
    file_put_contents($f, json_encode(['report_id' => $reportId, 'user_id' => $userId, 'config' => $config, 'updated_at' => date('c')], JSON_PRETTY_PRINT));
    json(['success' => true]);
}

function handleGetColumnConfig(): void {
    $reportId = preg_replace('/[^a-zA-Z0-9_\-\.]/', '_', $_GET['report_id'] ?? 'default');
    $userId   = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $_GET['user_id']   ?? 'default');
    $f        = __DIR__ . "/../storage/column_configs/{$userId}_{$reportId}.json";
    if (!file_exists($f)) { json(['config' => []]); return; }
    json(['config' => (json_decode(file_get_contents($f), true)['config'] ?? [])]);
}

// ── SAVED VIEWS ───────────────────────────────────────────────────────────────
function handleGetViews(): void {
    $f = __DIR__ . '/../storage/views.json';
    json(['views' => file_exists($f) ? (json_decode(file_get_contents($f), true) ?? []) : []]);
}

function handleSaveView(array $user = []): void {
    $body = getBody();
    if (empty($body['name'])) { http_response_code(400); json(['error' => 'name required']); return; }
    $f     = __DIR__ . '/../storage/views.json';
    @mkdir(dirname($f), 0777, true);
    $views = file_exists($f) ? (json_decode(file_get_contents($f), true) ?? []) : [];
    $view  = [
        'id'           => 'view_' . uniqid(),
        'name'         => $body['name'],
        'columns'      => $body['columns']      ?? [],
        'columnOrder'  => $body['columnOrder']  ?? [],
        'filters'      => $body['filters']      ?? [],
        'filterGroups' => $body['filterGroups'] ?? null,
        'sort'         => $body['sort']         ?? null,
        'columnWidths' => $body['columnWidths'] ?? [],
        'created_by'   => $user['id'] ?? 'anonymous',
        'shared'       => (bool)($body['shared'] ?? false),
        'is_default'   => (bool)($body['is_default'] ?? false),
        'version'      => 1,
        'created_at'   => date('c'),
    ];
    // Handle default view: unset previous default for this user
    if ($view['is_default']) {
        $views = array_map(function($v) use ($user) {
            if (($v['created_by'] ?? '') === ($user['id'] ?? 'anonymous')) $v['is_default'] = false;
            return $v;
        }, $views);
    }
    $views[] = $view;
    file_put_contents($f, json_encode($views, JSON_PRETTY_PRINT));
    json(['success' => true, 'view' => $view]);
}

function handleDeleteView(): void {
    $body = getBody();
    $id   = $body['id'] ?? null;
    if (!$id) { http_response_code(400); json(['error' => 'id required']); return; }
    $f     = __DIR__ . '/../storage/views.json';
    $views = file_exists($f) ? (json_decode(file_get_contents($f), true) ?? []) : [];
    $views = array_values(array_filter($views, fn($v) => $v['id'] !== $id));
    file_put_contents($f, json_encode($views, JSON_PRETTY_PRINT));
    json(['success' => true]);
}

// ── REAL-TIME STREAM (SSE) ────────────────────────────────────────────────────
function handleStream(): void {
    // Server-Sent Events for real-time indexing progress
    header('Content-Type: text/event-stream');
    header('Cache-Control: no-cache');
    header('Connection: keep-alive');
    header('X-Accel-Buffering: no');
    // Flush headers immediately
    if (ob_get_level()) ob_end_flush();
    $pidFile  = '/tmp/producer.pid';
    $logFiles = glob('/tmp/producer_*.log');
    rsort($logFiles);
    $logFile  = $logFiles[0] ?? null;
    $lastSize = 0;
    $maxTime  = 60; // max 60s stream
    $start    = time();
    while ((time() - $start) < $maxTime) {
        $running = false;
        if (file_exists($pidFile)) {
            $pid     = trim(file_get_contents($pidFile));
            $running = $pid && is_numeric($pid) && file_exists("/proc/$pid");
        }
        // Send new log lines
        if ($logFile && file_exists($logFile)) {
            $size = filesize($logFile);
            if ($size > $lastSize) {
                $content  = file_get_contents($logFile, false, null, $lastSize);
                $lastSize = $size;
                foreach (explode("\n", rtrim($content)) as $line) {
                    if ($line) {
                        echo "data: " . json_encode(['type' => 'log', 'message' => $line, 'running' => $running]) . "\n\n";
                        flush();
                    }
                }
            }
        }
        echo "data: " . json_encode(['type' => 'status', 'running' => $running]) . "\n\n";
        flush();
        if (!$running && time() - $start > 5) break; // Stop if not running after 5s warmup
        usleep(1500000); // 1.5s poll
    }
    echo "data: " . json_encode(['type' => 'done']) . "\n\n";
    flush();
    exit;
}

// ── AUDIT LOG ────────────────────────────────────────────────────────────────
function logAudit(array $user, string $action, string $path): void {
    $f = __DIR__ . '/../storage/audit_log.json';
    @mkdir(dirname($f), 0777, true);
    $logs = file_exists($f) ? (json_decode(file_get_contents($f), true) ?? []) : [];
    $body = getBody();
    $entry = [
        'id'         => uniqid('audit_', true),
        'user_id'    => $user['id']   ?? 'anonymous',
        'user_name'  => $user['name'] ?? 'Anonymous',
        'user_role'  => $user['role'] ?? 'viewer',
        'action'     => $action,
        'path'       => $path,
        'detail'     => [
            'file'    => $body['file'] ?? null,
            'name'    => $body['name'] ?? null,
            'filters' => isset($body['filters']) ? count($body['filters']) . ' filters' : null,
        ],
        'ip'         => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
        'user_agent' => substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 100),
        'created_at' => date('c'),
    ];
    array_unshift($logs, $entry);  // newest first
    // Keep last 500 entries
    if (count($logs) > 500) $logs = array_slice($logs, 0, 500);
    file_put_contents($f, json_encode($logs, JSON_PRETTY_PRINT));
}

function handleGetAuditLog(): void {
    $f    = __DIR__ . '/../storage/audit_log.json';
    $logs = file_exists($f) ? (json_decode(file_get_contents($f), true) ?? []) : [];
    $limit = min((int)($_GET['limit'] ?? 50), 200);
    $page  = max(1, (int)($_GET['page'] ?? 1));
    $total = count($logs);
    $paged = array_slice($logs, ($page - 1) * $limit, $limit);
    json(['entries' => $paged, 'total' => $total, 'page' => $page, 'limit' => $limit]);
}

function handleClearAuditLog(): void {
    $f = __DIR__ . '/../storage/audit_log.json';
    file_put_contents($f, '[]');
    json(['success' => true]);
}

// ── RBAC ─────────────────────────────────────────────────────────────────────
function resolveUser(): array {
    // Simple header-based user resolution
    // In production: verify JWT token from Authorization header
    $userId   = $_SERVER['HTTP_X_USER_ID']   ?? ($_COOKIE['user_id'] ?? 'default');
    $userName = $_SERVER['HTTP_X_USER_NAME'] ?? 'Default User';
    $userRole = $_SERVER['HTTP_X_USER_ROLE'] ?? 'admin'; // default to admin for now
    // Load stored user preferences
    $usersFile = __DIR__ . '/../storage/users.json';
    $users     = file_exists($usersFile) ? (json_decode(file_get_contents($usersFile), true) ?? []) : [];
    foreach ($users as $u) {
        if ($u['id'] === $userId) return $u;
    }
    return ['id' => $userId, 'name' => $userName, 'role' => $userRole, 'permissions' => ['read', 'write', 'export', 'admin']];
}

// ── SCHEDULED REPORTS ─────────────────────────────────────────────────────────
function handleGetSchedules(): void {
    $f = __DIR__ . '/../storage/schedules.json';
    json(['schedules' => file_exists($f) ? (json_decode(file_get_contents($f), true) ?? []) : []]);
}

function handleSaveSchedule(array $user = []): void {
    $body = getBody();
    if (empty($body['name'])) { http_response_code(400); json(['error' => 'name required']); return; }
    $f         = __DIR__ . '/../storage/schedules.json';
    @mkdir(dirname($f), 0777, true);
    $schedules = file_exists($f) ? (json_decode(file_get_contents($f), true) ?? []) : [];
    $sched     = [
        'id'         => 'sched_' . uniqid(),
        'name'       => $body['name'],
        'frequency'  => $body['frequency']  ?? 'daily',     // daily, weekly, monthly
        'time'       => $body['time']        ?? '08:00',
        'email'      => $body['email']       ?? '',
        'format'     => $body['format']      ?? 'csv',      // csv, excel
        'view_id'    => $body['view_id']     ?? null,
        'filters'    => $body['filters']     ?? [],
        'columns'    => $body['columns']     ?? [],
        'created_by' => $user['id']          ?? 'anonymous',
        'enabled'    => true,
        'last_run'   => null,
        'next_run'   => computeNextRun($body['frequency'] ?? 'daily', $body['time'] ?? '08:00'),
        'created_at' => date('c'),
    ];
    $schedules[] = $sched;
    file_put_contents($f, json_encode($schedules, JSON_PRETTY_PRINT));
    json(['success' => true, 'schedule' => $sched]);
}

function handleDeleteSchedule(): void {
    $body = getBody();
    $id   = $body['id'] ?? null;
    if (!$id) { http_response_code(400); json(['error' => 'id required']); return; }
    $f         = __DIR__ . '/../storage/schedules.json';
    $schedules = file_exists($f) ? (json_decode(file_get_contents($f), true) ?? []) : [];
    $schedules = array_values(array_filter($schedules, fn($s) => $s['id'] !== $id));
    file_put_contents($f, json_encode($schedules, JSON_PRETTY_PRINT));
    json(['success' => true]);
}

function computeNextRun(string $freq, string $time): string {
    $now    = time();
    $ts     = strtotime(date('Y-m-d') . ' ' . $time);
    if ($ts <= $now) $ts += 86400;
    if ($freq === 'weekly')  $ts += 6 * 86400;
    if ($freq === 'monthly') $ts = strtotime('+1 month', $ts);
    return date('c', $ts);
}

// ── EXCEL EXPORT (CSV with Excel MIME + BOM) ───────────────────────────────────
function handleExcelExport(string $solrUrl): void {
    $body    = getBody();
    $filters = $body['filters'] ?? [];
    $columns = $body['columns'] ?? [];
    $sort    = sanitizeSort($body['sort'] ?? 'score desc');
    // Build fqs
    $fqs = [];
    foreach ($filters as $f) {
        if (($f['field'] ?? '') === 'source_file_s') {
            $fqs[] = 'source_file_s:' . ($f['value'] ?? '');
        } else {
            $clause = buildSingleFilterClause($f);
            if ($clause) $fqs[] = $clause;
        }
    }
    // Fetch up to 10000 rows for export
    $params = [
        'q'      => '*:*',
        'rows'   => min((int)($body['rows'] ?? 1000), 10000),
        'start'  => 0,
        'sort'   => $sort,
        'fl'     => '*',
        'wt'     => 'json',
        'indent' => 'false',
    ];
    if (!empty($fqs)) $params['fq'] = $fqs;
    $response = solrRequest($solrUrl . '/select', $params);
    $data     = json_decode($response, true);
    $docs     = $data['response']['docs'] ?? [];
    // Build CSV with BOM for Excel
    $SKIP   = ['id', '_version_', '_root_', 'source_file_s', 'ingested_at_dt', '_text_'];
    $useCol = !empty($columns) ? $columns : (!empty($docs) ? array_keys($docs[0]) : []);
    $useCol = array_filter($useCol, fn($c) => !in_array($c, $SKIP));
    // Output as Excel-compatible CSV
    header('Content-Type: application/vnd.ms-excel; charset=UTF-8');
    header('Content-Disposition: attachment; filename="export_' . date('Ymd_His') . '.xls"');
    header('Pragma: no-cache');
    echo "\xEF\xBB\xBF"; // UTF-8 BOM
    // Header row
    $headerRow = array_map(fn($c) => '"' . formatLabel($c) . '"', array_values($useCol));
    echo implode("\t", $headerRow) . "\r\n";
    // Data rows
    foreach ($docs as $doc) {
        $row = [];
        foreach ($useCol as $col) {
            $val = $doc[$col] ?? '';
            if (is_array($val)) $val = implode(', ', $val);
            $val = str_replace(['"', "\t", "\r", "\n"], ['\'', ' ', ' ', ' '], (string)$val);
            $row[] = '"' . $val . '"';
        }
        echo implode("\t", $row) . "\r\n";
    }
    exit;
}

// ── AGGREGATIONS ──────────────────────────────────────────────────────────────
function handleAggregate(string $solrUrl): void {
    $body    = getBody();
    $field   = $body['field']   ?? null;
    $metric  = $body['metric']  ?? 'count';  // count, sum, avg, min, max
    $numField = $body['numField'] ?? null;
    $filters = $body['filters'] ?? [];
    if (!$field) { http_response_code(400); json(['error' => 'field required']); return; }
    $fqs = [];
    foreach ($filters as $f) {
        if (($f['field'] ?? '') === 'source_file_s') {
            $fqs[] = 'source_file_s:' . ($f['value'] ?? '');
        } else {
            $clause = buildSingleFilterClause($f);
            if ($clause) $fqs[] = $clause;
        }
    }
    $params = [
        'q'              => '*:*',
        'rows'           => 0,
        'facet'          => 'true',
        'facet.field'    => $field,
        'facet.limit'    => (int)($body['limit'] ?? 20),
        'facet.mincount' => 1,
        'wt'             => 'json',
    ];
    if (!empty($fqs)) $params['fq'] = $fqs;
    // Add stats if numeric field provided
    if ($numField && $metric !== 'count') {
        $params['stats'] = 'true';
        $params['stats.field'] = $numField;
    }
    $response = solrRequest($solrUrl . '/select', $params);
    $data     = json_decode($response, true);
    $facetVals = $data['facet_counts']['facet_fields'][$field] ?? [];
    $buckets   = [];
    for ($i = 0; $i < count($facetVals); $i += 2) {
        $buckets[] = ['value' => $facetVals[$i], 'count' => $facetVals[$i + 1]];
    }
    $stats = null;
    if ($numField && isset($data['stats']['stats_fields'][$numField])) {
        $stats = $data['stats']['stats_fields'][$numField];
    }
    json(['buckets' => $buckets, 'stats' => $stats, 'total' => count($buckets)]);
}

// ── DATE COMPARE ──────────────────────────────────────────────────────────────
function executeDateCompare(string $solrUrl, array $params, array $dc): array {
    $field   = $dc['field'] ?? 'ingested_at_dt';
    $type    = $dc['type']  ?? 'previous_period';
    $from    = strtotime($dc['from'] ?? '-30 days');
    $to      = strtotime($dc['to']   ?? 'now');
    $diff    = $to - $from;

    $curParams         = $params;
    $curParams['fq'][] = "$field:[" . date('Y-m-d\TH:i:s\Z', $from) . " TO " . date('Y-m-d\TH:i:s\Z', $to) . "]";

    $cmpFrom           = $type === 'previous_period' ? $from - $diff : strtotime('-1 year', $from);
    $cmpTo             = $type === 'previous_period' ? $from         : strtotime('-1 year', $to);
    $cmpParams         = $params;
    $cmpParams['fq'][] = "$field:[" . date('Y-m-d\TH:i:s\Z', $cmpFrom) . " TO " . date('Y-m-d\TH:i:s\Z', $cmpTo) . "]";

    $cur      = json_decode(solrRequest($solrUrl . '/select', $curParams), true);
    $cmp      = json_decode(solrRequest($solrUrl . '/select', $cmpParams), true);
    $curTotal = $cur['response']['numFound']  ?? 0;
    $cmpTotal = $cmp['response']['numFound']  ?? 0;
    $absDiff  = $curTotal - $cmpTotal;
    $pct      = $cmpTotal > 0 ? round(($absDiff / $cmpTotal) * 100, 2) : null;

    return [
        'current'    => ['total' => $curTotal, 'docs' => $cur['response']['docs'] ?? [], 'period' => ['from' => $dc['from'], 'to' => $dc['to']]],
        'compare'    => ['total' => $cmpTotal, 'docs' => $cmp['response']['docs'] ?? [], 'period' => ['from' => date('Y-m-d', $cmpFrom), 'to' => date('Y-m-d', $cmpTo)]],
        'difference' => ['absolute' => $absDiff, 'percentage' => $pct],
        'type'       => $type,
    ];
}

// ── PRODUCE ───────────────────────────────────────────────────────────────────
function handleProduce(string $kafkaBroker): void {
    $body    = getBody();
    $csvFile = $body['file'] ?? null;
    $csvPath = '/app/csv';
    $files   = glob($csvPath . '/*.csv');

    if (empty($files)) { json(['success' => false, 'error' => 'No CSV files found in /app/csv']); return; }
    if ($csvFile) {
        $target = $csvPath . '/' . basename($csvFile);
        if (!file_exists($target)) { json(['success' => false, 'error' => "File not found: $csvFile"]); return; }
    }

    $pidFile = '/tmp/producer.pid';
    $logFile = '/tmp/producer_' . date('YmdHis') . '.log';

    if (file_exists($pidFile)) {
        $pid = trim(file_get_contents($pidFile));
        if ($pid && is_numeric($pid) && (file_exists("/proc/$pid") || exec("kill -0 $pid 2>/dev/null; echo \$?") === "0")) {
            json(['success' => false, 'error' => "Producer already running (PID: $pid)"]); return;
        }
        unlink($pidFile);
    }

    $targetPath = $csvFile ? "$csvPath/" . basename($csvFile) : $csvPath;
    shell_exec("nohup php -d memory_limit=1G /app/producer.php '$targetPath' > $logFile 2>&1 & echo \$! > $pidFile");
    usleep(800000);

    $pid      = file_exists($pidFile) ? trim(file_get_contents($pidFile)) : null;
    $logLines = file_exists($logFile) ? array_slice(file($logFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES), -5) : [];

    json(['success' => true, 'pid' => $pid, 'log_tail' => $logLines, 'csv_files' => array_map('basename', $files),
        'message' => "Producer started (PID: $pid). Indexing " . ($csvFile ? basename($csvFile) : count($files) . ' files') . "."]);
}

function handleProduceStatus(): void {
    $pidFile = '/tmp/producer.pid';
    $pid     = file_exists($pidFile) ? trim(file_get_contents($pidFile)) : null;
    $running = $pid && is_numeric($pid) && file_exists("/proc/$pid");
    if (!$running && file_exists($pidFile)) unlink($pidFile);
    $logFiles = glob('/tmp/producer_*.log'); rsort($logFiles);
    $logLines = ($logFiles[0] ?? null) ? array_slice(file($logFiles[0], FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES), -10) : [];
    json(['running' => $running, 'pid' => $pid, 'log' => $logLines]);
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function inferType(string $name, mixed $val = null): string {
    if (str_ends_with($name, '_i'))   return 'integer';
    if (str_ends_with($name, '_f'))   return 'float';
    if (str_ends_with($name, '_b'))   return 'boolean';
    if (str_ends_with($name, '_dt'))  return 'date';
    if (str_ends_with($name, '_s'))   return 'string';
    if (str_ends_with($name, '_txt')) return 'text';
    if (is_int($val))   return 'integer';
    if (is_float($val)) return 'float';
    if (is_bool($val))  return 'boolean';
    return 'string';
}

function formatLabel(string $name): string {
    $name = preg_replace('/(_s|_i|_f|_b|_dt|_txt)$/', '', $name);
    return ucwords(str_replace('_', ' ', strtolower($name)));
}

function sanitizeSort(string $sort): string {
    return preg_match('/^[a-zA-Z0-9_]+ (asc|desc)$/', trim($sort)) ? trim($sort) : 'score desc';
}

function solrRequest(string $url, array $params): string {
    $parts = [];
    foreach ($params as $key => $values) {
        foreach ((array)$values as $value)
            $parts[] = urlencode($key) . '=' . urlencode((string)$value);
    }
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => implode('&', $parts),
        CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 60,
        CURLOPT_CONNECTTIMEOUT => 10,
    ]);
    $r = curl_exec($ch); $err = curl_error($ch); curl_close($ch);
    return $err ? json_encode(['error' => $err]) : ($r ?: '{}');
}

function solrGet(string $url): string {
    $ch = curl_init();
    curl_setopt_array($ch, [CURLOPT_URL => $url, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15]);
    $r = curl_exec($ch); curl_close($ch);
    return $r ?: '{}';
}

function getBody(): array { return json_decode(file_get_contents('php://input'), true) ?? []; }
function json(mixed $data): void { echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT); exit; }