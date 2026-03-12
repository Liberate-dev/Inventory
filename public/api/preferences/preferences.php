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
$rawInput = file_get_contents("php://input");
$payload = json_decode($rawInput, true);
if (!is_array($payload)) {
    $payload = [];
}

function respondPref(int $code, array $data): void
{
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function prefId($value): ?int
{
    if (!is_numeric($value)) return null;
    $id = (int)$value;
    return $id > 0 ? $id : null;
}

// Create preferences table lazily if migration has not run.
$db->exec(
    "CREATE TABLE IF NOT EXISTS user_preferences (
        user_id INT(11) NOT NULL PRIMARY KEY,
        language ENUM('en','id') NOT NULL DEFAULT 'id',
        portal_type ENUM('lab','non-lab') NOT NULL DEFAULT 'lab',
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_user_preferences_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
);

if ($method === 'GET') {
    $authUser = authCurrentUser($db, true);
    $userId = prefId($_GET['user_id'] ?? null);
    if ($userId === null) {
        respondPref(400, ['status' => 'error', 'message' => 'Invalid user_id.']);
    }

    if (!authIsSelf($authUser, $userId) && !authHasFeatureAccess($authUser, 'user_management', 'view', $db)) {
        respondPref(403, ['status' => 'error', 'message' => 'Access denied.']);
    }

    $stmt = $db->prepare("SELECT user_id, language, portal_type FROM user_preferences WHERE user_id = :user_id LIMIT 1");
    $stmt->bindParam(':user_id', $userId, PDO::PARAM_INT);
    $stmt->execute();
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        respondPref(200, [
            'status' => 'success',
            'preferences' => [
                'userId' => (string)$userId,
                'language' => 'id',
                'portalType' => 'lab'
            ]
        ]);
    }

    respondPref(200, [
        'status' => 'success',
        'preferences' => [
            'userId' => (string)$row['user_id'],
            'language' => $row['language'],
            'portalType' => $row['portal_type']
        ]
    ]);
}

if ($method === 'PUT') {
    $authUser = authCurrentUser($db, true);
    $userId = prefId($payload['userId'] ?? $payload['user_id'] ?? null);
    if ($userId === null) {
        respondPref(400, ['status' => 'error', 'message' => 'Invalid user id for preferences update.']);
    }

    if (!authIsSelf($authUser, $userId) && !authHasFeatureAccess($authUser, 'user_management', 'full', $db)) {
        respondPref(403, ['status' => 'error', 'message' => 'Access denied.']);
    }

    $language = isset($payload['language']) ? (string)$payload['language'] : null;
    $portalType = isset($payload['portalType']) ? (string)$payload['portalType'] : (isset($payload['portal_type']) ? (string)$payload['portal_type'] : null);

    if ($language !== null && !in_array($language, ['en', 'id'], true)) {
        respondPref(400, ['status' => 'error', 'message' => 'Invalid language value.']);
    }
    if ($portalType !== null && !in_array($portalType, ['lab', 'non-lab'], true)) {
        respondPref(400, ['status' => 'error', 'message' => 'Invalid portalType value.']);
    }
    if ($language === null && $portalType === null) {
        respondPref(400, ['status' => 'error', 'message' => 'No preference fields provided.']);
    }

    $ensureStmt = $db->prepare(
        "INSERT INTO user_preferences (user_id, language, portal_type)
         VALUES (:user_id, 'id', 'lab')
         ON DUPLICATE KEY UPDATE user_id = user_id"
    );
    $ensureStmt->bindParam(':user_id', $userId, PDO::PARAM_INT);
    $ensureStmt->execute();

    $setParts = [];
    $params = [':user_id' => $userId];
    if ($language !== null) {
        $setParts[] = "language = :language";
        $params[':language'] = $language;
    }
    if ($portalType !== null) {
        $setParts[] = "portal_type = :portal_type";
        $params[':portal_type'] = $portalType;
    }

    $sql = "UPDATE user_preferences SET " . implode(', ', $setParts) . " WHERE user_id = :user_id";
    $updateStmt = $db->prepare($sql);
    foreach ($params as $key => $value) {
        $updateStmt->bindValue($key, $value);
    }
    $updateStmt->execute();

    respondPref(200, ['status' => 'success', 'message' => 'Preferences updated.']);
}

respondPref(405, ['status' => 'error', 'message' => 'Method not allowed.']);

