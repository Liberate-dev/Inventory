<?php
require_once dirname(__DIR__) . '/config/cors.php';
require_once dirname(__DIR__) . '/config/database.php';
require_once dirname(__DIR__) . '/config/auth.php';
require_once __DIR__ . '/item_log_helpers.php';

header('Content-Type: application/json');

$database = new Database();
$db = $database->getConnection();

if (!$db) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Database connection failed.']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$user = authCurrentUser($db, true);

if ($method === 'GET') {
    try {
        $stmt = $db->prepare('
            SELECT 
                i.*, 
                c.name as container_name,
                r.name as room_name,
                r.id as room_id,
                c.id as container_id
            FROM items i
            LEFT JOIN containers c ON i.container_id = c.id
            LEFT JOIN rooms r ON c.room_id = r.id
            ORDER BY i.created_at DESC
        ');
        
        $stmt->execute();
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Fetch logs for these items
        foreach ($items as &$item) {
            $logStmt = $db->prepare('SELECT id, date, action, details FROM item_logs WHERE item_id = ? ORDER BY date DESC');
            $logStmt->execute([$item['id']]);
            $item['logs'] = $logStmt->fetchAll(PDO::FETCH_ASSOC);
            // process details JSON
            foreach ($item['logs'] as &$log) {
                $log['details'] = json_decode($log['details'], true) ?: $log['details'];
            }
        }

        echo json_encode([
            'status' => 'success',
            'items' => $items
        ]);
        exit;

    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        exit;
    }
}

if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $action = $input['action'] ?? '';
    $itemId = $input['item_id'] ?? '';

    if (!$itemId) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Missing item_id']);
        exit;
    }

    try {
        $db->beginTransaction();
        $itemLookupStmt = $db->prepare('SELECT id, sku, name, `condition`, deleted_at FROM items WHERE id = ? LIMIT 1');
        $itemLookupStmt->execute([$itemId]);
        $item = $itemLookupStmt->fetch(PDO::FETCH_ASSOC);

        if (!$item) {
            throw new Exception('Barang tidak ditemukan.');
        }

        $resolvedItemId = (int) $item['id'];
        $resolvedUserId = isset($user['id']) ? (int) $user['id'] : null;

        if ($action === 'restore') {
            $stmt = $db->prepare('UPDATE items SET deleted_at = NULL WHERE id = ?');
            $stmt->execute([$resolvedItemId]);

            insertItemLog($db, $resolvedItemId, 'RESTORE', [
                'restoredBy' => $user['name'],
                'sku' => $item['sku'],
                'itemName' => $item['name']
            ], $resolvedUserId);

            $message = 'Barang berhasil dikembalikan.';
        } elseif ($action === 'soft_delete') {
            $stmt = $db->prepare('UPDATE items SET deleted_at = NOW() WHERE id = ?');
            $stmt->execute([$resolvedItemId]);

            insertItemLog($db, $resolvedItemId, 'DELETE', [
                'deletedBy' => $user['name'],
                'softDelete' => true,
                'sku' => $item['sku'],
                'itemName' => $item['name'],
                'conditionAtDeletion' => $item['condition']
            ], $resolvedUserId);

            $message = 'Barang dinonaktifkan (soft delete).';
        } elseif ($action === 'hard_delete') {
            // Check if admin
            if ($user['role'] !== 'admin' && $user['role'] !== 'kepala_lab' && $user['role'] !== 'sarpras') {
                http_response_code(403);
                echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
                exit;
            }

            // Remove related logs first
            $logStmt = $db->prepare('DELETE FROM item_logs WHERE item_id = ?');
            $logStmt->execute([$resolvedItemId]);

            // Remove item
            $stmt = $db->prepare('DELETE FROM items WHERE id = ?');
            $stmt->execute([$resolvedItemId]);

            $message = 'Barang dihapus permanen.';
        } else {
            throw new Exception('Unknown action');
        }

        $db->commit();
        echo json_encode(['status' => 'success', 'message' => $message]);
    } catch (Exception $e) {
        $db->rollBack();
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
    exit;
}
