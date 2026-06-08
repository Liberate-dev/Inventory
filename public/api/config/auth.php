<?php

function authRespond(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json');
    echo json_encode($payload);
    exit;
}

function authBase64UrlEncode(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function authBase64UrlDecode(string $data)
{
    $padding = strlen($data) % 4;
    if ($padding > 0) {
        $data .= str_repeat('=', 4 - $padding);
    }

    return base64_decode(strtr($data, '-_', '+/'), true);
}

function authSecret(): string
{
    $secret = getenv('APP_AUTH_SECRET');
    if (is_string($secret) && trim($secret) !== '') {
        return $secret;
    }

    return 'inventory-dev-secret-change-me';
}

function createAuthToken(array $user): string
{
    $payload = [
        'sub' => (string) ($user['id'] ?? ''),
        'usr' => (string) ($user['username'] ?? ''),
        'iat' => time(),
        'exp' => time() + (12 * 60 * 60),
    ];

    $encodedPayload = authBase64UrlEncode(json_encode($payload, JSON_UNESCAPED_SLASHES) ?: '{}');
    $signature = hash_hmac('sha256', $encodedPayload, authSecret(), true);

    return $encodedPayload . '.' . authBase64UrlEncode($signature);
}

function authDecodeToken(string $token): ?array
{
    $parts = explode('.', $token);
    if (count($parts) !== 2) {
        return null;
    }

    [$encodedPayload, $encodedSignature] = $parts;
    $expectedSignature = authBase64UrlEncode(hash_hmac('sha256', $encodedPayload, authSecret(), true));
    if (!hash_equals($expectedSignature, $encodedSignature)) {
        return null;
    }

    $decodedPayload = authBase64UrlDecode($encodedPayload);
    if ($decodedPayload === false) {
        return null;
    }

    $payload = json_decode($decodedPayload, true);
    if (!is_array($payload)) {
        return null;
    }

    $expiry = isset($payload['exp']) ? (int) $payload['exp'] : 0;
    if ($expiry <= time()) {
        return null;
    }

    return $payload;
}

function authBearerToken(): ?string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!is_string($header) || trim($header) === '') {
        $fallbackToken = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
        if (is_string($fallbackToken) && trim($fallbackToken) !== '') {
            return trim($fallbackToken);
        }
        return null;
    }

    if (preg_match('/Bearer\s+(.+)/i', $header, $matches) !== 1) {
        return null;
    }

    $token = trim($matches[1] ?? '');
    return $token !== '' ? $token : null;
}

function authDefaultPermissionMatrix(): array
{
    return [
        'dashboard' => ['admin' => 'full', 'kepala_lab' => 'full', 'guru' => 'full', 'kepala_sekolah' => 'full', 'sarpras' => 'full', 'admin_nl' => 'full'],
        'rooms' => ['admin' => 'none', 'kepala_lab' => 'full', 'guru' => 'full', 'kepala_sekolah' => 'view', 'sarpras' => 'view', 'admin_nl' => 'full'],
        'item_management' => ['admin' => 'none', 'kepala_lab' => 'full', 'guru' => 'full', 'kepala_sekolah' => 'view', 'sarpras' => 'full', 'admin_nl' => 'full'],
        'service_requests' => ['admin' => 'none', 'kepala_lab' => 'view', 'guru' => 'view', 'kepala_sekolah' => 'view', 'sarpras' => 'full', 'admin_nl' => 'view'],
        'operations' => ['admin' => 'none', 'kepala_lab' => 'full', 'guru' => 'full', 'kepala_sekolah' => 'none', 'sarpras' => 'none', 'admin_nl' => 'full'],
        'reports' => ['admin' => 'none', 'kepala_lab' => 'full', 'guru' => 'none', 'kepala_sekolah' => 'full', 'sarpras' => 'full', 'admin_nl' => 'full'],
        'print_assets' => ['admin' => 'none', 'kepala_lab' => 'none', 'guru' => 'none', 'kepala_sekolah' => 'view', 'sarpras' => 'full', 'admin_nl' => 'none'],
        'user_management' => ['admin' => 'full', 'kepala_lab' => 'none', 'guru' => 'none', 'kepala_sekolah' => 'none', 'sarpras' => 'none', 'admin_nl' => 'none'],
        'system_logs' => ['admin' => 'full', 'kepala_lab' => 'none', 'guru' => 'none', 'kepala_sekolah' => 'none', 'sarpras' => 'none', 'admin_nl' => 'none'],
        'asset_accounting' => ['admin' => 'none', 'kepala_lab' => 'none', 'guru' => 'none', 'kepala_sekolah' => 'full', 'sarpras' => 'none', 'admin_nl' => 'none'],
        'preventive_maintenance' => ['admin' => 'none', 'kepala_lab' => 'view', 'guru' => 'view', 'kepala_sekolah' => 'full', 'sarpras' => 'full', 'admin_nl' => 'none'],
        'disposal' => ['admin' => 'none', 'kepala_lab' => 'none', 'guru' => 'none', 'kepala_sekolah' => 'full', 'sarpras' => 'full', 'admin_nl' => 'none'],
    ];
}

function authLockedAccessLevel(string $feature, string $role): ?string
{
    $defaults = authDefaultPermissionMatrix();

    if ($role === 'admin') {
        return $defaults[$feature][$role] ?? 'none';
    }

    if ($feature === 'item_management' && $role === 'sarpras') {
        return $defaults[$feature][$role] ?? 'full';
    }

    return null;
}

function authRoleKeys(): array
{
    return ['admin', 'kepala_lab', 'guru', 'kepala_sekolah', 'sarpras', 'admin_nl'];
}

function authFeatureKeys(): array
{
    return array_keys(authDefaultPermissionMatrix());
}

function authNormalizeAccessLevel(string $level): string
{
    return in_array($level, ['full', 'view', 'none'], true) ? $level : 'none';
}

function authNormalizePermissionMatrix(array $matrix): array
{
    $normalized = authDefaultPermissionMatrix();

    foreach (authFeatureKeys() as $feature) {
        foreach (authRoleKeys() as $role) {
            $lockedLevel = authLockedAccessLevel($feature, $role);
            if ($lockedLevel !== null) {
                $normalized[$feature][$role] = $lockedLevel;
                continue;
            }

            $candidate = $matrix[$feature][$role] ?? $normalized[$feature][$role];
            $normalized[$feature][$role] = authNormalizeAccessLevel((string) $candidate);
        }
    }

    return $normalized;
}

function authEnsureAccessMatrixTable(PDO $db): void
{
    static $initialized = false;
    if ($initialized) {
        return;
    }

    $db->exec(
        "CREATE TABLE IF NOT EXISTS access_matrix (
            feature_key VARCHAR(50) NOT NULL,
            role_key VARCHAR(50) NOT NULL,
            access_level ENUM('full','view','none') NOT NULL DEFAULT 'none',
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (feature_key, role_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    );

    $seedStmt = $db->prepare(
        "INSERT INTO access_matrix (feature_key, role_key, access_level)
         VALUES (:feature_key, :role_key, :access_level)
         ON DUPLICATE KEY UPDATE access_level = access_level"
    );

    $defaults = authDefaultPermissionMatrix();
    foreach ($defaults as $feature => $roles) {
        foreach ($roles as $role => $level) {
            $seedStmt->bindValue(':feature_key', $feature, PDO::PARAM_STR);
            $seedStmt->bindValue(':role_key', $role, PDO::PARAM_STR);
            $seedStmt->bindValue(':access_level', $level, PDO::PARAM_STR);
            $seedStmt->execute();
        }
    }

    $initialized = true;
}

function authPermissionMatrix(?PDO $db = null): array
{
    if ($db === null) {
        return authDefaultPermissionMatrix();
    }

    if (isset($GLOBALS['__inventory_access_matrix_cache']) && is_array($GLOBALS['__inventory_access_matrix_cache'])) {
        return $GLOBALS['__inventory_access_matrix_cache'];
    }

    authEnsureAccessMatrixTable($db);

    $matrix = authDefaultPermissionMatrix();
    $stmt = $db->prepare("SELECT feature_key, role_key, access_level FROM access_matrix");
    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as $row) {
        $feature = isset($row['feature_key']) ? (string) $row['feature_key'] : '';
        $role = isset($row['role_key']) ? (string) $row['role_key'] : '';
        if (!isset($matrix[$feature]) || !array_key_exists($role, $matrix[$feature])) {
            continue;
        }
        $matrix[$feature][$role] = authNormalizeAccessLevel((string) ($row['access_level'] ?? 'none'));
    }

    $GLOBALS['__inventory_access_matrix_cache'] = authNormalizePermissionMatrix($matrix);
    return $GLOBALS['__inventory_access_matrix_cache'];
}

function authStorePermissionMatrix(PDO $db, array $matrix): array
{
    authEnsureAccessMatrixTable($db);
    $normalized = authNormalizePermissionMatrix($matrix);

    $db->beginTransaction();
    try {
        $db->exec("DELETE FROM access_matrix");
        $stmt = $db->prepare(
            "INSERT INTO access_matrix (feature_key, role_key, access_level)
             VALUES (:feature_key, :role_key, :access_level)"
        );

        foreach ($normalized as $feature => $roles) {
            foreach ($roles as $role => $level) {
                $stmt->bindValue(':feature_key', $feature, PDO::PARAM_STR);
                $stmt->bindValue(':role_key', $role, PDO::PARAM_STR);
                $stmt->bindValue(':access_level', $level, PDO::PARAM_STR);
                $stmt->execute();
            }
        }

        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }

    return authPermissionMatrixRefresh($db);
}

function authPermissionMatrixRefresh(PDO $db): array
{
    unset($GLOBALS['__inventory_access_matrix_cache']);
    return authPermissionMatrix($db);
}

function authEnsureSystemLogsTable(PDO $db): void
{
    static $initialized = false;
    if ($initialized) {
        return;
    }

    $db->exec(
        "CREATE TABLE IF NOT EXISTS system_logs (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            actor_user_id INT(11) NULL,
            action_key VARCHAR(100) NOT NULL,
            target_type VARCHAR(50) NULL,
            target_id VARCHAR(100) NULL,
            details_json LONGTEXT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_system_logs_actor_user_id (actor_user_id),
            INDEX idx_system_logs_action_key (action_key),
            INDEX idx_system_logs_created_at (created_at),
            CONSTRAINT fk_system_logs_actor_user FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    );

    $initialized = true;
}

function authWriteSystemLog(PDO $db, ?int $actorUserId, string $actionKey, array $details = [], ?string $targetType = null, ?string $targetId = null): void
{
    authEnsureSystemLogsTable($db);

    $payload = json_encode($details, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($payload === false) {
        $payload = '{}';
    }

    $stmt = $db->prepare(
        "INSERT INTO system_logs (actor_user_id, action_key, target_type, target_id, details_json)
         VALUES (:actor_user_id, :action_key, :target_type, :target_id, :details_json)"
    );

    if ($actorUserId === null || $actorUserId <= 0) {
        $stmt->bindValue(':actor_user_id', null, PDO::PARAM_NULL);
    } else {
        $stmt->bindValue(':actor_user_id', $actorUserId, PDO::PARAM_INT);
    }
    $stmt->bindValue(':action_key', $actionKey, PDO::PARAM_STR);
    $stmt->bindValue(':target_type', $targetType, $targetType === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $stmt->bindValue(':target_id', $targetId, $targetId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $stmt->bindValue(':details_json', $payload, PDO::PARAM_STR);
    $stmt->execute();
}

function authHasFeatureAccess(array $user, string $feature, string $requiredLevel = 'view', ?PDO $db = null): bool
{
    $matrix = $db !== null
        ? ($GLOBALS['__inventory_access_matrix_cache'] ?? authPermissionMatrix($db))
        : authPermissionMatrix();
    $role = (string) ($user['role'] ?? '');
    $grantedLevel = $matrix[$feature][$role] ?? 'none';

    if ($requiredLevel === 'view') {
        return $grantedLevel === 'view' || $grantedLevel === 'full';
    }

    return $grantedLevel === 'full';
}

function authCurrentUser(PDO $db, bool $required = true): ?array
{
    $token = authBearerToken();
    if ($token === null) {
        if ($required) {
            authRespond(401, ['status' => 'error', 'message' => 'Authentication required.']);
        }
        return null;
    }

    $payload = authDecodeToken($token);
    if (!is_array($payload)) {
        if ($required) {
            authRespond(401, ['status' => 'error', 'message' => 'Invalid or expired token.']);
        }
        return null;
    }

    $userId = isset($payload['sub']) && is_numeric($payload['sub']) ? (int) $payload['sub'] : 0;
    if ($userId <= 0) {
        if ($required) {
            authRespond(401, ['status' => 'error', 'message' => 'Invalid authentication subject.']);
        }
        return null;
    }

    $stmt = $db->prepare(
        "SELECT id, username, email, name, phone, role, avatar_url, lab_scope
         FROM users
         WHERE id = :id
         LIMIT 1"
    );
    $stmt->bindValue(':id', $userId, PDO::PARAM_INT);
    $stmt->execute();
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        if ($required) {
            authRespond(401, ['status' => 'error', 'message' => 'Authenticated user no longer exists.']);
        }
        return null;
    }

    return [
        'id' => (int) $row['id'],
        'username' => (string) $row['username'],
        'email' => (string) $row['email'],
        'name' => (string) $row['name'],
        'phone' => $row['phone'],
        'role' => (string) $row['role'],
        'avatar_url' => $row['avatar_url'],
        'lab_scope' => $row['lab_scope'],
    ];
}

function authRequireFeature(PDO $db, string $feature, string $requiredLevel = 'view'): array
{
    $user = authCurrentUser($db, true);
    if (!is_array($user) || !authHasFeatureAccess($user, $feature, $requiredLevel, $db)) {
        authRespond(403, ['status' => 'error', 'message' => 'Access denied.']);
    }

    return $user;
}

function authIsSelf(array $user, int $targetUserId): bool
{
    return (int) ($user['id'] ?? 0) === $targetUserId;
}

function authCanManageOwnProfileOnly(array $user): bool
{
    return !authHasFeatureAccess($user, 'user_management', 'full');
}

function authIsScopeRestricted(array $user): bool
{
    $labScope = isset($user['lab_scope']) ? trim((string) $user['lab_scope']) : '';

    if ($labScope === '' || $labScope === 'all') {
        return false;
    }

    return true;
}

function authCanAccessRoomType(array $user, ?string $roomType, ?string $roomCategory = null): bool
{
    if (!authIsScopeRestricted($user)) {
        return true;
    }

    $labScope = (string) ($user['lab_scope'] ?? '');
    
    if ($labScope === 'non-lab') {
        return $roomCategory !== null && $roomCategory === 'non-lab';
    }

    return $roomType !== null && $roomType === $labScope;
}

function authAssertRoomScope(PDO $db, array $user, int $roomId): array
{
    $stmt = $db->prepare("SELECT id, type, category, name FROM rooms WHERE id = :id LIMIT 1");
    $stmt->bindValue(':id', $roomId, PDO::PARAM_INT);
    $stmt->execute();
    $room = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$room) {
        authRespond(404, ['status' => 'error', 'message' => 'Room not found.']);
    }

    if (!authCanAccessRoomType($user, isset($room['type']) ? (string) $room['type'] : null, isset($room['category']) ? (string) $room['category'] : null)) {
        authRespond(403, ['status' => 'error', 'message' => 'Room access denied for current scope.']);
    }

    return $room;
}

function authAssertContainerScope(PDO $db, array $user, int $containerId, ?int $roomId = null): array
{
    $query = "SELECT c.id, c.room_id, r.type, r.category
              FROM containers c
              INNER JOIN rooms r ON r.id = c.room_id
              WHERE c.id = :container_id";
    if ($roomId !== null) {
        $query .= " AND c.room_id = :room_id";
    }
    $query .= " LIMIT 1";

    $stmt = $db->prepare($query);
    $stmt->bindValue(':container_id', $containerId, PDO::PARAM_INT);
    if ($roomId !== null) {
        $stmt->bindValue(':room_id', $roomId, PDO::PARAM_INT);
    }
    $stmt->execute();
    $container = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$container) {
        authRespond(404, ['status' => 'error', 'message' => 'Container not found.']);
    }

    if (!authCanAccessRoomType($user, isset($container['type']) ? (string) $container['type'] : null, isset($container['category']) ? (string) $container['category'] : null)) {
        authRespond(403, ['status' => 'error', 'message' => 'Container access denied for current scope.']);
    }

    return $container;
}

function authAssertItemScope(PDO $db, array $user, int $itemId): array
{
    $stmt = $db->prepare(
        "SELECT i.id, c.id AS container_id, r.id AS room_id, r.type, r.category
         FROM items i
         INNER JOIN containers c ON c.id = i.container_id
         INNER JOIN rooms r ON r.id = c.room_id
         WHERE i.id = :item_id AND i.deleted_at IS NULL
         LIMIT 1"
    );
    $stmt->bindValue(':item_id', $itemId, PDO::PARAM_INT);
    $stmt->execute();
    $item = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$item) {
        authRespond(404, ['status' => 'error', 'message' => 'Item not found.']);
    }

    if (!authCanAccessRoomType($user, isset($item['type']) ? (string) $item['type'] : null, isset($item['category']) ? (string) $item['category'] : null)) {
        authRespond(403, ['status' => 'error', 'message' => 'Item access denied for current scope.']);
    }

    return $item;
}

