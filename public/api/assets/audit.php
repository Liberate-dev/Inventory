<?php
/**
 * Asset Audit Log API (Read-Only)
 * GET: List audit logs for an asset or all assets
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

$authUser = authCurrentUser($db, true);
authRequireFeature($db, 'asset_accounting', 'view');

if (isset($_GET['asset_id'])) {
    getAssetAuditLog($db, (int) $_GET['asset_id']);
} else {
    listAuditLogs($db);
}

/**
 * List audit logs with optional asset filter
 */
function listAuditLogs(PDO $db): void {
    $where = ['1=1'];
    $params = [];

    if (!empty($_GET['asset_id'])) {
        $where[] = "aal.asset_id = ?";
        $params[] = (int) $_GET['asset_id'];
    }
    if (!empty($_GET['event_type'])) {
        $where[] = "aal.event_type = ?";
        $params[] = $_GET['event_type'];
    }
    if (!empty($_GET['from_date'])) {
        $where[] = "aal.created_at >= ?";
        $params[] = $_GET['from_date'];
    }
    if (!empty($_GET['to_date'])) {
        $where[] = "aal.created_at <= ?";
        $params[] = $_GET['to_date'] . ' 23:59:59';
    }

    $limit = (int) ($_GET['limit'] ?? 100);
    $offset = (int) ($_GET['offset'] ?? 0);

    $sql = "
        SELECT aal.*,
               a.asset_number, a.name as asset_name,
               u.name as performed_by_name
        FROM asset_audit_log aal
        LEFT JOIN assets a ON aal.asset_id = a.id
        LEFT JOIN users u ON aal.performed_by = u.id
        WHERE " . implode(' AND ', $where) . "
        ORDER BY aal.created_at DESC
        LIMIT ? OFFSET ?
    ";

    $params[] = $limit;
    $params[] = $offset;

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($logs as &$log) {
        $log['id'] = (int) $log['id'];
        $log['asset_id'] = $log['asset_id'] ? (int) $log['asset_id'] : null;
        $log['performed_by'] = $log['performed_by'] ? (int) $log['performed_by'] : null;
    }

    echo json_encode([
        'status' => 'success',
        'audit_logs' => $logs
    ]);
}

/**
 * Get detailed audit log for a specific asset
 */
function getAssetAuditLog(PDO $db, int $assetId): void {
    // Verify asset exists
    $stmt = $db->prepare("SELECT asset_number, name FROM assets WHERE id = ?");
    $stmt->execute([$assetId]);
    $asset = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$asset) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Asset not found.']);
        return;
    }

    $stmt = $db->prepare("
        SELECT aal.*,
               u.name as performed_by_name
        FROM asset_audit_log aal
        LEFT JOIN users u ON aal.performed_by = u.id
        WHERE aal.asset_id = ?
        ORDER BY aal.created_at ASC
    ");
    $stmt->execute([$assetId]);
    $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'status' => 'success',
        'asset' => [
            'id' => $assetId,
            'asset_number' => $asset['asset_number'],
            'name' => $asset['name']
        ],
        'audit_timeline' => $logs
    ]);
}
