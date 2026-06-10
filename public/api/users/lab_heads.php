<?php
include_once '../config/cors.php';
include_once '../config/database.php';
include_once '../config/auth.php';

header('Content-Type: application/json');

$database = new Database();
$db = $database->getConnection();

if (!$db) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Database connection failed.']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method not allowed.']);
    exit;
}

$authUser = authCurrentUser($db, true);
authRequireFeature($db, 'asset_accounting', 'view');

try {
    $stmt = $db->prepare("
        SELECT id, name, role, lab_scope
        FROM users
        WHERE role IN ('kepala_lab', 'kepala_sekolah', 'sarpras')
        ORDER BY role ASC, lab_scope ASC
    ");
    $stmt->execute();
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'status' => 'success',
        'heads' => $users
    ]);
    exit;

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    exit;
}
