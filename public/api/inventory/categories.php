<?php
require_once dirname(__DIR__) . '/config/cors.php';
require_once dirname(__DIR__) . '/config/database.php';
require_once dirname(__DIR__) . '/config/auth.php';
require_once __DIR__ . '/schema_compat.php';

header('Content-Type: application/json');

$database = new Database();
$db = $database->getConnection();

if (!$db) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Database connection failed.']);
    exit;
}

ensureCategoriesSchema($db);
ensureInventoryEventsSchema($db);

$method = $_SERVER['REQUEST_METHOD'];
$user = authCurrentUser($db, true);

if ($method === 'GET') {
    if (!authHasFeatureAccess($user, 'item_management', 'view', $db)) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'Access denied.']);
        exit;
    }

    try {
        $stmt = $db->prepare('SELECT * FROM item_categories ORDER BY name ASC');
        $stmt->execute();
        $categories = $stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'status' => 'success',
            'categories' => $categories
        ]);
        exit;
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        exit;
    }
}

if ($method === 'POST') {
    if (!authHasFeatureAccess($user, 'item_management', 'full', $db)) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'Access denied.']);
        exit;
    }

    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $action = $input['action'] ?? '';

    if ($action === 'create') {
        $name = trim($input['name'] ?? '');

        if (!$name) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Name is required for category.']);
            exit;
        }

        try {
            $stmt = $db->prepare('INSERT INTO item_categories (name) VALUES (?)');
            $stmt->execute([$name]);
            $id = (int)$db->lastInsertId();

            // Log event for real-time sync to all clients (no polling)
            $eventPayload = json_encode(['id' => $id, 'name' => $name]);
            $db->prepare("INSERT INTO inventory_events (event_type, payload) VALUES ('category_created', ?)")->execute([$eventPayload]);

            echo json_encode(['status' => 'success', 'message' => 'Category created.', 'id' => $id]);
            exit;
        } catch (Exception $e) {
            if (strpos($e->getMessage(), 'Duplicate') !== false || $e->getCode() == 23000) {
                http_response_code(409);
                echo json_encode(['status' => 'error', 'message' => 'Category already exists.']);
                exit;
            }
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            exit;
        }
    }

    if ($action === 'delete') {
        $id = $input['id'] ?? null;
        if (!$id) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'ID is required for delete.']);
            exit;
        }

        try {
            $stmt = $db->prepare('DELETE FROM item_categories WHERE id = ?');
            $stmt->execute([$id]);

            // Log event for real-time sync
            $eventPayload = json_encode(['id' => $id]);
            $db->prepare("INSERT INTO inventory_events (event_type, payload) VALUES ('category_deleted', ?)")->execute([$eventPayload]);

            echo json_encode(['status' => 'success', 'message' => 'Category deleted.']);
            exit;
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            exit;
        }
    }

    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Unknown or unsupported action.']);
    exit;
}

http_response_code(405);
echo json_encode(['status' => 'error', 'message' => 'Method not allowed.']);

