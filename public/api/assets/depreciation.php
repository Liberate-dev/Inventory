<?php
/**
 * Depreciation API
 * GET: List depreciation runs
 * POST: Preview or Post depreciation run
 */

include_once '../config/cors.php';
include_once '../config/database.php';
include_once '../config/auth.php';
include_once 'includes/schema.php';
include_once 'includes/depreciation_engine.php';
header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];
$db = (new Database())->getConnection();

if (!$db) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Database connection failed.']);
    exit;
}

assetEnsureSchema($db);

switch ($method) {
    case 'GET':
        listDepreciationRuns($db);
        break;
    case 'POST':
        $action = $_GET['action'] ?? 'preview';
        if ($action === 'preview') {
            previewDepreciation($db);
        } elseif ($action === 'post') {
            postDepreciation($db);
        } else {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Invalid action. Use preview or post.']);
        }
        break;
    default:
        http_response_code(405);
        echo json_encode(['status' => 'error', 'message' => 'Method not allowed.']);
}

/**
 * List depreciation runs
 */
function listDepreciationRuns(PDO $db): void {
    $authUser = authCurrentUser($db, true);
    authRequireFeature($db, 'asset_accounting', 'view');

    $stmt = $db->prepare("
        SELECT dr.*,
               u_run.name as run_by_name,
               u_posted.name as posted_by_name
        FROM depreciation_runs dr
        LEFT JOIN users u_run ON dr.run_by = u_run.id
        LEFT JOIN users u_posted ON dr.posted_by = u_posted.id
        ORDER BY dr.period_year DESC, dr.period_month DESC
    ");
    $stmt->execute();
    $runs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($runs as &$run) {
        $run['id'] = (int) $run['id'];
        $run['period_year'] = (int) $run['period_year'];
        $run['period_month'] = (int) $run['period_month'];
        $run['total_assets_processed'] = (int) $run['total_assets_processed'];
        $run['total_depreciation_amount'] = (float) $run['total_depreciation_amount'];
    }

    echo json_encode([
        'status' => 'success',
        'depreciation_runs' => $runs
    ]);
}

/**
 * Preview depreciation calculation for a period
 */
function previewDepreciation(PDO $db): void {
    $authUser = authCurrentUser($db, true);
    authRequireFeature($db, 'asset_accounting', 'view');

    $input = json_decode(file_get_contents('php://input'), true);
    $year = (int) ($input['year'] ?? date('Y'));
    $month = (int) ($input['month'] ?? date('n'));

    // Validate period is not in future
    $currentYear = (int) date('Y');
    $currentMonth = (int) date('n');
    if ($year > $currentYear || ($year === $currentYear && $month > $currentMonth)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Cannot run depreciation for future periods.']);
        return;
    }

    // Get all active assets with scheduled depreciation for this period
    $stmt = $db->prepare("
        SELECT a.id, a.asset_number, a.name, a.status, a.depreciation_method,
               a.useful_life_months, a.depreciation_rate, a.acquisition_cost,
               a.salvage_value, a.depreciation_start_date,
               ac.name as category_name, ac.depreciation_expense_account_code,
               ac.accumulated_dep_account_code,
               ds.depreciation_amount as scheduled_amount,
               ds.opening_book_value, ds.closing_book_value, ds.is_prorata,
               ds.status as schedule_status
        FROM assets a
        LEFT JOIN asset_categories ac ON a.asset_category_id = ac.id
        LEFT JOIN depreciation_schedules ds ON a.id = ds.asset_id
            AND ds.period_year = ? AND ds.period_month = ?
        WHERE a.status IN ('active', 'inactive', 'fully_depreciated')
          AND a.depreciation_start_date <= ?
          AND (ds.id IS NOT NULL)
        ORDER BY a.asset_number ASC
    ");
    $stmt->execute([$year, $month, sprintf('%04d-%02d-01', $year, $month)]);
    $assets = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $previewItems = [];
    $totalAmount = 0;
    $totalAssets = 0;
    $totalExcluded = 0;
    $proRataCount = 0;

    foreach ($assets as $asset) {
        $scheduledAmount = (float) ($asset['scheduled_amount'] ?? 0);
        $scheduleStatus = $asset['schedule_status'];
        $isProrata = (bool) $asset['is_prorata'];

        // Determine if included
        $included = true;
        $status = 'normal';
        $statusNote = '';

        if ($asset['status'] === 'disposed') {
            $included = false;
            $status = 'disposed';
            $statusNote = 'Asset disposed';
        } elseif ($asset['status'] === 'inactive') {
            $status = 'inactive';
            $statusNote = 'Aset tidak aktif, penyusutan tetap dihitung';
        } elseif ($scheduleStatus === 'posted') {
            $included = false;
            $status = 'already_posted';
            $statusNote = 'Already posted';
        } elseif ($isProrata) {
            $status = 'prorata';
            $statusNote = 'Pro-rata calculation';
            $proRataCount++;
        } elseif ($scheduledAmount == 0 || abs($scheduledAmount) < 0.01) {
            $status = 'zero_depreciation';
            $statusNote = 'No depreciation scheduled';
        }

        if ($included) {
            $totalAmount += $scheduledAmount;
            $totalAssets++;
        } else {
            $totalExcluded++;
        }

        $previewItems[] = [
            'asset_id' => (int) $asset['id'],
            'asset_number' => $asset['asset_number'],
            'asset_name' => $asset['name'],
            'category_name' => $asset['category_name'],
            'opening_book_value' => (float) $asset['opening_book_value'],
            'scheduled_depreciation' => $scheduledAmount,
            'closing_book_value' => (float) $asset['closing_book_value'],
            'is_included' => $included,
            'status' => $status,
            'status_note' => $statusNote,
            'is_prorata' => $isProrata
        ];
    }

    // Build journal preview by category
    $journalPreview = [];
    $stmt = $db->prepare("
        SELECT ac.name as category_name,
               ac.depreciation_expense_account_code,
               ac.accumulated_dep_account_code,
               SUM(ds.depreciation_amount) as total_depreciation
        FROM assets a
        LEFT JOIN asset_categories ac ON a.asset_category_id = ac.id
        LEFT JOIN depreciation_schedules ds ON a.id = ds.asset_id
            AND ds.period_year = ? AND ds.period_month = ?
        WHERE a.status IN ('active', 'inactive')
          AND ds.id IS NOT NULL
          AND ds.depreciation_amount > 0
          AND ds.status = 'scheduled'
        GROUP BY ac.id
    ");
    $stmt->execute([$year, $month]);
    $categories = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($categories as $cat) {
        if ($cat['total_depreciation'] > 0) {
            $journalPreview[] = [
                'category' => $cat['category_name'] ?: 'Uncategorized',
                'expense_account' => $cat['depreciation_expense_account_code'] ?: '5700',
                'accumulated_account' => $cat['accumulated_dep_account_code'] ?: '1601',
                'amount' => (float) $cat['total_depreciation']
            ];
        }
    }

    echo json_encode([
        'status' => 'success',
        'period' => [
            'year' => $year,
            'month' => $month,
            'label' => date('F Y', mktime(0, 0, 0, $month, 1, $year))
        ],
        'summary' => [
            'total_assets' => $totalAssets + $totalExcluded,
            'included_assets' => $totalAssets,
            'excluded_assets' => $totalExcluded,
            'pro_rata_count' => $proRataCount,
            'total_depreciation' => $totalAmount
        ],
        'items' => $previewItems,
        'journal_preview' => $journalPreview
    ]);
}

/**
 * Post depreciation run
 */
function postDepreciation(PDO $db): void {
    $authUser = authRequireFeature($db, 'asset_accounting', 'full');
    $input = json_decode(file_get_contents('php://input'), true);

    $year = (int) ($input['year'] ?? date('Y'));
    $month = (int) ($input['month'] ?? date('n'));
    $overrides = $input['overrides'] ?? []; // [{asset_id, amount, reason}]
    $selectedAssetIds = $input['selected_asset_ids'] ?? null; // Filter to specific assets if provided

    // Validate period is not in future
    $currentYear = (int) date('Y');
    $currentMonth = (int) date('n');
    if ($year > $currentYear || ($year === $currentYear && $month > $currentMonth)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Cannot post depreciation for future periods.']);
        return;
    }

    // Check if period is already posted
    $stmt = $db->prepare("
        SELECT id FROM depreciation_runs
        WHERE period_year = ? AND period_month = ? AND status = 'posted'
    ");
    $stmt->execute([$year, $month]);
    if ($stmt->fetch()) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'This period has already been posted.']);
        return;
    }

    // Get assets to process
    $params = [$year, $month, sprintf('%04d-%02d-01', $year, $month)];
    $assetFilter = '';
    if ($selectedAssetIds && is_array($selectedAssetIds) && count($selectedAssetIds) > 0) {
        $placeholders = implode(',', array_fill(0, count($selectedAssetIds), '?'));
        $assetFilter = " AND a.id IN ({$placeholders})";
        $params = array_merge($params, $selectedAssetIds);
    }

    $stmt = $db->prepare("
        SELECT a.id, a.asset_number, a.name, a.depreciation_method,
               a.acquisition_cost, a.salvage_value, a.useful_life_months,
               a.depreciation_rate, a.depreciation_start_date, a.status as asset_status,
               ac.name as category_name, ac.depreciation_expense_account_code,
               ac.accumulated_dep_account_code,
               ds.id as schedule_id, ds.depreciation_amount as scheduled_amount,
               ds.opening_book_value, ds.closing_book_value
        FROM assets a
        LEFT JOIN asset_categories ac ON a.asset_category_id = ac.id
        LEFT JOIN depreciation_schedules ds ON a.id = ds.asset_id
            AND ds.period_year = ? AND ds.period_month = ?
        WHERE a.status IN ('active', 'inactive')
          AND a.depreciation_start_date <= ?
          AND ds.id IS NOT NULL
          AND ds.depreciation_amount > 0
          AND ds.status = 'scheduled'
          {$assetFilter}
    ");
    $stmt->execute($params);
    $assets = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($assets)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'No assets to depreciate for this period.']);
        return;
    }

    try {
        $db->beginTransaction();

        // Create depreciation run record
        $stmt = $db->prepare("
            INSERT INTO depreciation_runs
            (period_year, period_month, status, total_assets_processed,
             total_depreciation_amount, run_by, posted_by, posted_at)
            VALUES (?, ?, 'posted', ?, ?, ?, ?, NOW())
        ");

        $totalAmount = 0;
        $processedAssets = 0;

        foreach ($assets as $asset) {
            $assetId = (int) $asset['id'];
            $amount = (float) $asset['scheduled_amount'];

            // Apply override if exists
            if (isset($overrides[$assetId])) {
                $amount = (float) $overrides[$assetId]['amount'];
            }

            $totalAmount += $amount;
            $processedAssets++;
        }

        $stmt->execute([
            $year, $month, $processedAssets, $totalAmount,
            $authUser['id'], $authUser['id']
        ]);
        $runId = (int) $db->lastInsertId();

        // Create journal entry
        $journalGen = new JournalGenerator($db);
        $journalLines = [];

        // Group by category for journal entries
        $byCategory = [];
        foreach ($assets as $asset) {
            $catName = $asset['category_name'] ?: 'Uncategorized';
            $expenseAcct = $asset['depreciation_expense_account_code'] ?: '5700';
            $accumAcct = $asset['accumulated_dep_account_code'] ?: '1601';
            $amount = (float) $asset['scheduled_amount'];

            if (isset($overrides[$asset['id']])) {
                $amount = (float) $overrides[$asset['id']]['amount'];
            }

            if (!isset($byCategory[$catName])) {
                $byCategory[$catName] = [
                    'expense_account' => $expenseAcct,
                    'accumulated_account' => $accumAcct,
                    'total' => 0
                ];
            }
            $byCategory[$catName]['total'] += $amount;
        }

        foreach ($byCategory as $catName => $catData) {
            $journalLines[] = [
                'account_code' => $catData['expense_account'],
                'account_name' => 'Beban Penyusutan - ' . $catName,
                'debit_amount' => $catData['total']
            ];
            $journalLines[] = [
                'account_code' => $catData['accumulated_account'],
                'account_name' => 'Akumulasi Penyusutan - ' . $catName,
                'credit_amount' => $catData['total']
            ];
        }

        $journalId = $journalGen->createJournal(
            sprintf('%04d-%02d-01', $year, $month),
            'depreciation',
            "Penyusutan periode " . date('F Y', mktime(0, 0, 0, $month, 1, $year)),
            $journalLines,
            $authUser['id']
        );

        // Update depreciation run with journal ID
        $stmt = $db->prepare("UPDATE depreciation_runs SET journal_entry_id = ? WHERE id = ?");
        $stmt->execute([$journalId, $runId]);

        // Update schedules and create run items
        $runItemStmt = $db->prepare("
            INSERT INTO depreciation_run_items
            (depreciation_run_id, asset_id, depreciation_schedule_id, depreciation_amount, is_included)
            VALUES (?, ?, ?, ?, 1)
        ");

        $scheduleUpdateStmt = $db->prepare("
            UPDATE depreciation_schedules
            SET status = 'posted', posted_at = NOW(), journal_entry_id = ?
            WHERE id = ?
        ");

        $auditStmt = $db->prepare("
            INSERT INTO asset_audit_log
            (asset_id, event_type, event_description, reference_id, reference_type, performed_by, ip_address)
            VALUES (?, 'depreciation_posted', ?, ?, 'depreciation_run', ?, ?)
        ");

        foreach ($assets as $asset) {
            $assetId = (int) $asset['id'];
            $scheduleId = (int) $asset['schedule_id'];
            $amount = (float) $asset['scheduled_amount'];

            if (isset($overrides[$assetId])) {
                $amount = (float) $overrides[$assetId]['amount'];
            }

            $runItemStmt->execute([$runId, $assetId, $scheduleId, $amount]);
            $scheduleUpdateStmt->execute([$journalId, $scheduleId]);

            $auditStmt->execute([
                $assetId,
                "Depreciation posted for {$year}-{$month}: " . number_format($amount, 0, ',', '.'),
                $runId,
                $authUser['id'],
                $_SERVER['REMOTE_ADDR'] ?? ''
            ]);

            // Check if asset is now fully depreciated
            $closingBookValue = (float) $asset['closing_book_value'];
            if ($closingBookValue <= (float) $asset['salvage_value']) {
                $updateAssetStmt = $db->prepare("UPDATE assets SET status = 'fully_depreciated' WHERE id = ? AND status = 'active'");
                $updateAssetStmt->execute([$assetId]);
            }
        }

        $db->commit();

        // Get journal number
        $journalStmt = $db->prepare("SELECT journal_number FROM journal_entries WHERE id = ?");
        $journalStmt->execute([$journalId]);
        $journal = $journalStmt->fetch(PDO::FETCH_ASSOC);

        echo json_encode([
            'status' => 'success',
            'message' => 'Depreciation posted successfully.',
            'depreciation_run_id' => $runId,
            'journal_entry_id' => $journalId,
            'journal_number' => $journal['journal_number'] ?? null,
            'total_assets_processed' => $processedAssets,
            'total_depreciation_amount' => $totalAmount
        ]);

    } catch (Exception $e) {
        $db->rollBack();
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Failed to post depreciation: ' . $e->getMessage()]);
    }
}
