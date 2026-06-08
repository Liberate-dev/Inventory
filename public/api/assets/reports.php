<?php
/**
 * Asset Reports API
 * GET: dashboard, fixed asset register, depreciation per period, mutations, replacement projection, disposal summary
 */

include_once '../config/cors.php';
include_once '../config/database.php';
include_once '../config/auth.php';
include_once 'includes/schema.php';
header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];
$db = (new Database())->getConnection();

if (!$db) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Database connection failed.']);
    exit;
}

assetEnsureSchema($db);

if ($method !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method not allowed.']);
    exit;
}

authCurrentUser($db, true);
authRequireFeature($db, 'asset_accounting', 'view');

$reportType = $_GET['type'] ?? 'fixed_asset_register';

switch ($reportType) {
    case 'dashboard':
        dashboardReport($db);
        break;
    case 'fixed_asset_register':
        fixedAssetRegister($db);
        break;
    case 'depreciation_per_period':
        depreciationPerPeriod($db);
        break;
    case 'asset_mutations':
        assetMutations($db);
        break;
    case 'replacement_projection':
        replacementProjection($db);
        break;
    case 'fully_depreciated_in_use':
        fullyDepreciatedInUse($db);
        break;
    case 'disposal_summary':
        disposalSummary($db);
        break;
    default:
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Invalid report type.']);
}

function filterClause(array &$params, string $alias = 'a'): string
{
    $where = ['1=1'];
    if (!empty($_GET['category_id'])) {
        $where[] = "{$alias}.asset_category_id = ?";
        $params[] = (int) $_GET['category_id'];
    }
    if (!empty($_GET['location_id'])) {
        $where[] = "{$alias}.location_id = ?";
        $params[] = (int) $_GET['location_id'];
    }
    if (!empty($_GET['status'])) {
        $where[] = "{$alias}.status = ?";
        $params[] = $_GET['status'];
    }
    if (!empty($_GET['funding_source'])) {
        $where[] = "{$alias}.funding_source = ?";
        $params[] = assetNormalizeFundingSource($_GET['funding_source']);
    }
    return implode(' AND ', $where);
}

function dashboardReport(PDO $db): void
{
    $stmt = $db->query("
        SELECT
            COUNT(*) as asset_count,
            COALESCE(SUM(acquisition_cost), 0) as total_acquisition_cost,
            COALESCE(SUM(dep.accumulated), 0) as total_accumulated_depreciation
        FROM assets a
        LEFT JOIN (
            SELECT asset_id, SUM(depreciation_amount) as accumulated
            FROM depreciation_schedules
            WHERE status = 'posted'
            GROUP BY asset_id
        ) dep ON dep.asset_id = a.id
        WHERE a.status <> 'disposed'
    ");
    $summary = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];

    $stmt = $db->query("SELECT status, COUNT(*) as count FROM assets GROUP BY status");
    $byStatus = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $stmt = $db->query("SELECT `condition`, COUNT(*) as count FROM assets GROUP BY `condition`");
    $byCondition = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $totalCost = (float) ($summary['total_acquisition_cost'] ?? 0);
    $totalDep = (float) ($summary['total_accumulated_depreciation'] ?? 0);

    echo json_encode([
        'status' => 'success',
        'report' => 'dashboard',
        'summary' => [
            'asset_count' => (int) ($summary['asset_count'] ?? 0),
            'total_acquisition_cost' => $totalCost,
            'total_accumulated_depreciation' => $totalDep,
            'net_book_value' => $totalCost - $totalDep,
        ],
        'by_status' => $byStatus,
        'by_condition' => $byCondition,
    ]);
}

function fixedAssetRegister(PDO $db): void
{
    $asOfDate = $_GET['as_of_date'] ?? date('Y-m-d');
    $params = [$asOfDate, $asOfDate, $asOfDate, $asOfDate, $asOfDate];
    $whereSql = filterClause($params);

    $stmt = $db->prepare("
        SELECT a.asset_number, a.name as asset_name, a.description,
               a.acquisition_date, a.acquisition_cost, a.status, a.condition,
               a.funding_source, a.depreciation_method, a.useful_life_months,
               ac.name as category_name, ac.gl_account_code,
               r.name as location_name,
               u.name as responsible_name,
               a.salvage_value,
               COALESCE(aps.accumulated, 0) as accumulated_depreciation,
               GREATEST(a.salvage_value, a.acquisition_cost - COALESCE(aps.accumulated, 0)) as current_book_value
        FROM assets a
        LEFT JOIN asset_categories ac ON a.asset_category_id = ac.id
        LEFT JOIN rooms r ON a.location_id = r.id
        LEFT JOIN users u ON a.responsible_user_id = u.id
        LEFT JOIN asset_disposals ad ON ad.asset_id = a.id
        LEFT JOIN (
            SELECT asset_id,
                   SUM(CASE WHEN (period_year < YEAR(?) OR (period_year = YEAR(?) AND period_month <= MONTH(?)))
                       THEN depreciation_amount ELSE 0 END) as accumulated
            FROM depreciation_schedules
            WHERE status = 'posted'
            GROUP BY asset_id
        ) aps ON a.id = aps.asset_id
        WHERE a.acquisition_date <= ?
          AND (ad.id IS NULL OR ad.disposal_date > ?)
          AND {$whereSql}
        ORDER BY a.asset_number ASC
    ");
    $stmt->execute($params);
    $assets = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $byCategory = [];
    $grandTotal = ['acquisition_cost' => 0, 'accumulated_depreciation' => 0, 'current_book_value' => 0];

    foreach ($assets as $asset) {
        $catName = $asset['category_name'] ?: 'Tanpa Kategori';
        if (!isset($byCategory[$catName])) {
            $byCategory[$catName] = [
                'assets' => [],
                'totals' => ['acquisition_cost' => 0, 'accumulated_depreciation' => 0, 'current_book_value' => 0],
            ];
        }

        $row = $asset;
        $row['acquisition_cost'] = (float) $asset['acquisition_cost'];
        $row['salvage_value'] = (float) $asset['salvage_value'];
        $row['accumulated_depreciation'] = (float) $asset['accumulated_depreciation'];
        $row['current_book_value'] = (float) $asset['current_book_value'];
        $row['useful_life_months'] = (int) $asset['useful_life_months'];

        $byCategory[$catName]['assets'][] = $row;
        foreach ($grandTotal as $key => $_) {
            $byCategory[$catName]['totals'][$key] += $row[$key];
            $grandTotal[$key] += $row[$key];
        }
    }

    echo json_encode([
        'status' => 'success',
        'report' => 'fixed_asset_register',
        'as_of_date' => $asOfDate,
        'categories' => $byCategory,
        'grand_total' => $grandTotal,
    ]);
}

function depreciationPerPeriod(PDO $db): void
{
    $year = isset($_GET['year']) && $_GET['year'] !== '' ? (int) $_GET['year'] : (int) date('Y');
    $month = isset($_GET['month']) && $_GET['month'] !== '' ? (int) $_GET['month'] : (int) date('n');
    $params = [$year, $year, $month, $year, $year, $month, $year, $month];
    $whereSql = filterClause($params);

    $stmt = $db->prepare("
        SELECT a.asset_number, a.name as asset_name, a.acquisition_cost,
               a.funding_source, a.depreciation_method, ac.name as category_name,
               COALESCE((
                   SELECT SUM(prev.depreciation_amount)
                   FROM depreciation_schedules prev
                   WHERE prev.asset_id = a.id
                     AND prev.status = 'posted'
                     AND (prev.period_year < ? OR (prev.period_year = ? AND prev.period_month < ?))
               ), 0) as accumulated_start,
               CASE WHEN ds.status = 'posted' THEN ds.depreciation_amount ELSE 0 END as current_period_dep,
               COALESCE((
                   SELECT SUM(done.depreciation_amount)
                   FROM depreciation_schedules done
                   WHERE done.asset_id = a.id
                     AND done.status = 'posted'
                     AND (done.period_year < ? OR (done.period_year = ? AND done.period_month <= ?))
               ), 0) as accumulated_end,
               je.journal_number, ds.posted_at
        FROM depreciation_schedules ds
        JOIN assets a ON ds.asset_id = a.id
        LEFT JOIN asset_categories ac ON a.asset_category_id = ac.id
        LEFT JOIN journal_entries je ON ds.journal_entry_id = je.id
        WHERE ds.period_year = ?
          AND ds.period_month = ?
          AND ds.status = 'posted'
          AND {$whereSql}
        ORDER BY a.asset_number ASC
    ");
    $stmt->execute($params);
    $assets = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $totals = ['accumulated_start' => 0, 'current_period_depreciation' => 0, 'accumulated_end' => 0];
    foreach ($assets as &$asset) {
        $asset['acquisition_cost'] = (float) $asset['acquisition_cost'];
        $asset['accumulated_start'] = (float) $asset['accumulated_start'];
        $asset['current_period_dep'] = (float) $asset['current_period_dep'];
        $asset['accumulated_end'] = (float) $asset['accumulated_end'];
        $asset['book_value_end'] = max(0, $asset['acquisition_cost'] - $asset['accumulated_end']);
        $totals['accumulated_start'] += $asset['accumulated_start'];
        $totals['current_period_depreciation'] += $asset['current_period_dep'];
        $totals['accumulated_end'] += $asset['accumulated_end'];
    }

    echo json_encode([
        'status' => 'success',
        'report' => 'depreciation_per_period',
        'period' => date('F Y', mktime(0, 0, 0, $month, 1, $year)),
        'assets' => $assets,
        'totals' => $totals,
    ]);
}

function assetMutations(PDO $db): void
{
    $startYear = isset($_GET['start_year']) ? (int) $_GET['start_year'] : (int) date('Y');
    $endYear = isset($_GET['end_year']) ? (int) $_GET['end_year'] : $startYear;

    $stmt = $db->prepare("
        SELECT ac.name as category_name, ac.id as category_id,
               COALESCE((SELECT SUM(a.acquisition_cost) FROM assets a WHERE a.asset_category_id = ac.id AND YEAR(a.acquisition_date) < ?), 0) as opening,
               COALESCE((SELECT SUM(a.acquisition_cost) FROM assets a WHERE a.asset_category_id = ac.id AND YEAR(a.acquisition_date) BETWEEN ? AND ?), 0) as acquisitions,
               COALESCE((SELECT SUM(ad.book_value_at_disposal) FROM asset_disposals ad JOIN assets a ON ad.asset_id = a.id WHERE a.asset_category_id = ac.id AND YEAR(ad.disposal_date) BETWEEN ? AND ?), 0) as disposals,
               COALESCE((SELECT SUM(ds.depreciation_amount) FROM depreciation_schedules ds JOIN assets a ON ds.asset_id = a.id WHERE a.asset_category_id = ac.id AND ds.status = 'posted' AND ds.period_year BETWEEN ? AND ?), 0) as depreciation
        FROM asset_categories ac
        WHERE ac.is_active = 1
        ORDER BY ac.name ASC
    ");
    $stmt->execute([$startYear, $startYear, $endYear, $startYear, $endYear, $startYear, $endYear]);
    $categories = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $grandTotal = ['opening' => 0, 'acquisitions' => 0, 'capitalizations' => 0, 'disposals' => 0, 'depreciation' => 0, 'closing' => 0];
    foreach ($categories as &$cat) {
        $cat['opening'] = (float) $cat['opening'];
        $cat['acquisitions'] = (float) $cat['acquisitions'];
        $cat['capitalizations'] = 0.0;
        $cat['disposals'] = (float) $cat['disposals'];
        $cat['depreciation'] = (float) $cat['depreciation'];
        $cat['closing'] = $cat['opening'] + $cat['acquisitions'] - $cat['disposals'] - $cat['depreciation'];
        foreach ($grandTotal as $key => $_) {
            $grandTotal[$key] += $cat[$key];
        }
    }

    echo json_encode([
        'status' => 'success',
        'report' => 'asset_mutations',
        'period' => "{$startYear} - {$endYear}",
        'categories' => $categories,
        'grand_total' => $grandTotal,
    ]);
}

function replacementProjection(PDO $db): void
{
    $monthsAhead = isset($_GET['months']) ? max(1, min(60, (int) $_GET['months'])) : 12;
    $targetDate = date('Y-m-d', strtotime("+{$monthsAhead} months"));
    $params = [$targetDate];
    $whereSql = filterClause($params);

    $stmt = $db->prepare("
        SELECT a.asset_number, a.name as asset_name, a.acquisition_date,
               DATE_ADD(a.depreciation_start_date, INTERVAL a.useful_life_months MONTH) as useful_life_end_date,
               a.acquisition_cost, a.funding_source, ac.name as category_name,
               r.name as location_name
        FROM assets a
        LEFT JOIN asset_categories ac ON a.asset_category_id = ac.id
        LEFT JOIN rooms r ON a.location_id = r.id
        WHERE a.status <> 'disposed'
          AND a.useful_life_months > 0
          AND DATE_ADD(a.depreciation_start_date, INTERVAL a.useful_life_months MONTH) <= ?
          AND {$whereSql}
        ORDER BY useful_life_end_date ASC, a.asset_number ASC
    ");
    $stmt->execute($params);
    echo json_encode([
        'status' => 'success',
        'report' => 'replacement_projection',
        'months_ahead' => $monthsAhead,
        'assets' => $stmt->fetchAll(PDO::FETCH_ASSOC),
    ]);
}

function fullyDepreciatedInUse(PDO $db): void
{
    $stmt = $db->query("
        SELECT a.asset_number, a.name as asset_name, a.acquisition_date,
               DATE_ADD(a.depreciation_start_date, INTERVAL a.useful_life_months MONTH) as fully_depreciated_date,
               a.acquisition_cost, a.condition, a.funding_source,
               ac.name as category_name, r.name as location_name
        FROM assets a
        LEFT JOIN asset_categories ac ON a.asset_category_id = ac.id
        LEFT JOIN rooms r ON a.location_id = r.id
        WHERE a.status = 'fully_depreciated'
        ORDER BY fully_depreciated_date ASC, a.asset_number ASC
    ");
    echo json_encode([
        'status' => 'success',
        'report' => 'fully_depreciated_in_use',
        'assets' => $stmt->fetchAll(PDO::FETCH_ASSOC),
    ]);
}

function disposalSummary(PDO $db): void
{
    $startDate = $_GET['start_date'] ?? date('Y-01-01');
    $endDate = $_GET['end_date'] ?? date('Y-m-d');
    $params = [$startDate, $endDate];
    $whereSql = filterClause($params);

    $stmt = $db->prepare("
        SELECT a.asset_number, a.name as asset_name, a.funding_source,
               ac.name as category_name, ad.disposal_date, ad.disposal_method,
               ad.book_value_at_disposal, ad.accumulated_dep_at_disposal,
               ad.proceeds, ad.surplus_deficit, ad.document_reference,
               approver.name as approved_by_name
        FROM asset_disposals ad
        JOIN assets a ON ad.asset_id = a.id
        LEFT JOIN asset_categories ac ON a.asset_category_id = ac.id
        LEFT JOIN users approver ON ad.approved_by = approver.id
        WHERE ad.disposal_date BETWEEN ? AND ?
          AND {$whereSql}
        ORDER BY ad.disposal_date DESC, a.asset_number ASC
    ");
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'status' => 'success',
        'report' => 'disposal_summary',
        'period' => "{$startDate} - {$endDate}",
        'assets' => $rows,
    ]);
}
