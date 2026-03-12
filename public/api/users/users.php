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

function respondUser(int $code, array $data): void
{
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function normalizeUserRow(array $row): array
{
    return [
        'id' => (string)$row['id'],
        'username' => $row['username'],
        'email' => $row['email'],
        'name' => $row['name'],
        'phone' => $row['phone'],
        'role' => $row['role'],
        'labScope' => $row['lab_scope'],
        'avatar' => $row['avatar_url']
    ];
}

function validUserId($value): ?int
{
    if (!is_numeric($value)) {
        return null;
    }
    $id = (int)$value;
    return $id > 0 ? $id : null;
}

function validateRoleOrFail(string $role): string
{
    $allowedRoles = ['admin', 'kepala_lab', 'guru', 'kepala_sekolah', 'sarpras'];
    if (!in_array($role, $allowedRoles, true)) {
        respondUser(400, ['status' => 'error', 'message' => 'Invalid role value.']);
    }

    return $role;
}

function validateLabScopeOrFail($labScope): ?string
{
    if ($labScope === null || $labScope === '') {
        return null;
    }

    $scope = (string) $labScope;
    $allowedScopes = ['all', 'computer', 'biology', 'physics'];
    if (!in_array($scope, $allowedScopes, true)) {
        respondUser(400, ['status' => 'error', 'message' => 'Invalid lab scope value.']);
    }

    return $scope;
}

if ($method === 'GET') {
    $authUser = authCurrentUser($db, true);
    $id = validUserId($_GET['id'] ?? null);
    if ($id !== null) {
        if (!authIsSelf($authUser, $id) && !authHasFeatureAccess($authUser, 'user_management', 'view', $db)) {
            respondUser(403, ['status' => 'error', 'message' => 'Access denied.']);
        }

        $stmt = $db->prepare("SELECT id, username, email, name, phone, role, lab_scope, avatar_url FROM users WHERE id = :id LIMIT 1");
        $stmt->bindParam(':id', $id, PDO::PARAM_INT);
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            respondUser(404, ['status' => 'error', 'message' => 'User not found.']);
        }
        respondUser(200, ['status' => 'success', 'user' => normalizeUserRow($row)]);
    }

    if (!authHasFeatureAccess($authUser, 'user_management', 'view', $db)) {
        respondUser(403, ['status' => 'error', 'message' => 'Access denied.']);
    }

    $stmt = $db->prepare("SELECT id, username, email, name, phone, role, lab_scope, avatar_url FROM users ORDER BY id ASC");
    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $users = array_map('normalizeUserRow', $rows);
    respondUser(200, ['status' => 'success', 'users' => $users]);
}

if ($method === 'POST') {
    $authUser = authCurrentUser($db, true);
    $action = isset($payload['action']) ? (string) $payload['action'] : '';

    if ($action === 'verify_identity') {
        if (!authHasFeatureAccess($authUser, 'operations', 'full', $db)) {
            respondUser(403, ['status' => 'error', 'message' => 'Access denied.']);
        }

        $query = trim((string) ($payload['query'] ?? ''));
        if ($query === '') {
            respondUser(400, ['status' => 'error', 'message' => 'Verification query is required.']);
        }

        $stmt = $db->prepare(
            "SELECT id
             FROM users
             WHERE LOWER(name) = LOWER(:query)
                OR LOWER(email) = LOWER(:query)
                OR phone = :phone_query
             LIMIT 1"
        );
        $stmt->bindValue(':query', $query, PDO::PARAM_STR);
        $stmt->bindValue(':phone_query', $query, PDO::PARAM_STR);
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            respondUser(404, ['status' => 'error', 'message' => 'Verifier not found.']);
        }

        respondUser(200, [
            'status' => 'success',
            'matched' => true,
            'userId' => (string) $row['id'],
        ]);
    }

    if (!authHasFeatureAccess($authUser, 'user_management', 'full', $db)) {
        respondUser(403, ['status' => 'error', 'message' => 'Access denied.']);
    }

    if (!isset($payload['username'], $payload['name'], $payload['role'], $payload['password'])) {
        respondUser(400, ['status' => 'error', 'message' => 'Incomplete user payload.']);
    }

    $username = trim((string)$payload['username']);
    $name = trim((string)$payload['name']);
    $role = validateRoleOrFail((string)$payload['role']);
    $password = (string)$payload['password'];
    $phone = isset($payload['phone']) ? trim((string)$payload['phone']) : null;
    $email = isset($payload['email']) ? trim((string)$payload['email']) : '';
    $labScope = validateLabScopeOrFail(isset($payload['labScope']) ? (string)$payload['labScope'] : (isset($payload['lab_scope']) ? (string)$payload['lab_scope'] : null));
    $avatar = isset($payload['avatar']) ? (string)$payload['avatar'] : (isset($payload['avatar_url']) ? (string)$payload['avatar_url'] : null);

    if ($username === '' || $name === '' || $password === '') {
        respondUser(400, ['status' => 'error', 'message' => 'Username, name, and password are required.']);
    }
    if (strlen($password) < 4) {
        respondUser(400, ['status' => 'error', 'message' => 'Password must be at least 4 characters.']);
    }

    if ($email === '') {
        $email = $username . '@inventory.local';
    }

    $passwordHash = password_hash($password, PASSWORD_DEFAULT);

    try {
        $stmt = $db->prepare(
            "INSERT INTO users (username, password, email, name, phone, role, lab_scope, avatar_url)
             VALUES (:username, :password, :email, :name, :phone, :role, :lab_scope, :avatar_url)"
        );
        $stmt->bindParam(':username', $username, PDO::PARAM_STR);
        $stmt->bindParam(':password', $passwordHash, PDO::PARAM_STR);
        $stmt->bindParam(':email', $email, PDO::PARAM_STR);
        $stmt->bindParam(':name', $name, PDO::PARAM_STR);
        $stmt->bindParam(':phone', $phone, PDO::PARAM_STR);
        $stmt->bindParam(':role', $role, PDO::PARAM_STR);
        $stmt->bindParam(':lab_scope', $labScope, PDO::PARAM_STR);
        $stmt->bindParam(':avatar_url', $avatar, PDO::PARAM_STR);
        $stmt->execute();
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') {
            respondUser(409, ['status' => 'error', 'message' => 'Username or email already exists.']);
        }
        respondUser(500, ['status' => 'error', 'message' => 'Failed to create user.', 'debug' => $e->getMessage()]);
    }

    $newId = (int)$db->lastInsertId();
    $fetchStmt = $db->prepare("SELECT id, username, email, name, phone, role, lab_scope, avatar_url FROM users WHERE id = :id LIMIT 1");
    $fetchStmt->bindParam(':id', $newId, PDO::PARAM_INT);
    $fetchStmt->execute();
    $newUser = $fetchStmt->fetch(PDO::FETCH_ASSOC);

    authWriteSystemLog(
        $db,
        isset($authUser['id']) ? (int) $authUser['id'] : null,
        'user.created',
        [
            'createdUserId' => (string) $newId,
            'role' => $role,
            'labScope' => $labScope
        ],
        'user',
        (string) $newId
    );

    respondUser(201, ['status' => 'success', 'message' => 'User created.', 'user' => normalizeUserRow($newUser)]);
}

if ($method === 'PUT') {
    $authUser = authCurrentUser($db, true);
    $id = validUserId($payload['id'] ?? null);
    if ($id === null) {
        respondUser(400, ['status' => 'error', 'message' => 'Invalid user id.']);
    }

    $isSelfUpdate = authIsSelf($authUser, $id);
    $canManageUsers = authHasFeatureAccess($authUser, 'user_management', 'full', $db);
    if (!$isSelfUpdate && !$canManageUsers) {
        respondUser(403, ['status' => 'error', 'message' => 'Access denied.']);
    }

    $fields = [];
    $params = [':id' => $id];

    if (array_key_exists('username', $payload)) {
        if (!$canManageUsers) {
            respondUser(403, ['status' => 'error', 'message' => 'Username can only be changed by administrators.']);
        }
        $username = trim((string)$payload['username']);
        if ($username === '') {
            respondUser(400, ['status' => 'error', 'message' => 'Username cannot be empty.']);
        }
        $fields[] = "username = :username";
        $params[':username'] = $username;
    }
    if (array_key_exists('email', $payload)) {
        $email = trim((string)$payload['email']);
        $fields[] = "email = :email";
        $params[':email'] = $email === '' ? ("user{$id}@inventory.local") : $email;
    }
    if (array_key_exists('name', $payload)) {
        $name = trim((string)$payload['name']);
        if ($name === '') {
            respondUser(400, ['status' => 'error', 'message' => 'Name cannot be empty.']);
        }
        $fields[] = "name = :name";
        $params[':name'] = $name;
    }
    if (array_key_exists('phone', $payload)) {
        $phone = trim((string)$payload['phone']);
        $fields[] = "phone = :phone";
        $params[':phone'] = $phone === '' ? null : $phone;
    }
    if (array_key_exists('role', $payload)) {
        if (!$canManageUsers) {
            respondUser(403, ['status' => 'error', 'message' => 'Role changes are restricted.']);
        }
        $fields[] = "role = :role";
        $params[':role'] = validateRoleOrFail((string)$payload['role']);
    }
    if (array_key_exists('labScope', $payload) || array_key_exists('lab_scope', $payload)) {
        if (!$canManageUsers) {
            respondUser(403, ['status' => 'error', 'message' => 'Lab scope changes are restricted.']);
        }
        $labScope = validateLabScopeOrFail(isset($payload['labScope']) ? (string)$payload['labScope'] : (string)$payload['lab_scope']);
        $fields[] = "lab_scope = :lab_scope";
        $params[':lab_scope'] = $labScope === '' ? null : $labScope;
    }
    if (array_key_exists('avatar', $payload) || array_key_exists('avatar_url', $payload)) {
        $avatar = isset($payload['avatar']) ? (string)$payload['avatar'] : (string)$payload['avatar_url'];
        if ($avatar !== '' && strlen($avatar) > (3 * 1024 * 1024)) {
            respondUser(400, ['status' => 'error', 'message' => 'Avatar payload is too large.']);
        }
        $fields[] = "avatar_url = :avatar_url";
        $params[':avatar_url'] = $avatar === '' ? null : $avatar;
    }
    if (array_key_exists('password', $payload)) {
        $password = (string)$payload['password'];
        if ($password !== '') {
            if (strlen($password) < 4) {
                respondUser(400, ['status' => 'error', 'message' => 'Password must be at least 4 characters.']);
            }
            $fields[] = "password = :password";
            $params[':password'] = password_hash($password, PASSWORD_DEFAULT);
        }
    }

    if (count($fields) === 0) {
        respondUser(400, ['status' => 'error', 'message' => 'No updatable fields provided.']);
    }

    $sql = "UPDATE users SET " . implode(', ', $fields) . " WHERE id = :id";
    try {
        $stmt = $db->prepare($sql);
        foreach ($params as $key => $value) {
            if ($value === null) {
                $stmt->bindValue($key, null, PDO::PARAM_NULL);
                continue;
            }
            $stmt->bindValue($key, $value);
        }
        $stmt->execute();
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') {
            respondUser(409, ['status' => 'error', 'message' => 'Username or email already exists.']);
        }
        respondUser(500, ['status' => 'error', 'message' => 'Failed to update user.', 'debug' => $e->getMessage()]);
    }

    $fetchStmt = $db->prepare("SELECT id, username, email, name, phone, role, lab_scope, avatar_url FROM users WHERE id = :id LIMIT 1");
    $fetchStmt->bindParam(':id', $id, PDO::PARAM_INT);
    $fetchStmt->execute();
    $row = $fetchStmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        respondUser(404, ['status' => 'error', 'message' => 'User not found after update.']);
    }

    authWriteSystemLog(
        $db,
        isset($authUser['id']) ? (int) $authUser['id'] : null,
        'user.updated',
        [
            'updatedFields' => array_values(array_map(
                static fn(string $field): string => trim(str_replace([' = :', '= :'], '', $field)),
                $fields
            ))
        ],
        'user',
        (string) $id
    );

    respondUser(200, ['status' => 'success', 'message' => 'User updated.', 'user' => normalizeUserRow($row)]);
}

if ($method === 'DELETE') {
    $authUser = authCurrentUser($db, true);
    if (!authHasFeatureAccess($authUser, 'user_management', 'full', $db)) {
        respondUser(403, ['status' => 'error', 'message' => 'Access denied.']);
    }

    $id = validUserId($payload['id'] ?? $_GET['id'] ?? null);
    if ($id === null) {
        respondUser(400, ['status' => 'error', 'message' => 'Invalid user id.']);
    }

    if (authIsSelf($authUser, $id)) {
        respondUser(400, ['status' => 'error', 'message' => 'You cannot delete your own account.']);
    }

    $stmt = $db->prepare("DELETE FROM users WHERE id = :id");
    $stmt->bindParam(':id', $id, PDO::PARAM_INT);
    $stmt->execute();

    if ($stmt->rowCount() === 0) {
        respondUser(404, ['status' => 'error', 'message' => 'User not found.']);
    }

    authWriteSystemLog(
        $db,
        isset($authUser['id']) ? (int) $authUser['id'] : null,
        'user.deleted',
        [],
        'user',
        (string) $id
    );

    respondUser(200, ['status' => 'success', 'message' => 'User deleted.']);
}

respondUser(405, ['status' => 'error', 'message' => 'Method not allowed.']);
