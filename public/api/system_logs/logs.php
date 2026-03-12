<?php
include_once '../config/cors.php';
include_once '../config/database.php';
include_once '../config/auth.php';

header('Content-Type: application/json');

$database = new Database();
$db = $database->getConnection();

if (!$db) {
    authRespond(500, ['status' => 'error', 'message' => 'Database connection failed.']);
}

$method = $_SERVER['REQUEST_METHOD'];

function respondSystemLogs(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    echo json_encode($payload);
    exit;
}

if ($method !== 'GET') {
    respondSystemLogs(405, ['status' => 'error', 'message' => 'Method not allowed.']);
}

$authUser = authRequireFeature($db, 'system_logs', 'view');
authEnsureSystemLogsTable($db);

$limit = isset($_GET['limit']) && is_numeric($_GET['limit']) ? (int) $_GET['limit'] : 100;
if ($limit < 1) $limit = 1;
if ($limit > 500) $limit = 500;

$stmt = $db->prepare(
    "SELECT
        sl.id,
        sl.actor_user_id,
        sl.action_key,
        sl.target_type,
        sl.target_id,
        sl.details_json,
        sl.created_at,
        u.username AS actor_username,
        u.name AS actor_name,
        u.role AS actor_role
     FROM system_logs sl
     LEFT JOIN users u ON u.id = sl.actor_user_id
     ORDER BY sl.created_at DESC, sl.id DESC
     LIMIT :limit"
);
$stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
$stmt->execute();
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

$logs = array_map(static function (array $row): array {
    $details = [];
    if (isset($row['details_json']) && is_string($row['details_json']) && trim($row['details_json']) !== '') {
        $decoded = json_decode($row['details_json'], true);
        if (is_array($decoded)) {
            $details = $decoded;
        }
    }

    return [
        'id' => (string) ($row['id'] ?? ''),
        'actorUserId' => $row['actor_user_id'] !== null ? (string) $row['actor_user_id'] : null,
        'actorUsername' => $row['actor_username'] ?? null,
        'actorName' => $row['actor_name'] ?? null,
        'actorRole' => $row['actor_role'] ?? null,
        'actionKey' => (string) ($row['action_key'] ?? ''),
        'targetType' => $row['target_type'] ?? null,
        'targetId' => $row['target_id'] ?? null,
        'details' => $details,
        'createdAt' => (string) ($row['created_at'] ?? ''),
    ];
}, $rows);

respondSystemLogs(200, [
    'status' => 'success',
    'logs' => $logs,
]);
