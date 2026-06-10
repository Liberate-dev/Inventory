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

// Auto-create the item_types table (and items.item_type_id linking column) if this DB was created before the feature
ensureItemTypesSchema($db);
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
        $stmt = $db->prepare('SELECT * FROM item_types ORDER BY name ASC');
        $stmt->execute();
        $types = $stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'status' => 'success',
            'item_types' => $types
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
        $type = trim($input['type'] ?? 'General');
        $category = $input['category'] ?? null;
        $specs = $input['specs'] ?? '';
        $parameters = isset($input['parameters']) && is_array($input['parameters']) ? json_encode($input['parameters']) : json_encode([]);

        if (!$name) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Name is required for item type.']);
            exit;
        }

        try {
            $stmt = $db->prepare('INSERT INTO item_types (name, type, category, specs, parameters) VALUES (?, ?, ?, ?, ?)');
            $stmt->execute([$name, $type, $category, $specs, $parameters]);
            $id = (int)$db->lastInsertId();

            // Log for real-time auto sync across all clients/roles (no manual refresh needed)
            $eventPayload = json_encode(['id' => $id, 'name' => $name, 'type' => $type, 'category' => $category]);
            $db->prepare("INSERT INTO inventory_events (event_type, payload) VALUES ('item_type_created', ?)")->execute([$eventPayload]);

            echo json_encode(['status' => 'success', 'message' => 'Item type created.', 'id' => $id]);
            exit;
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            exit;
        }
    }

    // Add update/delete as needed in full impl
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Unknown or unsupported action for item types.']);
    exit;
}

http_response_code(405);
echo json_encode(['status' => 'error', 'message' => 'Method not allowed.']);
