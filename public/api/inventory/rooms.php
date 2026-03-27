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

$entity = $_GET['entity'] ?? ($payload['entity'] ?? 'room');

function respond(int $statusCode, array $data): void
{
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

function normalizeRoomRows(PDO $db, array $authUser): array
{
    // 1. Rooms
    $stmtRooms = $db->prepare("SELECT * FROM rooms WHERE deleted_at IS NULL ORDER BY id ASC");
    $stmtRooms->execute();
    $rooms = $stmtRooms->fetchAll(PDO::FETCH_ASSOC);

    // 2. Containers
    $stmtContainers = $db->prepare(
        "SELECT * FROM containers
         WHERE deleted_at IS NULL
         ORDER BY room_id ASC, position_y ASC, position_x ASC, id ASC"
    );
    $stmtContainers->execute();
    $containers = $stmtContainers->fetchAll(PDO::FETCH_ASSOC);

    // 3. Items
    $stmtItems = $db->prepare("SELECT * FROM items WHERE deleted_at IS NULL ORDER BY id ASC");
    $stmtItems->execute();
    $items = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

    // 4. Item logs
    $stmtLogs = $db->prepare("SELECT * FROM item_logs ORDER BY date DESC");
    $stmtLogs->execute();
    $logs = $stmtLogs->fetchAll(PDO::FETCH_ASSOC);

    $logsByItemId = [];
    foreach ($logs as $log) {
        $itemId = (string) $log['item_id'];
        $log['id'] = (string) $log['id'];
        $log['item_id'] = $itemId;
        $log['user_id'] = $log['user_id'] !== null ? (string) $log['user_id'] : null;

        // Keep object payloads as JSON strings for consumers that parse them,
        // but normalize JSON string scalars back to plain text for UI display.
        if (isset($log['details']) && is_string($log['details'])) {
            $decodedDetails = json_decode($log['details'], true);
            if (json_last_error() === JSON_ERROR_NONE && is_string($decodedDetails)) {
                $log['details'] = $decodedDetails;
            }
        }

        $logsByItemId[$itemId][] = $log;
    }

    $itemsByContainerId = [];
    foreach ($items as $item) {
        $itemId = (string) $item['id'];
        $containerId = (string) $item['container_id'];

        $item['id'] = $itemId;
        $item['condition'] = $item['condition'] ?? 'good';
        $item['status'] = $item['status'] ?? 'available';
        $item['quantity'] = (int) $item['quantity'];
        $item['isConsumable'] = (bool) $item['is_consumable'];
        $item['minStock'] = (int) $item['min_stock'];
        $item['image_layer'] = $item['image_url'];
        $item['parameters'] = json_decode($item['parameters'] ?? '[]', true);
        if (!is_array($item['parameters'])) {
            $item['parameters'] = [];
        }
        $item['logs'] = $logsByItemId[$itemId] ?? [];

        unset($item['container_id']);
        unset($item['is_consumable']);
        unset($item['min_stock']);
        unset($item['image_url']);

        $itemsByContainerId[$containerId][] = $item;
    }

    $containersByRoomId = [];
    foreach ($containers as $container) {
        $containerId = (string) $container['id'];
        $roomId = (string) $container['room_id'];

        $container['id'] = $containerId;
        $container['room_id'] = $roomId;
        $container['position'] = [
            'x' => (int) $container['position_x'],
            'y' => (int) $container['position_y']
        ];
        $container['imageUrl'] = $container['image_url'] ?? null;
        $container['items'] = $itemsByContainerId[$containerId] ?? [];

        unset($container['position_x']);
        unset($container['position_y']);

        $containersByRoomId[$roomId][] = $container;
    }

    foreach ($rooms as &$room) {
        $roomId = (string) $room['id'];
        $room['id'] = $roomId;
        $room['capacity'] = (int) $room['capacity'];
        $room['roomOwner'] = $room['room_owner'] ?? null;
        $room['customType'] = $room['custom_type'];
        $room['containers'] = $containersByRoomId[$roomId] ?? [];
        unset($room['custom_type']);
        unset($room['room_owner']);
    }
    unset($room);

    if (!authIsScopeRestricted($authUser)) {
        return $rooms;
    }

    $labScope = (string) ($authUser['lab_scope'] ?? '');
    return array_values(array_filter($rooms, function ($room) use ($labScope) {
        if ($labScope === 'non-lab') {
            return isset($room['category']) && (string) $room['category'] === 'non-lab';
        }
        return isset($room['type']) && (string) $room['type'] === $labScope;
    }));
}

function validateId($value): ?int
{
    if (!is_numeric($value)) {
        return null;
    }

    $intValue = (int) $value;
    if ($intValue <= 0) {
        return null;
    }

    return $intValue;
}

function normalizeRoomTypeOrFail(string $type): string
{
    $allowedTypes = ['computer', 'physics', 'biology', 'classroom', 'office', 'warehouse', 'other'];
    if (!in_array($type, $allowedTypes, true)) {
        respond(400, ["status" => "error", "message" => "Invalid room type."]);
    }

    return $type;
}

function normalizeRoomCategoryOrFail(string $category): string
{
    $allowedCategories = ['lab', 'non-lab'];
    if (!in_array($category, $allowedCategories, true)) {
        respond(400, ["status" => "error", "message" => "Invalid room category."]);
    }

    return $category;
}

function normalizeContainerTypeOrFail(string $type): string
{
    $allowedTypes = ['table', 'cupboard', 'shelf'];
    if (!in_array($type, $allowedTypes, true)) {
        respond(400, ["status" => "error", "message" => "Invalid container type."]);
    }

    return $type;
}

function normalizeLogDate($value): string
{
    if (is_string($value)) {
        $trimmed = trim($value);
        if ($trimmed !== '') {
            $timestamp = strtotime($trimmed);
            if ($timestamp !== false) {
                return date('Y-m-d H:i:s', $timestamp);
            }
        }
    }

    if (is_int($value) || is_float($value)) {
        $timestamp = (int) $value;
        if ($timestamp > 0) {
            return date('Y-m-d H:i:s', $timestamp);
        }
    }

    return date('Y-m-d H:i:s');
}

function syncContainerItems(PDO $db, array $authUser, int $containerId, array $items): void
{
    $allowedConditions = ['good', 'service', 'damaged', 'broken'];
    $allowedStatuses = ['available', 'in_use', 'maintenance', 'missing'];

    $selectExistingStmt = $db->prepare("SELECT id FROM items WHERE container_id = :container_id");
    $selectExistingStmt->bindParam(':container_id', $containerId, PDO::PARAM_INT);
    $selectExistingStmt->execute();
    $existingRows = $selectExistingStmt->fetchAll(PDO::FETCH_ASSOC);
    $existingItemIds = [];
    foreach ($existingRows as $existingRow) {
        $existingItemIds[(int) $existingRow['id']] = true;
    }
    $findItemByIdStmt = $db->prepare("SELECT id FROM items WHERE id = :id LIMIT 1");

    $updateItemStmt = $db->prepare(
        "UPDATE `items`
         SET
            `container_id` = :container_id,
            `name` = :name,
            `type` = :type,
            `condition` = :condition,
            `status` = :status,
            `specs` = :specs,
            `image_url` = :image_url,
            `sku` = :sku,
            `category` = :category,
            `is_consumable` = :is_consumable,
            `quantity` = :quantity,
            `unit` = :unit,
            `min_stock` = :min_stock,
            `source` = :source,
            `parameters` = :parameters
         WHERE `id` = :id"
    );

    $insertItemStmt = $db->prepare(
        "INSERT INTO `items` (
            `container_id`, `name`, `type`, `condition`, `status`, `specs`, `image_url`,
            `sku`, `category`, `is_consumable`, `quantity`, `unit`, `min_stock`, `source`, `parameters`
        ) VALUES (
            :container_id, :name, :type, :condition, :status, :specs, :image_url,
            :sku, :category, :is_consumable, :quantity, :unit, :min_stock, :source, :parameters
        )"
    );

    $insertLogStmt = $db->prepare(
        "INSERT INTO item_logs (item_id, action, date, details)
         VALUES (:item_id, :action, :date, :details)"
    );
    $logExistsStmt = $db->prepare(
        "SELECT id
         FROM item_logs
         WHERE item_id = :item_id
           AND action = :action
           AND date = :date
           AND details = :details
         LIMIT 1"
    );
    $updateLogByIdStmt = $db->prepare(
        "UPDATE item_logs
         SET action = :action, date = :date, details = :details
         WHERE id = :id AND item_id = :item_id"
    );
    $countLogsStmt = $db->prepare("SELECT COUNT(*) FROM item_logs WHERE item_id = :item_id");

    $insertDefaultLog = function (int $itemId) use ($insertLogStmt): void {
        $action = 'CREATED';
        $date = date('Y-m-d H:i:s');
        $details = json_encode('Item dibuat.', JSON_UNESCAPED_UNICODE);
        if ($details === false || $details === null) {
            $details = json_encode('');
        }

        $insertLogStmt->bindValue(':item_id', $itemId, PDO::PARAM_INT);
        $insertLogStmt->bindValue(':action', $action, PDO::PARAM_STR);
        $insertLogStmt->bindValue(':date', $date, PDO::PARAM_STR);
        $insertLogStmt->bindValue(':details', $details, PDO::PARAM_STR);
        $insertLogStmt->execute();
    };
    $keptItemIds = [];

    foreach ($items as $item) {
        if (!is_array($item) || !isset($item['name']) || trim((string) $item['name']) === '') {
            continue;
        }

        $name = trim((string) $item['name']);
        $type = trim((string) ($item['type'] ?? 'General'));
        $condition = (string) ($item['condition'] ?? 'good');
        $status = (string) ($item['status'] ?? 'available');
        if (!in_array($condition, $allowedConditions, true)) {
            $condition = 'good';
        }
        if (!in_array($status, $allowedStatuses, true)) {
            // Frontend might mistakenly pass condition 'service' as status.
            // If it's literally 'service', map to 'maintenance'. Otherwise default to 'available'.
            // Actually, transferring just preserves the old item properties including its DB status.
            $status = ($status === 'service' || $status === 'maintenance') ? 'maintenance' : 'available';
        }
        $specs = isset($item['specs']) ? (string) $item['specs'] : '';
        $imageUrl = isset($item['image_layer']) ? (string) $item['image_layer'] : (isset($item['image_url']) ? (string) $item['image_url'] : null);
        $sku = isset($item['sku']) ? (string) $item['sku'] : null;
        $category = isset($item['category']) ? (string) $item['category'] : null;
        $isConsumable = !empty($item['isConsumable']) ? 1 : (!empty($item['is_consumable']) ? 1 : 0);
        $quantity = isset($item['quantity']) ? (int) $item['quantity'] : 1;
        $unit = isset($item['unit']) ? (string) $item['unit'] : null;
        $minStock = isset($item['minStock']) ? (int) $item['minStock'] : (isset($item['min_stock']) ? (int) $item['min_stock'] : 0);
        $source = isset($item['source']) ? (string) $item['source'] : null;
        $parameters = isset($item['parameters']) && is_array($item['parameters']) ? json_encode($item['parameters']) : json_encode([]);
        $itemId = validateId($item['id'] ?? null);
        $hasExistingItem = false;
        if ($itemId !== null) {
            $findItemByIdStmt->bindValue(':id', $itemId, PDO::PARAM_INT);
            $findItemByIdStmt->execute();
            $hasExistingItem = (bool) $findItemByIdStmt->fetch(PDO::FETCH_ASSOC);
        }

        if ($hasExistingItem) {
            authAssertItemScope($db, $authUser, $itemId);

            $updateItemStmt->bindValue(':id', $itemId, PDO::PARAM_INT);
            $updateItemStmt->bindValue(':container_id', $containerId, PDO::PARAM_INT);
            $updateItemStmt->bindValue(':name', $name, PDO::PARAM_STR);
            $updateItemStmt->bindValue(':type', $type, PDO::PARAM_STR);
            $updateItemStmt->bindValue(':condition', $condition, PDO::PARAM_STR);
            $updateItemStmt->bindValue(':status', $status, PDO::PARAM_STR);
            $updateItemStmt->bindValue(':specs', $specs, PDO::PARAM_STR);
            if ($imageUrl === null || $imageUrl === '') {
                $updateItemStmt->bindValue(':image_url', null, PDO::PARAM_NULL);
            } else {
                $updateItemStmt->bindValue(':image_url', $imageUrl, PDO::PARAM_STR);
            }
            if ($sku === null || $sku === '') {
                $updateItemStmt->bindValue(':sku', null, PDO::PARAM_NULL);
            } else {
                $updateItemStmt->bindValue(':sku', $sku, PDO::PARAM_STR);
            }
            if ($category === null || $category === '') {
                $updateItemStmt->bindValue(':category', null, PDO::PARAM_NULL);
            } else {
                $updateItemStmt->bindValue(':category', $category, PDO::PARAM_STR);
            }
            $updateItemStmt->bindValue(':is_consumable', $isConsumable, PDO::PARAM_INT);
            $updateItemStmt->bindValue(':quantity', $quantity, PDO::PARAM_INT);
            if ($unit === null || $unit === '') {
                $updateItemStmt->bindValue(':unit', null, PDO::PARAM_NULL);
            } else {
                $updateItemStmt->bindValue(':unit', $unit, PDO::PARAM_STR);
            }
            $updateItemStmt->bindValue(':min_stock', $minStock, PDO::PARAM_INT);
            $updateItemStmt->bindValue(':source', $source, PDO::PARAM_STR);
            $updateItemStmt->bindValue(':parameters', $parameters, PDO::PARAM_STR);
            $updateItemStmt->execute();
            $newItemId = $itemId;
        } else {
            $insertItemStmt->bindValue(':container_id', $containerId, PDO::PARAM_INT);
            $insertItemStmt->bindValue(':name', $name, PDO::PARAM_STR);
            $insertItemStmt->bindValue(':type', $type, PDO::PARAM_STR);
            $insertItemStmt->bindValue(':condition', $condition, PDO::PARAM_STR);
            $insertItemStmt->bindValue(':status', $status, PDO::PARAM_STR);
            $insertItemStmt->bindValue(':specs', $specs, PDO::PARAM_STR);
            if ($imageUrl === null || $imageUrl === '') {
                $insertItemStmt->bindValue(':image_url', null, PDO::PARAM_NULL);
            } else {
                $insertItemStmt->bindValue(':image_url', $imageUrl, PDO::PARAM_STR);
            }
            if ($sku === null || $sku === '') {
                $insertItemStmt->bindValue(':sku', null, PDO::PARAM_NULL);
            } else {
                $insertItemStmt->bindValue(':sku', $sku, PDO::PARAM_STR);
            }
            if ($category === null || $category === '') {
                $insertItemStmt->bindValue(':category', null, PDO::PARAM_NULL);
            } else {
                $insertItemStmt->bindValue(':category', $category, PDO::PARAM_STR);
            }
            $insertItemStmt->bindValue(':is_consumable', $isConsumable, PDO::PARAM_INT);
            $insertItemStmt->bindValue(':quantity', $quantity, PDO::PARAM_INT);
            if ($unit === null || $unit === '') {
                $insertItemStmt->bindValue(':unit', null, PDO::PARAM_NULL);
            } else {
                $insertItemStmt->bindValue(':unit', $unit, PDO::PARAM_STR);
            }
            $insertItemStmt->bindValue(':min_stock', $minStock, PDO::PARAM_INT);
            $insertItemStmt->bindValue(':source', $source, PDO::PARAM_STR);
            $insertItemStmt->bindValue(':parameters', $parameters, PDO::PARAM_STR);
            $insertItemStmt->execute();
            $newItemId = (int) $db->lastInsertId();
        }

        $keptItemIds[] = $newItemId;

        if (!array_key_exists('logs', $item) || !is_array($item['logs'])) {
            $countLogsStmt->bindValue(':item_id', $newItemId, PDO::PARAM_INT);
            $countLogsStmt->execute();
            $existingLogCount = (int) $countLogsStmt->fetchColumn();
            if ($existingLogCount === 0) {
                $insertDefaultLog($newItemId);
            }
            continue;
        }

        $insertedOrExistingLogCount = 0;
        foreach ($item['logs'] as $log) {
            if (!is_array($log) || !isset($log['action'])) {
                continue;
            }

            $action = (string) $log['action'];
            $date = normalizeLogDate($log['date'] ?? null);
            $detailsRaw = $log['details'] ?? '';
            if (is_string($detailsRaw)) {
                $trimmed = trim($detailsRaw);
                if ($trimmed === '') {
                    $details = json_encode('');
                } else {
                    json_decode($trimmed, true);
                    if (json_last_error() === JSON_ERROR_NONE) {
                        $details = $trimmed;
                    } else {
                        $details = json_encode($detailsRaw, JSON_UNESCAPED_UNICODE);
                    }
                }
            } else {
                $details = json_encode($detailsRaw, JSON_UNESCAPED_UNICODE);
            }
            if ($details === false || $details === null) {
                $details = json_encode('');
            }

            $incomingLogId = validateId($log['id'] ?? null);
            if ($incomingLogId !== null) {
                $updateLogByIdStmt->bindValue(':id', $incomingLogId, PDO::PARAM_INT);
                $updateLogByIdStmt->bindValue(':item_id', $newItemId, PDO::PARAM_INT);
                $updateLogByIdStmt->bindValue(':action', $action, PDO::PARAM_STR);
                $updateLogByIdStmt->bindValue(':date', $date, PDO::PARAM_STR);
                $updateLogByIdStmt->bindValue(':details', $details, PDO::PARAM_STR);
                $updateLogByIdStmt->execute();

                if ($updateLogByIdStmt->rowCount() > 0) {
                    $insertedOrExistingLogCount++;
                    continue;
                }
            }

            $logExistsStmt->bindValue(':item_id', $newItemId, PDO::PARAM_INT);
            $logExistsStmt->bindValue(':action', $action, PDO::PARAM_STR);
            $logExistsStmt->bindValue(':date', $date, PDO::PARAM_STR);
            $logExistsStmt->bindValue(':details', $details, PDO::PARAM_STR);
            $logExistsStmt->execute();
            if ($logExistsStmt->fetch(PDO::FETCH_ASSOC)) {
                $insertedOrExistingLogCount++;
                continue;
            }

            $insertLogStmt->bindValue(':item_id', $newItemId, PDO::PARAM_INT);
            $insertLogStmt->bindValue(':action', $action, PDO::PARAM_STR);
            $insertLogStmt->bindValue(':date', $date, PDO::PARAM_STR);
            $insertLogStmt->bindValue(':details', $details, PDO::PARAM_STR);
            $insertLogStmt->execute();
            $insertedOrExistingLogCount++;
        }

        if ($insertedOrExistingLogCount === 0) {
            $insertDefaultLog($newItemId);
        }
    }

    if (count($keptItemIds) > 0) {
        $placeholders = implode(',', array_fill(0, count($keptItemIds), '?'));
        $deleteRemovedStmt = $db->prepare("UPDATE items SET deleted_at = NOW() WHERE container_id = ? AND id NOT IN ($placeholders) AND deleted_at IS NULL");
        $deleteRemovedStmt->execute(array_merge([$containerId], $keptItemIds));
    } else {
        $deleteAllStmt = $db->prepare("UPDATE items SET deleted_at = NOW() WHERE container_id = :container_id AND deleted_at IS NULL");
        $deleteAllStmt->bindParam(':container_id', $containerId, PDO::PARAM_INT);
        $deleteAllStmt->execute();
    }
}

if ($method == 'GET') {
    $authUser = authRequireFeature($db, 'rooms', 'view');
    respond(200, normalizeRoomRows($db, $authUser));
}

if ($method == 'POST') {
    $authUser = authCurrentUser($db, true);
    if ($entity === 'room') {
        if (!authHasFeatureAccess($authUser, 'rooms', 'full', $db)) {
            respond(403, ["status" => "error", "message" => "Access denied."]);
        }
        if (!isset($payload['name'], $payload['type'], $payload['category'])) {
            respond(400, ["status" => "error", "message" => "Incomplete room payload."]);
        }

        $manualId = validateId($payload['id'] ?? null);
        $name = trim((string) $payload['name']);
        $type = normalizeRoomTypeOrFail((string) $payload['type']);
        $category = normalizeRoomCategoryOrFail((string) $payload['category']);
        $roomOwner = isset($payload['roomOwner']) ? (string) $payload['roomOwner'] : (isset($payload['room_owner']) ? (string) $payload['room_owner'] : null);
        $customType = isset($payload['customType']) ? (string) $payload['customType'] : (isset($payload['custom_type']) ? (string) $payload['custom_type'] : null);
        $capacity = isset($payload['capacity']) ? (int) $payload['capacity'] : 0;

        if (!authCanAccessRoomType($authUser, $type, $category)) {
            respond(403, ["status" => "error", "message" => "Room type is outside your scope."]);
        }

        if ($manualId !== null) {
            $stmt = $db->prepare(
                "INSERT INTO rooms (id, name, type, category, custom_type, capacity, room_owner)
                 VALUES (:id, :name, :type, :category, :custom_type, :capacity, :room_owner)"
            );
            $stmt->bindParam(':id', $manualId, PDO::PARAM_INT);
            $stmt->bindParam(':name', $name, PDO::PARAM_STR);
            $stmt->bindParam(':type', $type, PDO::PARAM_STR);
            $stmt->bindParam(':category', $category, PDO::PARAM_STR);
            $stmt->bindParam(':custom_type', $customType, PDO::PARAM_STR);
            $stmt->bindParam(':capacity', $capacity, PDO::PARAM_INT);
            $stmt->bindParam(':room_owner', $roomOwner, PDO::PARAM_STR);
            $stmt->execute();
            respond(201, ["status" => "success", "id" => (string) $manualId, "message" => "Room created."]);
        }

        $stmt = $db->prepare(
            "INSERT INTO rooms (name, type, category, custom_type, capacity, room_owner)
             VALUES (:name, :type, :category, :custom_type, :capacity, :room_owner)"
        );
        $stmt->bindParam(':name', $name, PDO::PARAM_STR);
        $stmt->bindParam(':type', $type, PDO::PARAM_STR);
        $stmt->bindParam(':category', $category, PDO::PARAM_STR);
        $stmt->bindParam(':custom_type', $customType, PDO::PARAM_STR);
        $stmt->bindParam(':capacity', $capacity, PDO::PARAM_INT);
        $stmt->bindParam(':room_owner', $roomOwner, PDO::PARAM_STR);
        $stmt->execute();

        respond(201, ["status" => "success", "id" => (string) $db->lastInsertId(), "message" => "Room created."]);
    }

    if ($entity === 'container') {
        if (!authHasFeatureAccess($authUser, 'rooms', 'full', $db)) {
            respond(403, ["status" => "error", "message" => "Access denied."]);
        }
        $roomId = validateId($payload['roomId'] ?? $payload['room_id'] ?? null);
        if ($roomId === null || !isset($payload['name'], $payload['type'])) {
            respond(400, ["status" => "error", "message" => "Incomplete container payload."]);
        }

        authAssertRoomScope($db, $authUser, $roomId);

        $name = trim((string) $payload['name']);
        $type = normalizeContainerTypeOrFail((string) $payload['type']);
        $status = isset($payload['status']) ? (string) $payload['status'] : 'good';
        if (!in_array($status, ['good', 'warning', 'error'], true)) {
            $status = 'good';
        }
        $position = $payload['position'] ?? [];
        $positionX = isset($position['x']) ? (int) $position['x'] : 0;
        $positionY = isset($position['y']) ? (int) $position['y'] : 0;

        $db->beginTransaction();
        try {
            $stmt = $db->prepare(
                "INSERT INTO containers (room_id, name, type, status, image_url, position_x, position_y)
                 VALUES (:room_id, :name, :type, :status, :image_url, :position_x, :position_y)"
            );
            $stmt->bindParam(':room_id', $roomId, PDO::PARAM_INT);
            $stmt->bindParam(':name', $name, PDO::PARAM_STR);
            $stmt->bindParam(':type', $type, PDO::PARAM_STR);
            $stmt->bindParam(':status', $status, PDO::PARAM_STR);
            $stmt->bindParam(':image_url', $payload['imageUrl'], PDO::PARAM_STR);
            $stmt->bindParam(':position_x', $positionX, PDO::PARAM_INT);
            $stmt->bindParam(':position_y', $positionY, PDO::PARAM_INT);
            $stmt->execute();

            $containerId = (int) $db->lastInsertId();
            if (isset($payload['items']) && is_array($payload['items'])) {
                syncContainerItems($db, $authUser, $containerId, $payload['items']);
            }

            $db->commit();
            respond(201, ["status" => "success", "id" => (string) $containerId, "message" => "Container created."]);
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            respond(500, ["status" => "error", "message" => "Failed to create container.", "debug" => $e->getMessage()]);
        }
    }

    if ($entity === 'container-bulk') {
        if (!authHasFeatureAccess($authUser, 'rooms', 'full', $db)) {
            respond(403, ["status" => "error", "message" => "Access denied."]);
        }
        $roomId = validateId($payload['roomId'] ?? $payload['room_id'] ?? null);
        $containers = $payload['containers'] ?? null;
        if ($roomId === null || !is_array($containers)) {
            respond(400, ["status" => "error", "message" => "Invalid bulk container payload."]);
        }

        authAssertRoomScope($db, $authUser, $roomId);

        $insertedIds = [];
        $db->beginTransaction();
        try {
            $stmt = $db->prepare(
                "INSERT INTO containers (room_id, name, type, status, position_x, position_y)
                 VALUES (:room_id, :name, :type, :status, :position_x, :position_y)"
            );

            foreach ($containers as $container) {
                if (!is_array($container) || !isset($container['name'], $container['type'])) {
                    continue;
                }

                $name = trim((string) $container['name']);
                $type = normalizeContainerTypeOrFail((string) $container['type']);
                $status = isset($container['status']) ? (string) $container['status'] : 'good';
                if (!in_array($status, ['good', 'warning', 'error'], true)) {
                    $status = 'good';
                }
                $position = $container['position'] ?? [];
                $positionX = isset($position['x']) ? (int) $position['x'] : 0;
                $positionY = isset($position['y']) ? (int) $position['y'] : 0;

                $stmt->bindParam(':room_id', $roomId, PDO::PARAM_INT);
                $stmt->bindParam(':name', $name, PDO::PARAM_STR);
                $stmt->bindParam(':type', $type, PDO::PARAM_STR);
                $stmt->bindParam(':status', $status, PDO::PARAM_STR);
                $stmt->bindParam(':position_x', $positionX, PDO::PARAM_INT);
                $stmt->bindParam(':position_y', $positionY, PDO::PARAM_INT);
                $stmt->execute();

                $containerId = (int) $db->lastInsertId();
                $insertedIds[] = (string) $containerId;

                if (isset($container['items']) && is_array($container['items'])) {
                    syncContainerItems($db, $authUser, $containerId, $container['items']);
                }
            }

            $db->commit();
            respond(201, ["status" => "success", "ids" => $insertedIds, "message" => "Containers created."]);
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            respond(500, ["status" => "error", "message" => "Failed to create containers.", "debug" => $e->getMessage()]);
        }
    }

    if ($entity === 'container-reorder') {
        if (!authHasFeatureAccess($authUser, 'rooms', 'full', $db)) {
            respond(403, ["status" => "error", "message" => "Access denied."]);
        }
        $roomId = validateId($payload['roomId'] ?? $payload['room_id'] ?? null);
        $containerIds = $payload['containerIds'] ?? null;
        if ($roomId === null || !is_array($containerIds)) {
            respond(400, ["status" => "error", "message" => "Invalid reorder payload."]);
        }

        authAssertRoomScope($db, $authUser, $roomId);

        $updateStmt = $db->prepare(
            "UPDATE containers
             SET position_x = :position_x, position_y = :position_y
             WHERE id = :id AND room_id = :room_id"
        );

        $db->beginTransaction();
        try {
            foreach ($containerIds as $index => $containerIdRaw) {
                $containerId = validateId($containerIdRaw);
                if ($containerId === null) {
                    continue;
                }

                $positionX = $index % 4;
                $positionY = (int) floor($index / 4);
                $updateStmt->bindParam(':position_x', $positionX, PDO::PARAM_INT);
                $updateStmt->bindParam(':position_y', $positionY, PDO::PARAM_INT);
                $updateStmt->bindParam(':id', $containerId, PDO::PARAM_INT);
                $updateStmt->bindParam(':room_id', $roomId, PDO::PARAM_INT);
                $updateStmt->execute();
            }

            $db->commit();
            respond(200, ["status" => "success", "message" => "Container order updated."]);
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            respond(500, ["status" => "error", "message" => "Failed to reorder containers.", "debug" => $e->getMessage()]);
        }
    }

    respond(400, ["status" => "error", "message" => "Unsupported entity for POST."]);
}

if ($method == 'PUT') {
    $authUser = authCurrentUser($db, true);
    if ($entity === 'room') {
        if (!authHasFeatureAccess($authUser, 'rooms', 'full', $db)) {
            respond(403, ["status" => "error", "message" => "Access denied."]);
        }
        $roomId = validateId($payload['id'] ?? null);
        if ($roomId === null || !isset($payload['name'], $payload['type'], $payload['category'])) {
            respond(400, ["status" => "error", "message" => "Incomplete room update payload."]);
        }

        $name = trim((string) $payload['name']);
        $type = normalizeRoomTypeOrFail((string) $payload['type']);
        $category = normalizeRoomCategoryOrFail((string) $payload['category']);
        $roomOwner = isset($payload['roomOwner']) ? (string) $payload['roomOwner'] : (isset($payload['room_owner']) ? (string) $payload['room_owner'] : null);
        $customType = isset($payload['customType']) ? (string) $payload['customType'] : (isset($payload['custom_type']) ? (string) $payload['custom_type'] : null);
        $capacity = isset($payload['capacity']) ? (int) $payload['capacity'] : 0;

        authAssertRoomScope($db, $authUser, $roomId);
        if (!authCanAccessRoomType($authUser, $type, $category)) {
            respond(403, ["status" => "error", "message" => "Room type is outside your scope."]);
        }

        $stmt = $db->prepare(
            "UPDATE rooms
             SET name = :name, type = :type, category = :category, custom_type = :custom_type, capacity = :capacity, room_owner = :room_owner
             WHERE id = :id"
        );
        $stmt->bindParam(':id', $roomId, PDO::PARAM_INT);
        $stmt->bindParam(':name', $name, PDO::PARAM_STR);
        $stmt->bindParam(':type', $type, PDO::PARAM_STR);
        $stmt->bindParam(':category', $category, PDO::PARAM_STR);
        $stmt->bindParam(':custom_type', $customType, PDO::PARAM_STR);
        $stmt->bindParam(':capacity', $capacity, PDO::PARAM_INT);
        $stmt->bindParam(':room_owner', $roomOwner, PDO::PARAM_STR);
        $stmt->execute();

        respond(200, ["status" => "success", "message" => "Room updated."]);
    }

    if ($entity === 'container') {
        if (!authHasFeatureAccess($authUser, 'rooms', 'full', $db)) {
            respond(403, ["status" => "error", "message" => "Access denied."]);
        }
        $containerId = validateId($payload['id'] ?? null);
        $roomId = validateId($payload['roomId'] ?? $payload['room_id'] ?? null);

        if ($containerId === null || $roomId === null || !isset($payload['name'], $payload['type'])) {
            respond(400, ["status" => "error", "message" => "Incomplete container update payload."]);
        }

        authAssertRoomScope($db, $authUser, $roomId);
        authAssertContainerScope($db, $authUser, $containerId, $roomId);

        $name = trim((string) $payload['name']);
        $type = normalizeContainerTypeOrFail((string) $payload['type']);
        $status = isset($payload['status']) ? (string) $payload['status'] : 'good';
        if (!in_array($status, ['good', 'warning', 'error'], true)) {
            $status = 'good';
        }
        $position = $payload['position'] ?? [];
        $positionX = isset($position['x']) ? (int) $position['x'] : 0;
        $positionY = isset($position['y']) ? (int) $position['y'] : 0;

        $db->beginTransaction();
        try {
            $stmt = $db->prepare(
                "UPDATE containers
                 SET name = :name, type = :type, status = :status, position_x = :position_x, position_y = :position_y
                 WHERE id = :id AND room_id = :room_id"
            );
            $stmt->bindParam(':id', $containerId, PDO::PARAM_INT);
            $stmt->bindParam(':room_id', $roomId, PDO::PARAM_INT);
            $stmt->bindParam(':name', $name, PDO::PARAM_STR);
            $stmt->bindParam(':type', $type, PDO::PARAM_STR);
            $stmt->bindParam(':status', $status, PDO::PARAM_STR);
            $stmt->bindParam(':position_x', $positionX, PDO::PARAM_INT);
            $stmt->bindParam(':position_y', $positionY, PDO::PARAM_INT);
            $stmt->execute();

            if (isset($payload['items']) && is_array($payload['items'])) {
                syncContainerItems($db, $authUser, $containerId, $payload['items']);
            }

            $db->commit();
            respond(200, ["status" => "success", "message" => "Container updated."]);
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            respond(500, ["status" => "error", "message" => "Failed to update container.", "debug" => $e->getMessage()]);
        }
    }

    if ($entity === 'room-state') {
        if (!authHasFeatureAccess($authUser, 'rooms', 'full', $db)) {
            respond(403, ["status" => "error", "message" => "Access denied."]);
        }
        $roomId = validateId($payload['id'] ?? null);
        if ($roomId === null) {
            respond(400, ["status" => "error", "message" => "Invalid room id for room-state update."]);
        }

        // Note: scope check intentionally skipped here.
        // room-state is used to persist item changes including cross-room transfers.
        // Feature-level access ('rooms', 'full') is sufficient authorisation.

        $name = isset($payload['name']) ? trim((string) $payload['name']) : null;
        $type = isset($payload['type']) ? (string) $payload['type'] : null;
        $category = isset($payload['category']) ? (string) $payload['category'] : null;
        $customType = isset($payload['customType']) ? (string) $payload['customType'] : (isset($payload['custom_type']) ? (string) $payload['custom_type'] : null);
        $capacity = isset($payload['capacity']) ? (int) $payload['capacity'] : null;
        $containers = isset($payload['containers']) && is_array($payload['containers']) ? $payload['containers'] : [];

        $db->beginTransaction();
        try {
            if ($name !== null && $name !== '') {
                $updateRoomStmt = $db->prepare(
                    "UPDATE rooms
                     SET name = :name, type = :type, category = :category, custom_type = :custom_type, capacity = :capacity
                     WHERE id = :id"
                );
                $safeType = $type !== null ? normalizeRoomTypeOrFail($type) : 'other';
                $safeCategory = $category !== null ? normalizeRoomCategoryOrFail($category) : 'lab';
                $safeCapacity = $capacity ?? 0;
                $updateRoomStmt->bindParam(':id', $roomId, PDO::PARAM_INT);
                $updateRoomStmt->bindParam(':name', $name, PDO::PARAM_STR);
                $updateRoomStmt->bindParam(':type', $safeType, PDO::PARAM_STR);
                $updateRoomStmt->bindParam(':category', $safeCategory, PDO::PARAM_STR);
                $updateRoomStmt->bindParam(':custom_type', $customType, PDO::PARAM_STR);
                $updateRoomStmt->bindParam(':capacity', $safeCapacity, PDO::PARAM_INT);
                $updateRoomStmt->execute();
            }

            $keptContainerIds = [];

            $findContainerStmt = $db->prepare("SELECT id FROM containers WHERE id = :id AND room_id = :room_id LIMIT 1");
            $updateContainerStmt = $db->prepare(
                "UPDATE containers
                 SET name = :name, type = :type, status = :status, image_url = :image_url, position_x = :position_x, position_y = :position_y
                 WHERE id = :id AND room_id = :room_id"
            );
            $insertContainerStmt = $db->prepare(
                "INSERT INTO containers (room_id, name, type, status, image_url, position_x, position_y)
                 VALUES (:room_id, :name, :type, :status, :image_url, :position_x, :position_y)"
            );

            foreach ($containers as $index => $container) {
                if (!is_array($container)) {
                    continue;
                }

                $containerId = validateId($container['id'] ?? null);
                $containerName = trim((string) ($container['name'] ?? ("Container " . ($index + 1))));
                $containerType = normalizeContainerTypeOrFail((string) ($container['type'] ?? 'table'));
                $containerStatus = (string) ($container['status'] ?? 'good');
                if (!in_array($containerStatus, ['good', 'warning', 'error'], true)) {
                    $containerStatus = 'good';
                }
                $position = isset($container['position']) && is_array($container['position']) ? $container['position'] : [];
                $positionX = isset($position['x']) ? (int) $position['x'] : ($index % 4);
                $positionY = isset($position['y']) ? (int) $position['y'] : (int) floor($index / 4);
                $items = isset($container['items']) && is_array($container['items']) ? $container['items'] : [];

                if ($containerId !== null) {
                    $findContainerStmt->bindParam(':id', $containerId, PDO::PARAM_INT);
                    $findContainerStmt->bindParam(':room_id', $roomId, PDO::PARAM_INT);
                    $findContainerStmt->execute();
                    $exists = $findContainerStmt->fetch(PDO::FETCH_ASSOC);
                    if ($exists) {
                        $updateContainerStmt->bindParam(':id', $containerId, PDO::PARAM_INT);
                        $updateContainerStmt->bindParam(':room_id', $roomId, PDO::PARAM_INT);
                        $updateContainerStmt->bindParam(':name', $containerName, PDO::PARAM_STR);
                        $updateContainerStmt->bindParam(':type', $containerType, PDO::PARAM_STR);
                        $updateContainerStmt->bindParam(':status', $containerStatus, PDO::PARAM_STR);
                        $updateContainerStmt->bindParam(':image_url', $container['imageUrl'], PDO::PARAM_STR);
                        $updateContainerStmt->bindParam(':position_x', $positionX, PDO::PARAM_INT);
                        $updateContainerStmt->bindParam(':position_y', $positionY, PDO::PARAM_INT);
                        $updateContainerStmt->execute();
                        syncContainerItems($db, $authUser, $containerId, $items);
                        $keptContainerIds[] = $containerId;
                        continue;
                    }
                }

                $insertContainerStmt->bindParam(':room_id', $roomId, PDO::PARAM_INT);
                $insertContainerStmt->bindParam(':name', $containerName, PDO::PARAM_STR);
                $insertContainerStmt->bindParam(':type', $containerType, PDO::PARAM_STR);
                $insertContainerStmt->bindParam(':status', $containerStatus, PDO::PARAM_STR);
                $insertContainerStmt->bindParam(':image_url', $container['imageUrl'], PDO::PARAM_STR);
                $insertContainerStmt->bindParam(':position_x', $positionX, PDO::PARAM_INT);
                $insertContainerStmt->bindParam(':position_y', $positionY, PDO::PARAM_INT);
                $insertContainerStmt->execute();

                $newContainerId = (int) $db->lastInsertId();
                syncContainerItems($db, $authUser, $newContainerId, $items);
                $keptContainerIds[] = $newContainerId;
            }

            if (count($keptContainerIds) > 0) {
                $placeholders = implode(',', array_fill(0, count($keptContainerIds), '?'));
                $deleteRemovedStmt = $db->prepare("DELETE FROM containers WHERE room_id = ? AND id NOT IN ($placeholders)");
                $params = array_merge([$roomId], $keptContainerIds);
                $deleteRemovedStmt->execute($params);
            } else {
                $deleteAllStmt = $db->prepare("DELETE FROM containers WHERE room_id = :room_id");
                $deleteAllStmt->bindParam(':room_id', $roomId, PDO::PARAM_INT);
                $deleteAllStmt->execute();
            }

            $db->commit();
            respond(200, ["status" => "success", "message" => "Room state synchronized."]);
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            respond(500, ["status" => "error", "message" => "Failed to synchronize room state.", "debug" => $e->getMessage()]);
        }
    }

    respond(400, ["status" => "error", "message" => "Unsupported entity for PUT."]);
}

if ($method == 'DELETE') {
    $authUser = authCurrentUser($db, true);
    if ($entity === 'room') {
        if (!authHasFeatureAccess($authUser, 'rooms', 'full', $db)) {
            respond(403, ["status" => "error", "message" => "Access denied."]);
        }
        $roomId = validateId($payload['id'] ?? $_GET['id'] ?? null);
        if ($roomId === null) {
            respond(400, ["status" => "error", "message" => "Invalid room id."]);
        }

        authAssertRoomScope($db, $authUser, $roomId);

        $stmt = $db->prepare("DELETE FROM rooms WHERE id = :id");
        $stmt->bindParam(':id', $roomId, PDO::PARAM_INT);
        $stmt->execute();

        respond(200, ["status" => "success", "message" => "Room deleted."]);
    }

    if ($entity === 'container') {
        if (!authHasFeatureAccess($authUser, 'rooms', 'full', $db)) {
            respond(403, ["status" => "error", "message" => "Access denied."]);
        }
        $containerId = validateId($payload['id'] ?? $_GET['id'] ?? null);
        $roomId = validateId($payload['roomId'] ?? $payload['room_id'] ?? $_GET['room_id'] ?? null);
        if ($containerId === null || $roomId === null) {
            respond(400, ["status" => "error", "message" => "Invalid container id or room id."]);
        }

        authAssertRoomScope($db, $authUser, $roomId);
        authAssertContainerScope($db, $authUser, $containerId, $roomId);

        $stmt = $db->prepare("DELETE FROM containers WHERE id = :id AND room_id = :room_id");
        $stmt->bindParam(':id', $containerId, PDO::PARAM_INT);
        $stmt->bindParam(':room_id', $roomId, PDO::PARAM_INT);
        $stmt->execute();

        respond(200, ["status" => "success", "message" => "Container deleted."]);
    }
}

respond(405, ["status" => "error", "message" => "Method not allowed."]);
?>
