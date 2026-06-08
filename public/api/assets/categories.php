<?php
/**
 * Asset Categories API
 * GET: List all categories
 * POST: Create new category
 * PUT: Update category
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
        listCategories($db);
        break;
    case 'POST':
        createCategory($db);
        break;
    case 'PUT':
        updateCategory($db);
        break;
    default:
        http_response_code(405);
        echo json_encode(['status' => 'error', 'message' => 'Method not allowed.']);
}

/**
 * List all active asset categories
 */
function listCategories(PDO $db): void {
    $authUser = authCurrentUser($db, true);
    authRequireFeature($db, 'asset_accounting', 'view');

    $stmt = $db->prepare("
        SELECT id, name, gl_account_code, accumulated_dep_account_code,
               depreciation_expense_account_code, default_depreciation_method,
               default_useful_life_months, default_salvage_value_pct,
               default_depreciation_rate, capitalization_threshold,
               is_depreciable, is_active, created_at
        FROM asset_categories
        WHERE is_active = 1
        ORDER BY name ASC
    ");
    $stmt->execute();
    $categories = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Convert numeric strings
    foreach ($categories as &$cat) {
        $cat['id'] = (int) $cat['id'];
        $cat['default_useful_life_months'] = (int) $cat['default_useful_life_months'];
        $cat['default_salvage_value_pct'] = (float) $cat['default_salvage_value_pct'];
        $cat['default_depreciation_rate'] = $cat['default_depreciation_rate'] !== null ? (float) $cat['default_depreciation_rate'] : null;
        $cat['capitalization_threshold'] = (float) $cat['capitalization_threshold'];
        $cat['is_depreciable'] = (bool) $cat['is_depreciable'];
        $cat['is_active'] = (bool) $cat['is_active'];
    }

    echo json_encode([
        'status' => 'success',
        'categories' => $categories
    ]);
}

/**
 * Create new asset category
 */
function createCategory(PDO $db): void {
    $authUser = authRequireFeature($db, 'asset_accounting', 'full');

    $input = json_decode(file_get_contents('php://input'), true);

    // Validate required fields
    $required = ['name'];
    foreach ($required as $field) {
        if (empty($input[$field])) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => "Field '{$field}' is required."]);
            return;
        }
    }

    $stmt = $db->prepare("
        INSERT INTO asset_categories
        (name, gl_account_code, accumulated_dep_account_code, depreciation_expense_account_code,
         default_depreciation_method, default_useful_life_months, default_salvage_value_pct,
         default_depreciation_rate, capitalization_threshold, is_depreciable)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ");

    $stmt->execute([
        trim($input['name']),
        $input['gl_account_code'] ?? null,
        $input['accumulated_dep_account_code'] ?? null,
        $input['depreciation_expense_account_code'] ?? null,
        $input['default_depreciation_method'] ?? 'straight_line',
        (int) ($input['default_useful_life_months'] ?? 48),
        (float) ($input['default_salvage_value_pct'] ?? 0),
        isset($input['default_depreciation_rate']) ? (float) $input['default_depreciation_rate'] : null,
        (float) ($input['capitalization_threshold'] ?? 1000000),
        (int) ($input['is_depreciable'] ?? 1),
    ]);

    $newId = (int) $db->lastInsertId();

    // Fetch the created category
    $stmt = $db->prepare("SELECT * FROM asset_categories WHERE id = ?");
    $stmt->execute([$newId]);
    $category = $stmt->fetch(PDO::FETCH_ASSOC);

    // Log action
    authWriteSystemLog($db, $authUser['id'], 'asset.category.created', [
        'category_id' => $newId,
        'name' => $input['name']
    ]);

    echo json_encode([
        'status' => 'success',
        'message' => 'Asset category created.',
        'category' => $category
    ]);
}

/**
 * Update asset category
 */
function updateCategory(PDO $db): void {
    $authUser = authRequireFeature($db, 'asset_accounting', 'full');

    $input = json_decode(file_get_contents('php://input'), true);
    $id = (int) ($input['id'] ?? 0);

    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Invalid category ID.']);
        return;
    }

    // Check if category exists
    $stmt = $db->prepare("SELECT * FROM asset_categories WHERE id = ?");
    $stmt->execute([$id]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$existing) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Category not found.']);
        return;
    }

    // Build dynamic update query
    $fields = [];
    $params = [];

    $allowedFields = [
        'name', 'gl_account_code', 'accumulated_dep_account_code',
        'depreciation_expense_account_code', 'default_depreciation_method',
        'default_useful_life_months', 'default_salvage_value_pct',
        'default_depreciation_rate', 'capitalization_threshold',
        'is_depreciable', 'is_active'
    ];

    foreach ($allowedFields as $field) {
        if (isset($input[$field])) {
            $fields[] = "{$field} = :{$field}";
            $params[$field] = $input[$field];
        }
    }

    if (empty($fields)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'No fields to update.']);
        return;
    }

    $params['id'] = $id;
    $sql = "UPDATE asset_categories SET " . implode(', ', $fields) . " WHERE id = :id";
    $stmt = $db->prepare($sql);

    // Cast numeric fields
    if (isset($params['default_useful_life_months'])) $params['default_useful_life_months'] = (int) $params['default_useful_life_months'];
    if (isset($params['default_salvage_value_pct'])) $params['default_salvage_value_pct'] = (float) $params['default_salvage_value_pct'];
    if (isset($params['capitalization_threshold'])) $params['capitalization_threshold'] = (float) $params['capitalization_threshold'];
    if (isset($params['default_depreciation_rate'])) $params['default_depreciation_rate'] = $params['default_depreciation_rate'] !== '' ? (float) $params['default_depreciation_rate'] : null;
    if (isset($params['is_depreciable'])) $params['is_depreciable'] = (int) $params['is_depreciable'];
    if (isset($params['is_active'])) $params['is_active'] = (int) $params['is_active'];

    $stmt->execute($params);

    // Log action
    authWriteSystemLog($db, $authUser['id'], 'asset.category.updated', [
        'category_id' => $id,
        'changes' => array_keys($input)
    ]);

    echo json_encode([
        'status' => 'success',
        'message' => 'Asset category updated.'
    ]);
}
