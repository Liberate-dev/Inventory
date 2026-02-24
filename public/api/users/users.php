<?php
include_once '../config/cors.php';
include_once '../config/database.php';

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

if ($method === 'GET') {
    $id = validUserId($_GET['id'] ?? null);
    if ($id !== null) {
        $stmt = $db->prepare("SELECT id, username, email, name, phone, role, lab_scope, avatar_url FROM users WHERE id = :id LIMIT 1");
        $stmt->bindParam(':id', $id, PDO::PARAM_INT);
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            respondUser(404, ['status' => 'error', 'message' => 'User not found.']);
        }
        respondUser(200, ['status' => 'success', 'user' => normalizeUserRow($row)]);
    }

    $stmt = $db->prepare("SELECT id, username, email, name, phone, role, lab_scope, avatar_url FROM users ORDER BY id ASC");
    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $users = array_map('normalizeUserRow', $rows);
    respondUser(200, ['status' => 'success', 'users' => $users]);
}

if ($method === 'POST') {
    if (!isset($payload['username'], $payload['name'], $payload['role'], $payload['password'])) {
        respondUser(400, ['status' => 'error', 'message' => 'Incomplete user payload.']);
    }

    $username = trim((string)$payload['username']);
    $name = trim((string)$payload['name']);
    $role = (string)$payload['role'];
    $password = (string)$payload['password'];
    $phone = isset($payload['phone']) ? trim((string)$payload['phone']) : null;
    $email = isset($payload['email']) ? trim((string)$payload['email']) : '';
    $labScope = isset($payload['labScope']) ? (string)$payload['labScope'] : (isset($payload['lab_scope']) ? (string)$payload['lab_scope'] : null);
    $avatar = isset($payload['avatar']) ? (string)$payload['avatar'] : (isset($payload['avatar_url']) ? (string)$payload['avatar_url'] : null);

    if ($username === '' || $name === '' || $password === '') {
        respondUser(400, ['status' => 'error', 'message' => 'Username, name, and password are required.']);
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

    respondUser(201, ['status' => 'success', 'message' => 'User created.', 'user' => normalizeUserRow($newUser)]);
}

if ($method === 'PUT') {
    $id = validUserId($payload['id'] ?? null);
    if ($id === null) {
        respondUser(400, ['status' => 'error', 'message' => 'Invalid user id.']);
    }

    $fields = [];
    $params = [':id' => $id];

    if (array_key_exists('username', $payload)) {
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
        $fields[] = "role = :role";
        $params[':role'] = (string)$payload['role'];
    }
    if (array_key_exists('labScope', $payload) || array_key_exists('lab_scope', $payload)) {
        $labScope = isset($payload['labScope']) ? (string)$payload['labScope'] : (string)$payload['lab_scope'];
        $fields[] = "lab_scope = :lab_scope";
        $params[':lab_scope'] = $labScope === '' ? null : $labScope;
    }
    if (array_key_exists('avatar', $payload) || array_key_exists('avatar_url', $payload)) {
        $avatar = isset($payload['avatar']) ? (string)$payload['avatar'] : (string)$payload['avatar_url'];
        $fields[] = "avatar_url = :avatar_url";
        $params[':avatar_url'] = $avatar === '' ? null : $avatar;
    }
    if (array_key_exists('password', $payload)) {
        $password = (string)$payload['password'];
        if ($password !== '') {
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

    respondUser(200, ['status' => 'success', 'message' => 'User updated.', 'user' => normalizeUserRow($row)]);
}

if ($method === 'DELETE') {
    $id = validUserId($payload['id'] ?? $_GET['id'] ?? null);
    if ($id === null) {
        respondUser(400, ['status' => 'error', 'message' => 'Invalid user id.']);
    }

    $stmt = $db->prepare("DELETE FROM users WHERE id = :id");
    $stmt->bindParam(':id', $id, PDO::PARAM_INT);
    $stmt->execute();

    if ($stmt->rowCount() === 0) {
        respondUser(404, ['status' => 'error', 'message' => 'User not found.']);
    }

    respondUser(200, ['status' => 'success', 'message' => 'User deleted.']);
}

respondUser(405, ['status' => 'error', 'message' => 'Method not allowed.']);
