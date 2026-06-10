<?php
/**
 * Assets API
 * GET: List assets / single asset
 * POST: Create asset + generate schedules
 * PUT: Update asset
 */

include_once '../config/cors.php';
include_once '../config/database.php';
include_once '../config/auth.php';
include_once 'includes/schema.php';
include_once 'includes/depreciation_engine.php';
include_once 'includes/document_numbering.php';
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
        if (isset($_GET['id'])) {
            getAsset($db, (int) $_GET['id']);
        } else {
            listAssets($db);
        }
        break;
    case 'POST':
        $action = $_GET['action'] ?? 'create';
        if ($action === 'create') {
            createAsset($db);
        } elseif ($action === 'mark_inactive') {
            markAssetInactive($db);
        } elseif ($action === 'reactivate') {
            reactivateAsset($db);
        } elseif ($action === 'dispose') {
            disposeAsset($db);
        } else {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Invalid asset action.']);
        }
        break;
    case 'PUT':
        updateAsset($db);
        break;
    default:
        http_response_code(405);
        echo json_encode(['status' => 'error', 'message' => 'Method not allowed.']);
}

/**
 * List all assets with optional filters
 */
function listAssets(PDO $db): void {
    $authUser = authCurrentUser($db, true);
    authRequireFeature($db, 'asset_accounting', 'view');

    $where = ['1=1'];
    $params = [];

    // Filters
    if (!empty($_GET['status'])) {
        $where[] = "a.status = ?";
        $params[] = $_GET['status'];
    }
    if (!empty($_GET['category_id'])) {
        $where[] = "a.asset_category_id = ?";
        $params[] = (int) $_GET['category_id'];
    }
    if (!empty($_GET['location_id'])) {
        $where[] = "a.location_id = ?";
        $params[] = (int) $_GET['location_id'];
    }
    if (!empty($_GET['funding_source'])) {
        $where[] = "a.funding_source = ?";
        $params[] = assetNormalizeFundingSource($_GET['funding_source']);
    }
    if (!empty($_GET['search'])) {
        $where[] = "(a.name LIKE ? OR a.asset_number LIKE ? OR a.description LIKE ?)";
        $search = '%' . $_GET['search'] . '%';
        $params[] = $search;
        $params[] = $search;
        $params[] = $search;
    }

    $sql = "
        SELECT a.*,
               ac.name as category_name,
               r.name as location_name,
               u.name as responsible_name,
               creator.name as created_by_name,
               (a.acquisition_cost - COALESCE(
                   (SELECT SUM(ds.depreciation_amount)
                    FROM depreciation_schedules ds
                    WHERE ds.asset_id = a.id AND ds.status = 'posted'), 0
               )) as current_book_value,
               COALESCE(
                   (SELECT SUM(ds.depreciation_amount)
                    FROM depreciation_schedules ds
                    WHERE ds.asset_id = a.id AND ds.status = 'posted'), 0
               ) as accumulated_depreciation
        FROM assets a
        LEFT JOIN asset_categories ac ON a.asset_category_id = ac.id
        LEFT JOIN rooms r ON a.location_id = r.id
        LEFT JOIN users u ON a.responsible_user_id = u.id
        LEFT JOIN users creator ON a.created_by = creator.id
        WHERE " . implode(' AND ', $where) . "
        ORDER BY a.acquisition_date DESC, a.id DESC
    ";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $assets = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Normalize data
    foreach ($assets as &$asset) {
        $asset['id'] = (int) $asset['id'];
        $asset['asset_category_id'] = $asset['asset_category_id'] ? (int) $asset['asset_category_id'] : null;
        $asset['inventory_item_id'] = $asset['inventory_item_id'] ? (int) $asset['inventory_item_id'] : null;
        $asset['location_id'] = $asset['location_id'] ? (int) $asset['location_id'] : null;
        $asset['responsible_user_id'] = $asset['responsible_user_id'] ? (int) $asset['responsible_user_id'] : null;
        $asset['created_by'] = $asset['created_by'] ? (int) $asset['created_by'] : null;
        $asset['approved_by'] = $asset['approved_by'] ? (int) $asset['approved_by'] : null;
        $asset['acquisition_cost'] = (float) $asset['acquisition_cost'];
        $asset['salvage_value'] = (float) $asset['salvage_value'];
        $asset['depreciable_amount'] = (float) $asset['depreciable_amount'];
        $asset['depreciation_rate'] = $asset['depreciation_rate'] ? (float) $asset['depreciation_rate'] : null;
        $asset['useful_life_months'] = (int) $asset['useful_life_months'];
        $asset['current_book_value'] = (float) $asset['current_book_value'];
        $asset['accumulated_depreciation'] = (float) $asset['accumulated_depreciation'];
        $asset['funding_source'] = $asset['funding_source'] ?? 'lainnya';
        $asset['inactive_reason'] = $asset['inactive_reason'] ?? null;
        $asset['inactive_date'] = $asset['inactive_date'] ?? null;
    }

    echo json_encode([
        'status' => 'success',
        'assets' => $assets
    ]);
}

/**
 * Get single asset with schedules
 */
function getAsset(PDO $db, int $id): void {
    $authUser = authCurrentUser($db, true);
    authRequireFeature($db, 'asset_accounting', 'view');

    $stmt = $db->prepare("
        SELECT a.*,
               ac.name as category_name,
               ac.gl_account_code,
               ac.accumulated_dep_account_code,
               ac.depreciation_expense_account_code,
               r.name as location_name,
               u.name as responsible_name,
               creator.name as created_by_name,
               (a.acquisition_cost - COALESCE(
                   (SELECT SUM(ds.depreciation_amount)
                    FROM depreciation_schedules ds
                    WHERE ds.asset_id = a.id AND ds.status = 'posted'), 0
               )) as current_book_value,
               COALESCE(
                   (SELECT SUM(ds.depreciation_amount)
                    FROM depreciation_schedules ds
                    WHERE ds.asset_id = a.id AND ds.status = 'posted'), 0
               ) as accumulated_depreciation
        FROM assets a
        LEFT JOIN asset_categories ac ON a.asset_category_id = ac.id
        LEFT JOIN rooms r ON a.location_id = r.id
        LEFT JOIN users u ON a.responsible_user_id = u.id
        LEFT JOIN users creator ON a.created_by = creator.id
        WHERE a.id = ?
    ");
    $stmt->execute([$id]);
    $asset = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$asset) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Asset not found.']);
        return;
    }

    // Get depreciation schedules
    $stmt = $db->prepare("
        SELECT *
        FROM depreciation_schedules
        WHERE asset_id = ?
        ORDER BY period_year ASC, period_month ASC
    ");
    $stmt->execute([$id]);
    $schedules = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'status' => 'success',
        'asset' => $asset,
        'depreciation_schedules' => $schedules
    ]);
}

/**
 * Create new asset and generate depreciation schedules
 */
function createAsset(PDO $db): void {
    $authUser = authRequireFeature($db, 'asset_accounting', 'full');
    $input = json_decode(file_get_contents('php://input'), true);

    // Validate required fields
    $required = ['name', 'acquisition_date', 'acquisition_cost'];
    foreach ($required as $field) {
        if (!isset($input[$field]) || $input[$field] === '') {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => "Field '{$field}' is required."]);
            return;
        }
    }

    $acquisitionDate = $input['acquisition_date'];
    $acquisitionCost = (float) $input['acquisition_cost'];
    $salvageValue = (float) ($input['salvage_value'] ?? 0);

    // Validate
    if ($acquisitionCost <= 0) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Acquisition cost must be greater than 0.']);
        return;
    }
    if ($salvageValue > $acquisitionCost) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Salvage value must not exceed acquisition cost.']);
        return;
    }

    // Get category defaults if category_id provided
    $categoryId = isset($input['asset_category_id']) && $input['asset_category_id'] !== ''
        ? (int) $input['asset_category_id']
        : null;
    $depreciationMethod = isset($input['depreciation_method']) ? trim((string) $input['depreciation_method']) : '';
    $usefulLifeMonths = isset($input['useful_life_months']) && $input['useful_life_months'] !== ''
        ? (int) $input['useful_life_months']
        : 0;
    $depreciationRate = $input['depreciation_rate'] ?? null;
    $isDepreciable = true;

    if ($categoryId) {
        $stmt = $db->prepare("SELECT * FROM asset_categories WHERE id = ? AND is_active = 1");
        $stmt->execute([$categoryId]);
        $category = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($category) {
            $depreciationMethod = $depreciationMethod ?: $category['default_depreciation_method'];
            $usefulLifeMonths = $usefulLifeMonths ?: (int) $category['default_useful_life_months'];
            $depreciationRate = $depreciationRate ?? $category['default_depreciation_rate'];
            $isDepreciable = (bool) $category['is_depreciable'];
        }
    }

    if ($depreciationMethod === '') {
        $depreciationMethod = 'straight_line';
    }

    if ($isDepreciable && $usefulLifeMonths <= 0) {
        $usefulLifeMonths = 48;
    }

    if (!$isDepreciable || $usefulLifeMonths <= 0) {
        $salvageValue = $acquisitionCost;
        $usefulLifeMonths = 0;
        $depreciationRate = null;
        $depreciationMethod = 'straight_line';
    }

    $depreciableAmount = $acquisitionCost - $salvageValue;
    $fundingSource = assetNormalizeFundingSource($input['funding_source'] ?? null);
    $locationId = isset($input['location_id']) && $input['location_id'] !== '' ? (int) $input['location_id'] : null;
    $responsibleUserId = isset($input['responsible_user_id']) && $input['responsible_user_id'] !== '' ? (int) $input['responsible_user_id'] : null;
    $inventoryItemId = isset($input['inventory_item_id']) && $input['inventory_item_id'] !== '' ? (int) $input['inventory_item_id'] : null;

    // Calculate depreciation start date (default: acquisition date)
    $depreciationStartDate = $input['depreciation_start_date'] ?? null;
    if (!$depreciationStartDate) {
        $depreciationStartDate = $acquisitionDate;
    }

    if (strtotime($depreciationStartDate) < strtotime($acquisitionDate)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Depreciation start date must be on or after acquisition date.']);
        return;
    }

    // Generate asset number
    $year = (int) date('Y', strtotime($acquisitionDate));
    $stmt = $db->prepare("
        SELECT COUNT(*) + 1 as next_number
        FROM assets
        WHERE YEAR(acquisition_date) = ?
    ");
    $stmt->execute([$year]);
    $result = $stmt->fetch(PDO::FETCH_ASSOC);
    $sequence = (int) ($result['next_number'] ?? 1);
    $assetNumber = sprintf("AST-%d-%04d", $year, $sequence);

    try {
        $db->beginTransaction();

        $documentReference = isset($input['document_reference'])
            ? trim((string) $input['document_reference'])
            : '';
        if ($documentReference === '') {
            $generatedDocument = assetGenerateDocumentNumber($db, $acquisitionDate);
            $documentReference = $generatedDocument['documentNumber'];
        }

        $docCheckStmt = $db->prepare("SELECT id FROM assets WHERE document_reference = ? LIMIT 1");
        $docCheckStmt->execute([$documentReference]);
        if ($docCheckStmt->fetch(PDO::FETCH_ASSOC)) {
            $db->rollBack();
            http_response_code(409);
            echo json_encode(['status' => 'error', 'message' => 'Document number already exists.']);
            return;
        }

        // Insert asset
        $stmt = $db->prepare("
            INSERT INTO assets
            (asset_number, name, description, asset_category_id, inventory_item_id,
             acquisition_date, acquisition_cost, salvage_value, depreciable_amount,
             depreciation_method, useful_life_months, depreciation_rate,
             depreciation_start_date, location_id, responsible_user_id,
             `condition`, document_reference, funding_source, vendor_name, notes, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");

        $stmt->execute([
            $assetNumber,
            trim($input['name']),
            $input['description'] ?? null,
            $categoryId ?: null,
            $inventoryItemId,
            $acquisitionDate,
            $acquisitionCost,
            $salvageValue,
            $depreciableAmount,
            $depreciationMethod,
            $usefulLifeMonths,
            $depreciationRate ? (float) $depreciationRate : null,
            $depreciationStartDate,
            $locationId,
            $responsibleUserId,
            $input['condition'] ?? 'good',
            $documentReference,
            $fundingSource,
            $input['vendor_name'] ?? null,
            $input['notes'] ?? null,
            $authUser['id']
        ]);

        $assetId = (int) $db->lastInsertId();

        // Generate depreciation schedules
        $assetData = [
            'acquisition_cost' => $acquisitionCost,
            'salvage_value' => $salvageValue,
            'depreciation_method' => $depreciationMethod,
            'useful_life_months' => $usefulLifeMonths,
            'depreciation_rate' => $depreciationRate,
            'depreciation_start_date' => $depreciationStartDate
        ];

        $schedules = $depreciableAmount > 0 && $usefulLifeMonths > 0
            ? DepreciationCalculator::generateSchedule($assetData)
            : [];

        $stmt = $db->prepare("
            INSERT INTO depreciation_schedules
            (asset_id, period_year, period_month, opening_book_value,
             depreciation_amount, accumulated_depreciation, closing_book_value,
             is_prorata, prorata_days)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");

        foreach ($schedules as $schedule) {
            $stmt->execute([
                $assetId,
                $schedule['period_year'],
                $schedule['period_month'],
                $schedule['opening_book_value'],
                $schedule['depreciation_amount'],
                $schedule['accumulated_depreciation'],
                $schedule['closing_book_value'],
                $schedule['is_prorata'],
                $schedule['prorata_days']
            ]);
        }

        // Audit log
        $auditStmt = $db->prepare("
            INSERT INTO asset_audit_log
            (asset_id, event_type, event_description, performed_by, ip_address)
            VALUES (?, 'created', ?, ?, ?)
        ");
        $auditStmt->execute([
            $assetId,
            "Aset {$assetNumber} dibuat dengan harga perolehan " . number_format($acquisitionCost, 0, ',', '.'),
            $authUser['id'],
            $_SERVER['REMOTE_ADDR'] ?? ''
        ]);

        $db->commit();

        echo json_encode([
            'status' => 'success',
            'message' => 'Asset created with ' . count($schedules) . ' depreciation schedules.',
            'asset_id' => $assetId,
            'asset_number' => $assetNumber,
            'schedules_count' => count($schedules)
        ]);

    } catch (Exception $e) {
        $db->rollBack();
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Failed to create asset: ' . $e->getMessage()]);
    }
}

/**
 * Update asset (limited fields)
 */
function updateAsset(PDO $db): void {
    $authUser = authRequireFeature($db, 'asset_accounting', 'full');
    $input = json_decode(file_get_contents('php://input'), true);
    $id = (int) ($input['id'] ?? 0);

    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Invalid asset ID.']);
        return;
    }

    // Check if asset exists and status
    $stmt = $db->prepare("SELECT * FROM assets WHERE id = ?");
    $stmt->execute([$id]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$existing) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Asset not found.']);
        return;
    }

    if ($existing['status'] === 'disposed') {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Disposed assets cannot be modified.']);
        return;
    }

    // Fields that can be updated
    $allowedFields = [
        'name', 'description', 'location_id', 'responsible_user_id',
        'condition', 'document_reference', 'funding_source', 'vendor_name', 'notes'
    ];

    $fields = [];
    $params = [];

    foreach ($allowedFields as $field) {
        if (isset($input[$field])) {
            $column = $field === 'condition' ? '`condition`' : $field;
            $fields[] = "{$column} = :{$field}";
            $params[$field] = $input[$field];
        }
    }

    if (empty($fields)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'No fields to update.']);
        return;
    }

    $params['id'] = $id;

    // Type casting
    if (isset($params['location_id'])) $params['location_id'] = $params['location_id'] ? (int) $params['location_id'] : null;
    if (isset($params['responsible_user_id'])) $params['responsible_user_id'] = $params['responsible_user_id'] ? (int) $params['responsible_user_id'] : null;
    if (isset($params['funding_source'])) $params['funding_source'] = assetNormalizeFundingSource((string) $params['funding_source']);

    try {
        $db->beginTransaction();

        $sql = "UPDATE assets SET " . implode(', ', $fields) . " WHERE id = :id";
        $stmt = $db->prepare($sql);
        $stmt->execute($params);

        // Track changes for audit log
        $changes = [];
        foreach ($allowedFields as $field) {
            if (isset($input[$field]) && $input[$field] !== $existing[$field]) {
                $changes[] = "{$field}: '{$existing[$field]}' → '{$input[$field]}'";
            }
        }

        if (!empty($changes)) {
            $auditStmt = $db->prepare("
                INSERT INTO asset_audit_log
                (asset_id, event_type, event_description, performed_by, ip_address)
                VALUES (?, 'updated', ?, ?, ?)
            ");
            $auditStmt->execute([
                $id,
                'Updated: ' . implode(', ', $changes),
                $authUser['id'],
                $_SERVER['REMOTE_ADDR'] ?? ''
            ]);
        }

        $db->commit();

        echo json_encode([
            'status' => 'success',
            'message' => 'Asset updated.'
        ]);

    } catch (Exception $e) {
        $db->rollBack();
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Failed to update asset.']);
    }
}

function markAssetInactive(PDO $db): void {
    $authUser = authRequireFeature($db, 'asset_accounting', 'full');
    $input = json_decode(file_get_contents('php://input'), true);
    $id = (int) ($input['id'] ?? 0);
    $inactiveDate = trim((string) ($input['inactive_date'] ?? ''));
    $inactiveReason = trim((string) ($input['inactive_reason'] ?? ''));
    $condition = $input['condition'] ?? null;

    if ($id <= 0 || $inactiveDate === '' || $inactiveReason === '') {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Asset, inactive date, and reason are required.']);
        return;
    }
    if (strtotime($inactiveDate) === false || strtotime($inactiveDate) > strtotime(date('Y-m-d'))) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Inactive date is invalid or in the future.']);
        return;
    }

    $stmt = $db->prepare("SELECT * FROM assets WHERE id = ?");
    $stmt->execute([$id]);
    $asset = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$asset) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Asset not found.']);
        return;
    }
    if ($asset['status'] === 'disposed') {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Disposed assets cannot be marked inactive.']);
        return;
    }
    if ($asset['status'] === 'inactive') {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Asset is already inactive.']);
        return;
    }

    $allowedConditions = ['new', 'good', 'fair', 'damaged'];
    $condition = in_array($condition, $allowedConditions, true) ? $condition : $asset['condition'];

    try {
        $db->beginTransaction();

        $stmt = $db->prepare("
            UPDATE assets
            SET status = 'inactive',
                inactive_reason = ?,
                inactive_date = ?,
                `condition` = ?,
                updated_at = NOW()
            WHERE id = ?
        ");
        $stmt->execute([$inactiveReason, $inactiveDate, $condition, $id]);

        $auditStmt = $db->prepare("
            INSERT INTO asset_audit_log
            (asset_id, event_type, event_description, field_changed, old_value, new_value, performed_by, ip_address)
            VALUES (?, 'status_changed', ?, 'status', ?, 'inactive', ?, ?)
        ");
        $auditStmt->execute([
            $id,
            "Aset {$asset['asset_number']} ditandai tidak aktif. Alasan: {$inactiveReason}",
            $asset['status'],
            $authUser['id'],
            $_SERVER['REMOTE_ADDR'] ?? ''
        ]);

        $db->commit();
        echo json_encode(['status' => 'success', 'message' => 'Asset marked inactive.']);
    } catch (Exception $e) {
        $db->rollBack();
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Failed to mark asset inactive.']);
    }
}

function reactivateAsset(PDO $db): void {
    $authUser = authRequireFeature($db, 'asset_accounting', 'full');
    $input = json_decode(file_get_contents('php://input'), true);
    $id = (int) ($input['id'] ?? 0);
    $reason = trim((string) ($input['reason'] ?? ''));

    if ($id <= 0 || $reason === '') {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Asset and reactivation reason are required.']);
        return;
    }

    $stmt = $db->prepare("SELECT * FROM assets WHERE id = ?");
    $stmt->execute([$id]);
    $asset = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$asset) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Asset not found.']);
        return;
    }
    if ($asset['status'] !== 'inactive') {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Only inactive assets can be reactivated.']);
        return;
    }

    try {
        $db->beginTransaction();
        $stmt = $db->prepare("
            UPDATE assets
            SET status = 'active',
                inactive_reason = NULL,
                inactive_date = NULL,
                updated_at = NOW()
            WHERE id = ?
        ");
        $stmt->execute([$id]);

        $auditStmt = $db->prepare("
            INSERT INTO asset_audit_log
            (asset_id, event_type, event_description, field_changed, old_value, new_value, performed_by, ip_address)
            VALUES (?, 'reactivated', ?, 'status', 'inactive', 'active', ?, ?)
        ");
        $auditStmt->execute([
            $id,
            "Aset {$asset['asset_number']} diaktifkan kembali. Alasan: {$reason}",
            $authUser['id'],
            $_SERVER['REMOTE_ADDR'] ?? ''
        ]);

        $db->commit();
        echo json_encode(['status' => 'success', 'message' => 'Asset reactivated.']);
    } catch (Exception $e) {
        $db->rollBack();
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Failed to reactivate asset.']);
    }
}

function disposeAsset(PDO $db): void {
    $authUser = authRequireFeature($db, 'asset_accounting', 'full');
    $input = json_decode(file_get_contents('php://input'), true);
    $id = (int) ($input['id'] ?? 0);
    $disposalDate = trim((string) ($input['disposal_date'] ?? ''));
    $method = (string) ($input['disposal_method'] ?? '');
    $reason = trim((string) ($input['disposal_reason'] ?? ''));
    $documentReference = trim((string) ($input['document_reference'] ?? ''));
    $proceeds = isset($input['proceeds']) ? (float) $input['proceeds'] : 0.0;
    $allowedMethods = ['sold', 'written_off', 'traded_in', 'donated', 'stolen_lost'];

    if ($id <= 0 || $disposalDate === '' || $reason === '' || !in_array($method, $allowedMethods, true)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Asset, date, method, and reason are required.']);
        return;
    }
    if (strtotime($disposalDate) === false || strtotime($disposalDate) < strtotime(date('Y-m-d'))) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Tanggal pelepasan tidak valid atau sudah lewat. Pilih hari ini atau tanggal mendatang.']);
        return;
    }
    if ($proceeds < 0) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Proceeds cannot be negative.']);
        return;
    }

    $stmt = $db->prepare("
        SELECT a.*, ac.gl_account_code, ac.accumulated_dep_account_code
        FROM assets a
        LEFT JOIN asset_categories ac ON a.asset_category_id = ac.id
        WHERE a.id = ?
    ");
    $stmt->execute([$id]);
    $asset = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$asset) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Asset not found.']);
        return;
    }
    if ($asset['status'] === 'active') {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Active assets must be marked inactive before disposal.']);
        return;
    }
    if ($asset['status'] === 'disposed') {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Asset has already been disposed.']);
        return;
    }
    if (assetFundingSourceRequiresDocument((string) $asset['funding_source']) && $documentReference === '') {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Disposal document reference is required for this funding source.']);
        return;
    }

    $periodYear = (int) date('Y', strtotime($disposalDate));
    $periodMonth = (int) date('n', strtotime($disposalDate));

    $stmt = $db->prepare("
        SELECT COALESCE(SUM(depreciation_amount), 0) as accumulated
        FROM depreciation_schedules
        WHERE asset_id = ?
          AND status = 'posted'
          AND (period_year < ? OR (period_year = ? AND period_month <= ?))
    ");
    $stmt->execute([$id, $periodYear, $periodYear, $periodMonth]);
    $accumulated = (float) ($stmt->fetch(PDO::FETCH_ASSOC)['accumulated'] ?? 0);

    $acquisitionCost = (float) $asset['acquisition_cost'];
    $salvageValue = (float) $asset['salvage_value'];
    $bookValue = max($salvageValue, round($acquisitionCost - $accumulated, 2));
    $surplusDeficit = round($proceeds - $bookValue, 2);
    $assetAccount = $asset['gl_account_code'] ?: '1600';
    $accumulatedAccount = $asset['accumulated_dep_account_code'] ?: '1601';
    $surplusDeficitAccount = $surplusDeficit >= 0 ? '4800' : '5800';

    try {
        $db->beginTransaction();

        $journalLines = [];
        if ($accumulated > 0) {
            $journalLines[] = [
                'account_code' => $accumulatedAccount,
                'account_name' => 'Akumulasi Penyusutan',
                'debit_amount' => $accumulated,
                'asset_id' => $id
            ];
        }
        if ($proceeds > 0) {
            $journalLines[] = [
                'account_code' => '1100',
                'account_name' => 'Kas / Bank',
                'debit_amount' => $proceeds,
                'asset_id' => $id
            ];
        }
        if ($surplusDeficit < 0) {
            $journalLines[] = [
                'account_code' => $surplusDeficitAccount,
                'account_name' => 'Defisit Pelepasan Aset',
                'debit_amount' => abs($surplusDeficit),
                'asset_id' => $id
            ];
        }
        $journalLines[] = [
            'account_code' => $assetAccount,
            'account_name' => 'Aset Tetap',
            'credit_amount' => $acquisitionCost,
            'asset_id' => $id
        ];
        if ($surplusDeficit > 0) {
            $journalLines[] = [
                'account_code' => $surplusDeficitAccount,
                'account_name' => 'Surplus Pelepasan Aset',
                'credit_amount' => $surplusDeficit,
                'asset_id' => $id
            ];
        }

        $journalGen = new JournalGenerator($db);
        $journalId = $journalGen->createJournal(
            $disposalDate,
            'disposal',
            "Pelepasan aset {$asset['asset_number']}",
            $journalLines,
            $authUser['id']
        );

        $stmt = $db->prepare("
            INSERT INTO asset_disposals
            (asset_id, disposal_date, disposal_method, disposal_reason,
             book_value_at_disposal, accumulated_dep_at_disposal, proceeds,
             surplus_deficit, surplus_deficit_account_code, document_reference,
             approved_by, journal_entry_id, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $id,
            $disposalDate,
            $method,
            $reason,
            $bookValue,
            $accumulated,
            $proceeds,
            $surplusDeficit,
            $surplusDeficitAccount,
            $documentReference ?: null,
            $authUser['id'],
            $journalId,
            $authUser['id']
        ]);
        $disposalId = (int) $db->lastInsertId();

        $stmt = $db->prepare("UPDATE journal_entries SET reference_id = ?, reference_type = 'asset_disposals' WHERE id = ?");
        $stmt->execute([$disposalId, $journalId]);

        $stmt = $db->prepare("
            UPDATE depreciation_schedules
            SET status = 'voided'
            WHERE asset_id = ?
              AND status = 'scheduled'
              AND (period_year > ? OR (period_year = ? AND period_month > ?))
        ");
        $stmt->execute([$id, $periodYear, $periodYear, $periodMonth]);

        $stmt = $db->prepare("UPDATE assets SET status = 'disposed', updated_at = NOW() WHERE id = ?");
        $stmt->execute([$id]);

        $auditStmt = $db->prepare("
            INSERT INTO asset_audit_log
            (asset_id, event_type, event_description, reference_id, reference_type, performed_by, ip_address)
            VALUES (?, 'disposal', ?, ?, 'asset_disposals', ?, ?)
        ");
        $auditStmt->execute([
            $id,
            "Aset {$asset['asset_number']} dilepaskan. Surplus/defisit: " . number_format($surplusDeficit, 0, ',', '.'),
            $disposalId,
            $authUser['id'],
            $_SERVER['REMOTE_ADDR'] ?? ''
        ]);

        $db->commit();

        echo json_encode([
            'status' => 'success',
            'message' => 'Asset disposed.',
            'disposal_id' => $disposalId,
            'journal_entry_id' => $journalId,
            'book_value_at_disposal' => $bookValue,
            'accumulated_dep_at_disposal' => $accumulated,
            'surplus_deficit' => $surplusDeficit
        ]);
    } catch (Exception $e) {
        $db->rollBack();
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Failed to dispose asset: ' . $e->getMessage()]);
    }
}
