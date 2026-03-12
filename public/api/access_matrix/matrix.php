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
$rawInput = file_get_contents('php://input');
$payload = json_decode($rawInput, true);
if (!is_array($payload)) {
    $payload = [];
}

function respondMatrix(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    echo json_encode($payload);
    exit;
}

if ($method === 'GET') {
    authCurrentUser($db, true);
    respondMatrix(200, [
        'status' => 'success',
        'matrix' => authPermissionMatrix($db),
    ]);
}

if ($method === 'PUT') {
    $authUser = authCurrentUser($db, true);
    if (!authHasFeatureAccess($authUser, 'user_management', 'full', $db)) {
        respondMatrix(403, ['status' => 'error', 'message' => 'Access denied.']);
    }

    $matrix = $payload['matrix'] ?? null;
    if (!is_array($matrix)) {
        $feature = isset($payload['feature']) ? (string) $payload['feature'] : '';
        $role = isset($payload['role']) ? (string) $payload['role'] : '';
        $level = isset($payload['level']) ? (string) $payload['level'] : '';
        $current = authPermissionMatrix($db);

        if (!isset($current[$feature]) || !array_key_exists($role, $current[$feature])) {
            respondMatrix(400, ['status' => 'error', 'message' => 'Invalid feature or role.']);
        }

        $current[$feature][$role] = authNormalizeAccessLevel($level);
        $matrix = $current;
    }

    try {
        $stored = authStorePermissionMatrix($db, $matrix);
    } catch (Throwable $e) {
        respondMatrix(500, ['status' => 'error', 'message' => 'Failed to store access matrix.', 'debug' => $e->getMessage()]);
    }

    authWriteSystemLog(
        $db,
        isset($authUser['id']) ? (int) $authUser['id'] : null,
        'access_matrix.updated',
        [
            'feature' => $payload['feature'] ?? null,
            'role' => $payload['role'] ?? null,
            'level' => $payload['level'] ?? null
        ],
        'access_matrix',
        null
    );

    respondMatrix(200, [
        'status' => 'success',
        'message' => 'Access matrix updated.',
        'matrix' => $stored,
    ]);
}

if ($method === 'POST') {
    $authUser = authCurrentUser($db, true);
    if (!authHasFeatureAccess($authUser, 'user_management', 'full', $db)) {
        respondMatrix(403, ['status' => 'error', 'message' => 'Access denied.']);
    }

    $action = isset($payload['action']) ? (string) $payload['action'] : '';
    if ($action !== 'reset') {
        respondMatrix(400, ['status' => 'error', 'message' => 'Unsupported action.']);
    }

    try {
        $stored = authStorePermissionMatrix($db, authDefaultPermissionMatrix());
    } catch (Throwable $e) {
        respondMatrix(500, ['status' => 'error', 'message' => 'Failed to reset access matrix.', 'debug' => $e->getMessage()]);
    }

    authWriteSystemLog(
        $db,
        isset($authUser['id']) ? (int) $authUser['id'] : null,
        'access_matrix.reset',
        [],
        'access_matrix',
        null
    );

    respondMatrix(200, [
        'status' => 'success',
        'message' => 'Access matrix reset to default.',
        'matrix' => $stored,
    ]);
}

respondMatrix(405, ['status' => 'error', 'message' => 'Method not allowed.']);
