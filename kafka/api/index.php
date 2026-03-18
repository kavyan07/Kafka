<?php

/**
 * Dynamic Reporting API
 * Routes: /api/query, /api/schema, /api/facets, /api/views, /api/produce
 */

require_once __DIR__ . '/../vendor/autoload.php';

use Monolog\Logger;
use Monolog\Handler\StreamHandler;

// ── CORS Headers ──────────────────────────────────────────────────────────────
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Config ────────────────────────────────────────────────────────────────────
$solrUrl = getenv('SOLR_URL') ?: 'http://solr:8983/solr/csvcore';
$kafkaBroker = getenv('KAFKA_BROKER') ?: 'kafka:9092';

$log = new Logger('api');
$log->pushHandler(new StreamHandler('php://stderr', Logger::WARNING));

// ── Router ────────────────────────────────────────────────────────────────────
$uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

$uri = preg_replace('#^/api#', '', $uri);

switch (true) {
    case $uri === '/query'  && $method === 'POST': handleQuery($solrUrl);  break;
    case $uri === '/schema' && $method === 'GET':  handleSchema($solrUrl); break;
    case $uri === '/facets' && $method === 'POST': handleFacets($solrUrl); break;
    case $uri === '/views'  && $method === 'GET':  handleGetViews();       break;
    case $uri === '/views'  && $method === 'POST': handleSaveView();       break;
    case $uri === '/views'  && $method === 'DELETE': handleDeleteView();   break;
    case $uri === '/produce'&& $method === 'POST': handleProduce($kafkaBroker); break;
    case $uri === '/health' && $method === 'GET':  json(['status' => 'ok', 'time' => date('c')]); break;
    default:
        http_response_code(404);
        json(['error' => 'Not found', 'path' => $uri]);
}

// ── Handlers ──────────────────────────────────────────────────────────────────

function handleQuery(string $solrUrl): void
{
    $body = getBody();

    $rows    = (int)($body['rows']   ?? 50);
    $page    = (int)($body['page']   ?? 1);
    $start   = ($page - 1) * $rows;
    $sort    = $body['sort']   ?? 'score desc';
    $q       = $body['q']     ?? '*:*';
    $fields  = $body['fields'] ?? ['*'];
    $filters = $body['filters'] ?? [];
    $dateCompare = $body['dateCompare'] ?? null;

    // Build filter queries
    $fqs = buildFilterQueries($filters);

    // Build Solr params
    $params = [
        'q'     => $q,
        'rows'  => $rows,
        'start' => $start,
        'sort'  => $sort,
        'fl'    => implode(',', $fields),
        'wt'    => 'json',
        'indent' => 'false',
    ];

    if (!empty($fqs)) {
        $params['fq'] = $fqs;
    }

    // Date compare: dual query
    if ($dateCompare) {
        $result = executeDateCompare($solrUrl, $params, $dateCompare);
        json($result);
        return;
    }

    $response = solrRequest($solrUrl . '/select', $params);
    $data = json_decode($response, true);

    json([
        'total'    => $data['response']['numFound'] ?? 0,
        'page'     => $page,
        'rows'     => $rows,
        'docs'     => $data['response']['docs'] ?? [],
        'facets'   => $data['facet_counts'] ?? null,
        'timing'   => $data['responseHeader']['QTime'] ?? null,
    ]);
}

function handleSchema(string $solrUrl): void
{
    $response = solrGet($solrUrl . '/schema/fields?wt=json&indent=false');
    $data = json_decode($response, true);

    $fields = [];
    foreach (($data['fields'] ?? []) as $field) {
        $name = $field['name'];
        if (str_starts_with($name, '_')) continue;

        $type = inferType($name);
        $fields[] = [
            'name'       => $name,
            'label'      => formatLabel($name),
            'type'       => $type,
            'sortable'   => true,
            'filterable' => true,
        ];
    }

    // Also get dynamic field examples by querying a sample doc
    $sampleResp = solrGet($solrUrl . '/select?q=*:*&rows=1&wt=json');
    $sampleData = json_decode($sampleResp, true);
    $sampleDoc  = $sampleData['response']['docs'][0] ?? [];

    $dynamicFields = [];
    foreach ($sampleDoc as $key => $val) {
        if (str_starts_with($key, '_') || $key === 'id') continue;
        $dynamicFields[] = [
            'name'       => $key,
            'label'      => formatLabel($key),
            'type'       => inferType($key),
            'sortable'   => true,
            'filterable' => true,
        ];
    }

    json(['fields' => empty($fields) ? $dynamicFields : $fields]);
}

function handleFacets(string $solrUrl): void
{
    $body   = getBody();
    $fields = $body['fields'] ?? [];
    $limit  = (int)($body['limit'] ?? 50);
    $prefix = $body['prefix'] ?? '';
    $fqs    = buildFilterQueries($body['filters'] ?? []);

    if (empty($fields)) {
        json(['facets' => []]);
        return;
    }

    $params = [
        'q'           => '*:*',
        'rows'        => 0,
        'facet'       => 'true',
        'facet.limit' => $limit,
        'facet.mincount' => 1,
        'wt'          => 'json',
    ];

    foreach ($fields as $f) {
        $params['facet.field'][] = $f;
    }

    if ($prefix) {
        $params['facet.prefix'] = $prefix;
    }

    if (!empty($fqs)) {
        $params['fq'] = $fqs;
    }

    $response = solrRequest($solrUrl . '/select', $params);
    $data = json_decode($response, true);

    $facets = [];
    $facetFields = $data['facet_counts']['facet_fields'] ?? [];
    foreach ($facetFields as $field => $values) {
        $facets[$field] = [];
        for ($i = 0; $i < count($values); $i += 2) {
            $facets[$field][] = [
                'value' => $values[$i],
                'count' => $values[$i + 1],
            ];
        }
    }

    json(['facets' => $facets]);
}

function handleGetViews(): void
{
    $viewsFile = __DIR__ . '/../storage/views.json';
    if (!file_exists($viewsFile)) {
        json(['views' => []]);
        return;
    }
    $views = json_decode(file_get_contents($viewsFile), true) ?? [];
    json(['views' => $views]);
}

function handleSaveView(): void
{
    $body = getBody();
    if (empty($body['name'])) {
        http_response_code(400);
        json(['error' => 'name required']);
        return;
    }

    $viewsFile = __DIR__ . '/../storage/views.json';
    @mkdir(dirname($viewsFile), 0777, true);

    $views = file_exists($viewsFile)
        ? (json_decode(file_get_contents($viewsFile), true) ?? [])
        : [];

    $view = [
        'id'         => 'view_' . uniqid(),
        'name'       => $body['name'],
        'columns'    => $body['columns'] ?? [],
        'filters'    => $body['filters'] ?? [],
        'sort'       => $body['sort'] ?? null,
        'created_at' => date('c'),
        'is_default' => $body['is_default'] ?? false,
    ];

    $views[] = $view;
    file_put_contents($viewsFile, json_encode($views, JSON_PRETTY_PRINT));

    json(['success' => true, 'view' => $view]);
}

function handleDeleteView(): void
{
    $body = getBody();
    $id   = $body['id'] ?? null;

    if (!$id) {
        http_response_code(400);
        json(['error' => 'id required']);
        return;
    }

    $viewsFile = __DIR__ . '/../storage/views.json';
    $views = file_exists($viewsFile)
        ? (json_decode(file_get_contents($viewsFile), true) ?? [])
        : [];

    $views = array_values(array_filter($views, fn($v) => $v['id'] !== $id));
    file_put_contents($viewsFile, json_encode($views, JSON_PRETTY_PRINT));

    json(['success' => true]);
}

function handleProduce(string $kafkaBroker): void
{
    $body = getBody();

    // Trigger producer script async
    $csvPath = '/app/csv';
    $cmd = "php /app/producer.php $csvPath > /tmp/producer.log 2>&1 &";
    exec($cmd);

    json(['success' => true, 'message' => 'Producer triggered']);
}

// ── Query Builder ─────────────────────────────────────────────────────────────

function buildFilterQueries(array $filters): array
{
    $fqs = [];
    foreach ($filters as $filter) {
        $fq = buildSingleFilter($filter);
        if ($fq) $fqs[] = $fq;
    }
    return $fqs;
}

function buildSingleFilter(array $filter): ?string
{
    $field = $filter['field'] ?? null;
    $type  = $filter['type']  ?? 'text';
    $value = $filter['value'] ?? null;
    $op    = $filter['op']    ?? 'AND';

    if (!$field || $value === null || $value === '') return null;

    switch ($type) {
        case 'range':
            $min = $filter['min'] ?? '*';
            $max = $filter['max'] ?? '*';
            return "$field:[$min TO $max]";

        case 'date_range':
            $from = $filter['from'] ?? '*';
            $to   = $filter['to']   ?? '*';
            // Convert to Solr date format
            if ($from !== '*') $from = date('Y-m-d\TH:i:s\Z', strtotime($from));
            if ($to   !== '*') $to   = date('Y-m-d\TH:i:s\Z', strtotime($to));
            return "$field:[$from TO $to]";

        case 'multi_select':
            $vals = is_array($value) ? $value : [$value];
            $escaped = array_map(fn($v) => '"' . addslashes($v) . '"', $vals);
            return "$field:(" . implode(' OR ', $escaped) . ")";

        case 'boolean':
            return "$field:" . ($value ? 'true' : 'false');

        case 'nested':
            // Recursive: (A AND B) OR C
            $children = $filter['children'] ?? [];
            $parts = array_filter(array_map('buildSingleFilter', $children));
            if (empty($parts)) return null;
            return '(' . implode(" $op ", $parts) . ')';

        default: // text
            return "$field:*" . addslashes($value) . '*';
    }
}

function executeDateCompare(string $solrUrl, array $params, array $dateCompare): array
{
    // Current period query
    $currentResult = json_decode(solrRequest($solrUrl . '/select', $params), true);

    // Build compare period params
    $compareParams = $params;
    $compareField  = $dateCompare['field'] ?? 'date_dt';
    $compareType   = $dateCompare['type']  ?? 'previous_period';
    $from = strtotime($dateCompare['from'] ?? '-30 days');
    $to   = strtotime($dateCompare['to']   ?? 'now');
    $diff = $to - $from;

    if ($compareType === 'previous_period') {
        $cFrom = date('Y-m-d\TH:i:s\Z', $from - $diff);
        $cTo   = date('Y-m-d\TH:i:s\Z', $from);
    } else { // same_period_last_year
        $cFrom = date('Y-m-d\TH:i:s\Z', strtotime('-1 year', $from));
        $cTo   = date('Y-m-d\TH:i:s\Z', strtotime('-1 year', $to));
    }

    $compareParams['fq'][] = "$compareField:[$cFrom TO $cTo]";
    $compareResult = json_decode(solrRequest($solrUrl . '/select', $compareParams), true);

    $currentTotal  = $currentResult['response']['numFound'] ?? 0;
    $compareTotal  = $compareResult['response']['numFound'] ?? 0;
    $absDiff       = $currentTotal - $compareTotal;
    $pctChange     = $compareTotal > 0
        ? round(($absDiff / $compareTotal) * 100, 2)
        : null;

    return [
        'current'    => ['total' => $currentTotal, 'docs' => $currentResult['response']['docs'] ?? []],
        'compare'    => ['total' => $compareTotal,  'docs' => $compareResult['response']['docs'] ?? []],
        'difference' => ['absolute' => $absDiff, 'percentage' => $pctChange],
    ];
}

// ── Solr Helpers ──────────────────────────────────────────────────────────────

function solrRequest(string $url, array $params): string
{
    $ch = curl_init();
    $postData = http_build_query($params, '', '&', PHP_QUERY_RFC3986);

    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $postData,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
    ]);

    $response = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);

    if ($err) throw new RuntimeException("cURL error: $err");
    return $response;
}

function solrGet(string $url): string
{
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
    ]);
    $resp = curl_exec($ch);
    curl_close($ch);
    return $resp;
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function inferType(string $name): string
{
    if (str_ends_with($name, '_i')) return 'integer';
    if (str_ends_with($name, '_f')) return 'float';
    if (str_ends_with($name, '_b')) return 'boolean';
    if (str_ends_with($name, '_dt')) return 'date';
    if (str_ends_with($name, '_s')) return 'string';
    return 'string';
}

function formatLabel(string $name): string
{
    $name = preg_replace('/(_s|_i|_f|_b|_dt|_txt)$/', '', $name);
    $name = str_replace('_', ' ', $name);
    return ucwords($name);
}

function getBody(): array
{
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?? [];
}

function json(mixed $data): void
{
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
