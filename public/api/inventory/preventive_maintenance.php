<?php
/**
 * Preventive Maintenance schedules persistence.
 * Uses item_logs for PREVENTIVE_MAINTENANCE_SCHEDULED / COMPLETED / CANCELLED.
 * Follows exact pattern of other inventory APIs (rooms.php, requests.php).
 */

include_once '../config/cors.php';
include_once '../config/database.php';
include_once '../config/auth.php';
require_once __DIR__ . '/item_log_helpers.php';

header('Content-Type: application/json');

$database = new Database();
$db = $database->getConnection();

if (!$db) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Database connection failed.']);
    exit;
}

$authUser = authRequireFeature($db, 'preventive_maintenance', 'full');

$method = $_SERVER['REQUEST_METHOD'];
$rawInput = file_get_contents("php://input");
$payload = json_decode($rawInput, true);
if (!is_array($payload)) {
    $payload = [];
}

function respond(int $code, array $data): void
{
    http_response_code($code);
    echo json_encode($data);
    exit;
}

if ($method !== 'POST') {
    respond(405, ['status' => 'error', 'message' => 'Method not allowed']);
}

$action = $payload['action'] ?? '';
$itemId = isset($payload['itemId']) ? (int)$payload['itemId'] : 0;

if (!$itemId) {
    respond(400, ['status' => 'error', 'message' => 'itemId is required']);
}

// Verify item exists
$checkStmt = $db->prepare('SELECT id FROM items WHERE id = ? AND deleted_at IS NULL');
$checkStmt->execute([$itemId]);
if (!$checkStmt->fetch()) {
    respond(404, ['status' => 'error', 'message' => 'Item not found']);
}

// Guard: allow planning the *next* cycle, but prevent creating a new schedule
// that is on or before the date of an existing open (unresolved) schedule for the same item.
// This supports "cari tanggal barengan" for future cycles while keeping one open work order per item at a time.
if ($action === 'schedule') {
    $activeCheck = $db->prepare("
        SELECT il1.details
        FROM item_logs il1
        LEFT JOIN item_logs il2 
            ON il2.item_id = il1.item_id 
           AND il2.action IN ('PREVENTIVE_MAINTENANCE_COMPLETED','PREVENTIVE_MAINTENANCE_CANCELLED')
           AND il2.date > il1.date
        WHERE il1.item_id = ? 
          AND il1.action = 'PREVENTIVE_MAINTENANCE_SCHEDULED'
          AND il2.id IS NULL
        ORDER BY il1.date DESC
        LIMIT 1
    ");
    $activeCheck->execute([$itemId]);
    $existing = $activeCheck->fetch(PDO::FETCH_ASSOC);
    if ($existing && !empty($existing['details'])) {
        $det = json_decode($existing['details'], true);
        $existingDate = is_array($det) && !empty($det['recommendedDate']) ? $det['recommendedDate'] : null;
        if ($existingDate && $payload['recommendedDate'] <= $existingDate) {
            respond(409, [
                'status' => 'error', 
                'message' => "Item already has an open preventive schedule due on {$existingDate}. You can only create a new schedule for a date *after* that, or complete/cancel the current one first."
            ]);
        }
    }
}

$userId = $authUser['id'] ?? null;

switch ($action) {
    case 'schedule':
        $recommendedDate = $payload['recommendedDate'] ?? '';
        $reason = trim($payload['reason'] ?? '');
        $source = $payload['source'] ?? 'manual';

        if (!$recommendedDate || !$reason) {
            respond(400, ['status' => 'error', 'message' => 'recommendedDate and reason are required']);
        }

        insertItemLog($db, $itemId, 'PREVENTIVE_MAINTENANCE_SCHEDULED', [
            'recommendedDate' => $recommendedDate,
            'reason' => $reason,
            'source' => $source,
            'scheduledBy' => $userId,
        ], $userId);

        respond(200, ['status' => 'success', 'message' => 'Preventive maintenance scheduled']);
        break;

    case 'complete':
        // Compute wasOverdue for audit accuracy (recommendedDate < now and no prior terminal)
        $overdueCheck = $db->prepare("
            SELECT il1.details
            FROM item_logs il1
            LEFT JOIN item_logs il2 
                ON il2.item_id = il1.item_id 
               AND il2.action IN ('PREVENTIVE_MAINTENANCE_COMPLETED','PREVENTIVE_MAINTENANCE_CANCELLED')
               AND il2.date > il1.date
            WHERE il1.item_id = ? 
              AND il1.action = 'PREVENTIVE_MAINTENANCE_SCHEDULED'
              AND il2.id IS NULL
            ORDER BY il1.date DESC
            LIMIT 1
        ");
        $overdueCheck->execute([$itemId]);
        $latestSched = $overdueCheck->fetch(PDO::FETCH_ASSOC);
        $wasOverdue = false;
        if ($latestSched && !empty($latestSched['details'])) {
            $det = json_decode($latestSched['details'], true);
            if (is_array($det) && !empty($det['recommendedDate'])) {
                $wasOverdue = $det['recommendedDate'] < date('Y-m-d');
            }
        }

        insertItemLog($db, $itemId, 'PREVENTIVE_MAINTENANCE_COMPLETED', [
            'completedBy' => $userId,
            'completedAt' => date('c'),
            'wasOverdue' => $wasOverdue,
        ], $userId);

        // Update item condition/status for accuracy (preventive done → back to good)
        $upd = $db->prepare("
            UPDATE items 
            SET `condition` = 'good', status = 'good' 
            WHERE id = ? 
              AND deleted_at IS NULL 
              AND (`condition` = 'service' OR status = 'maintenance')
        ");
        $upd->execute([$itemId]);

        respond(200, ['status' => 'success', 'message' => 'Preventive maintenance completed']);
        break;

    case 'cancel':
        $cancelReason = trim($payload['cancelReason'] ?? '');
        if (!$cancelReason) {
            respond(400, ['status' => 'error', 'message' => 'cancelReason is required']);
        }

        insertItemLog($db, $itemId, 'PREVENTIVE_MAINTENANCE_CANCELLED', [
            'cancelReason' => $cancelReason,
            'cancelledBy' => $userId,
            'cancelledAt' => date('c'),
        ], $userId);

        respond(200, ['status' => 'success', 'message' => 'Preventive maintenance cancelled']);
        break;

    default:
        respond(400, ['status' => 'error', 'message' => 'Unknown action. Use schedule, complete or cancel.']);
}
