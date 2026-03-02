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

function respondRequest(int $code, array $data): void
{
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function toValidId($value): ?int
{
    if (!is_numeric($value)) {
        return null;
    }
    $id = (int) $value;
    return $id > 0 ? $id : null;
}

function findRequesterId(PDO $db, ?int $requesterId, ?string $requesterName): ?int
{
    if ($requesterId !== null) {
        $existsStmt = $db->prepare("SELECT id FROM users WHERE id = :id LIMIT 1");
        $existsStmt->bindParam(':id', $requesterId, PDO::PARAM_INT);
        $existsStmt->execute();
        $row = $existsStmt->fetch(PDO::FETCH_ASSOC);
        if ($row && isset($row['id'])) {
            return (int) $row['id'];
        }
    }

    if ($requesterName !== null && trim($requesterName) !== '') {
        $needle = trim($requesterName);
        $lookupStmt = $db->prepare(
            "SELECT id
             FROM users
             WHERE username = :needle OR email = :needle OR name = :needle
             ORDER BY id ASC
             LIMIT 1"
        );
        $lookupStmt->bindParam(':needle', $needle, PDO::PARAM_STR);
        $lookupStmt->execute();
        $row = $lookupStmt->fetch(PDO::FETCH_ASSOC);
        if ($row && isset($row['id'])) {
            return (int) $row['id'];
        }
    }

    return null;
}

function fetchServiceRequests(PDO $db): array
{
    $stmt = $db->prepare(
        "SELECT
            sr.id,
            sr.item_id,
            sr.requester_id,
            sr.description,
            sr.status,
            sr.request_date,
            sr.resolution_date,
            sr.rejection_reason,
            i.name AS component_name,
            i.sku AS component_sku,
            i.category AS component_category,
            c.id AS station_id,
            c.name AS station_name,
            r.id AS room_id,
            r.name AS room_name,
            u.name AS requester_name
        FROM service_requests sr
        LEFT JOIN items i ON sr.item_id = i.id
        LEFT JOIN containers c ON i.container_id = c.id
        LEFT JOIN rooms r ON c.room_id = r.id
        LEFT JOIN users u ON sr.requester_id = u.id
        ORDER BY sr.request_date DESC, sr.id DESC"
    );
    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    return array_map(function ($row) {
        $requesterNameRaw = isset($row['requester_name']) ? trim((string) $row['requester_name']) : '';
        $requesterName = $requesterNameRaw !== ''
            ? $requesterNameRaw
            : (($row['requester_id'] ?? null) !== null ? ('User #' . (string) $row['requester_id']) : null);

        return [
            'id' => (string) $row['id'],
            'componentId' => $row['item_id'] !== null ? (string) $row['item_id'] : '',
            'componentName' => $row['component_name'] ?? 'Unknown Component',
            'stationId' => $row['station_id'] !== null ? (string) $row['station_id'] : '',
            'stationName' => $row['station_name'] ?? 'Unknown Station',
            'roomId' => $row['room_id'] !== null ? (string) $row['room_id'] : '',
            'roomName' => $row['room_name'] ?? null,
            'description' => $row['description'] ?? '',
            'requesterName' => $requesterName,
            'componentSku' => $row['component_sku'] ?? null,
            'componentCategory' => $row['component_category'] ?? null,
            'status' => $row['status'] ?? 'pending',
            'requestDate' => $row['request_date'],
            'resolutionDate' => $row['resolution_date'],
            'rejectionReason' => $row['rejection_reason']
        ];
    }, $rows);
}

function appendItemLog(PDO $db, int $itemId, string $action, array $details): void
{
    $payload = json_encode($details, JSON_UNESCAPED_UNICODE);
    if ($payload === false) {
        $payload = json_encode([]);
    }

    $stmt = $db->prepare(
        "INSERT INTO item_logs (item_id, action, date, details)
         VALUES (:item_id, :action, :date, :details)"
    );
    $now = date('Y-m-d H:i:s');
    $stmt->bindParam(':item_id', $itemId, PDO::PARAM_INT);
    $stmt->bindParam(':action', $action, PDO::PARAM_STR);
    $stmt->bindParam(':date', $now, PDO::PARAM_STR);
    $stmt->bindParam(':details', $payload, PDO::PARAM_STR);
    $stmt->execute();
}

if ($method === 'GET') {
    $requests = fetchServiceRequests($db);
    respondRequest(200, ['status' => 'success', 'requests' => $requests]);
}

if ($method === 'POST') {
    $itemId = toValidId($payload['componentId'] ?? $payload['item_id'] ?? null);
    $requesterId = toValidId($payload['requesterId'] ?? $payload['requester_id'] ?? null);
    $requesterName = isset($payload['requesterName']) ? trim((string) $payload['requesterName']) : null;
    $resolvedRequesterId = findRequesterId($db, $requesterId, $requesterName);
    $description = isset($payload['description']) ? trim((string) $payload['description']) : '';

    if ($itemId === null || $description === '') {
        respondRequest(400, ['status' => 'error', 'message' => 'componentId and description are required.']);
    }

    $itemExistsStmt = $db->prepare("SELECT id FROM items WHERE id = :id LIMIT 1");
    $itemExistsStmt->bindParam(':id', $itemId, PDO::PARAM_INT);
    $itemExistsStmt->execute();
    if (!$itemExistsStmt->fetch(PDO::FETCH_ASSOC)) {
        respondRequest(400, ['status' => 'error', 'message' => 'Invalid componentId. Item not found.']);
    }

    try {
        $db->beginTransaction();

        $stmt = $db->prepare(
            "INSERT INTO service_requests (item_id, requester_id, description, status)
             VALUES (:item_id, :requester_id, :description, 'pending')"
        );
        $stmt->bindParam(':item_id', $itemId, PDO::PARAM_INT);
        if ($resolvedRequesterId === null) {
            $stmt->bindValue(':requester_id', null, PDO::PARAM_NULL);
        } else {
            $stmt->bindValue(':requester_id', $resolvedRequesterId, PDO::PARAM_INT);
        }
        $stmt->bindParam(':description', $description, PDO::PARAM_STR);
        $stmt->execute();

        appendItemLog($db, $itemId, 'MAINTENANCE_REQUESTED', [
            'description' => $description,
            'requesterId' => $resolvedRequesterId
        ]);

        // Reporting immediately marks the item as under maintenance.
        $markMaintenanceStmt = $db->prepare(
            "UPDATE `items`
             SET `condition` = 'service', `status` = 'maintenance'
             WHERE `id` = :item_id"
        );
        $markMaintenanceStmt->bindParam(':item_id', $itemId, PDO::PARAM_INT);
        $markMaintenanceStmt->execute();

        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        respondRequest(500, ['status' => 'error', 'message' => 'Failed to create service request.', 'debug' => $e->getMessage()]);
    }

    respondRequest(201, [
        'status' => 'success',
        'message' => 'Service request created.',
        'id' => (string) $db->lastInsertId()
    ]);
}

if ($method === 'PUT') {
    $id = toValidId($payload['id'] ?? null);
    if ($id === null) {
        respondRequest(400, ['status' => 'error', 'message' => 'Invalid service request id.']);
    }

    $status = isset($payload['status']) ? (string) $payload['status'] : null;
    $rejectionReason = array_key_exists('rejectionReason', $payload)
        ? (string) $payload['rejectionReason']
        : (array_key_exists('rejection_reason', $payload) ? (string) $payload['rejection_reason'] : null);
    $resolutionOutcome = isset($payload['resolutionOutcome']) ? (string) $payload['resolutionOutcome'] : null;
    $note = array_key_exists('note', $payload) ? trim((string) $payload['note']) : null;

    $fields = [];
    $params = [':id' => $id];

    if ($status !== null) {
        $allowedStatuses = ['pending', 'accepted', 'denied', 'completed'];
        if (!in_array($status, $allowedStatuses, true)) {
            respondRequest(400, ['status' => 'error', 'message' => 'Invalid status value.']);
        }
        $fields[] = "status = :status";
        $params[':status'] = $status;

        if ($status === 'completed' || $status === 'denied') {
            $fields[] = "resolution_date = :resolution_date";
            $params[':resolution_date'] = date('Y-m-d H:i:s');
        } elseif ($status === 'pending' || $status === 'accepted') {
            $fields[] = "resolution_date = NULL";
        }
    }

    if ($rejectionReason !== null) {
        $fields[] = "rejection_reason = :rejection_reason";
        $params[':rejection_reason'] = trim($rejectionReason) === '' ? null : $rejectionReason;
    }

    if ($resolutionOutcome !== null) {
        $allowedOutcomes = ['repaired', 'broken'];
        if (!in_array($resolutionOutcome, $allowedOutcomes, true)) {
            respondRequest(400, ['status' => 'error', 'message' => 'Invalid resolutionOutcome value.']);
        }
    }

    if (count($fields) === 0) {
        respondRequest(400, ['status' => 'error', 'message' => 'No updatable fields provided.']);
    }

    $requestStmt = $db->prepare("SELECT id, item_id FROM service_requests WHERE id = :id LIMIT 1");
    $requestStmt->bindParam(':id', $id, PDO::PARAM_INT);
    $requestStmt->execute();
    $requestRow = $requestStmt->fetch(PDO::FETCH_ASSOC);
    if (!$requestRow || !isset($requestRow['item_id'])) {
        respondRequest(404, ['status' => 'error', 'message' => 'Service request not found.']);
    }
    $itemId = (int) $requestRow['item_id'];

    try {
        $db->beginTransaction();

        $sql = "UPDATE service_requests SET " . implode(', ', $fields) . " WHERE id = :id";
        $stmt = $db->prepare($sql);
        foreach ($params as $key => $value) {
            if ($value === null) {
                $stmt->bindValue($key, null, PDO::PARAM_NULL);
                continue;
            }
            $stmt->bindValue($key, $value);
        }
        $stmt->execute();

        if ($status === 'accepted') {
            $updateItemStmt = $db->prepare(
                "UPDATE `items`
                 SET `condition` = 'service', `status` = 'maintenance'
                 WHERE `id` = :item_id"
            );
            $updateItemStmt->bindParam(':item_id', $itemId, PDO::PARAM_INT);
            $updateItemStmt->execute();

            appendItemLog($db, $itemId, 'MAINTENANCE_ACCEPTED', [
                'serviceRequestId' => (string) $id,
                'note' => $note !== '' ? $note : null
            ]);
        }

        if ($status === 'denied') {
            $activeStmt = $db->prepare(
                "SELECT COUNT(*)
                 FROM service_requests
                 WHERE item_id = :item_id
                   AND id <> :request_id
                   AND status IN ('pending', 'accepted')"
            );
            $activeStmt->bindParam(':item_id', $itemId, PDO::PARAM_INT);
            $activeStmt->bindParam(':request_id', $id, PDO::PARAM_INT);
            $activeStmt->execute();
            $activeCount = (int) $activeStmt->fetchColumn();

            if ($activeCount === 0) {
                $itemStateStmt = $db->prepare("SELECT `condition` FROM `items` WHERE `id` = :item_id LIMIT 1");
                $itemStateStmt->bindParam(':item_id', $itemId, PDO::PARAM_INT);
                $itemStateStmt->execute();
                $itemState = $itemStateStmt->fetch(PDO::FETCH_ASSOC);
                $nextCondition = ($itemState && ($itemState['condition'] ?? '') === 'service') ? 'good' : ($itemState['condition'] ?? 'good');

                $revertStmt = $db->prepare(
                    "UPDATE `items`
                     SET `condition` = :condition, `status` = 'available'
                     WHERE `id` = :item_id"
                );
                $revertStmt->bindParam(':condition', $nextCondition, PDO::PARAM_STR);
                $revertStmt->bindParam(':item_id', $itemId, PDO::PARAM_INT);
                $revertStmt->execute();
            }

            appendItemLog($db, $itemId, 'MAINTENANCE_DENIED', [
                'serviceRequestId' => (string) $id,
                'reason' => $rejectionReason,
                'note' => $note !== '' ? $note : null
            ]);
        }

        if ($status === 'completed') {
            $effectiveOutcome = $resolutionOutcome;
            if ($effectiveOutcome === null && $rejectionReason !== null) {
                $normalizedReason = strtolower(trim($rejectionReason));
                if (strpos($normalizedReason, 'repaired') !== false) {
                    $effectiveOutcome = 'repaired';
                } elseif (strpos($normalizedReason, 'broken') !== false || strpos($normalizedReason, 'unrepairable') !== false) {
                    $effectiveOutcome = 'broken';
                }
            }

            if ($effectiveOutcome !== null) {
                $nextCondition = $effectiveOutcome === 'broken' ? 'broken' : 'good';
                $nextStatus = $effectiveOutcome === 'broken' ? 'missing' : 'available';

                $updateItemStmt = $db->prepare(
                    "UPDATE `items`
                     SET `condition` = :condition, `status` = :status
                     WHERE `id` = :item_id"
                );
                $updateItemStmt->bindParam(':condition', $nextCondition, PDO::PARAM_STR);
                $updateItemStmt->bindParam(':status', $nextStatus, PDO::PARAM_STR);
                $updateItemStmt->bindParam(':item_id', $itemId, PDO::PARAM_INT);
                $updateItemStmt->execute();

                appendItemLog($db, $itemId, 'MAINTENANCE_COMPLETED', [
                    'serviceRequestId' => (string) $id,
                    'outcome' => $effectiveOutcome,
                    'note' => $note !== '' ? $note : null
                ]);
            }
        }

        $db->commit();
        respondRequest(200, ['status' => 'success', 'message' => 'Service request updated.']);
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        respondRequest(500, ['status' => 'error', 'message' => 'Failed to update service request.', 'debug' => $e->getMessage()]);
    }
}

respondRequest(405, ['status' => 'error', 'message' => 'Method not allowed.']);
