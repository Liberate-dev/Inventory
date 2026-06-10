<?php
require_once dirname(__DIR__) . '/config/cors.php';
require_once dirname(__DIR__) . '/config/database.php';
require_once dirname(__DIR__) . '/config/auth.php';
require_once __DIR__ . '/schema_compat.php';

header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Connection: keep-alive');
header('X-Accel-Buffering: no');

$database = new Database();
$db = $database->getConnection();

if (!$db) {
    echo "event: error\ndata: {\"message\":\"Database connection failed\"}\n\n";
    flush();
    exit;
}

ensureInventoryEventsSchema($db);

$user = authCurrentUser($db, true);
if (!$user) {
    echo "event: error\ndata: {\"message\":\"Unauthorized\"}\n\n";
    flush();
    exit;
}

// Client can send last_id to resume
$lastId = isset($_GET['last_id']) ? max(0, (int)$_GET['last_id']) : 0;

set_time_limit(0);
ignore_user_abort(true);

while (true) {
    if (connection_aborted()) {
        break;
    }

    $stmt = $db->prepare("SELECT id, event_type, payload, created_at FROM inventory_events WHERE id > ? ORDER BY id ASC LIMIT 20");
    $stmt->execute([$lastId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if ($rows) {
        foreach ($rows as $row) {
            $lastId = (int)$row['id'];
            $eventData = [
                'id' => $lastId,
                'type' => $row['event_type'],
                'payload' => $row['payload'] ? json_decode($row['payload'], true) : null,
                'created_at' => $row['created_at'],
            ];
            echo "id: $lastId\n";
            echo "event: inventory_update\n";
            echo "data: " . json_encode($eventData) . "\n\n";
            flush();
        }
    }

    // Short sleep on server side. Clients receive push when data is ready.
    // This is not client polling.
    usleep(800000); // 0.8 seconds
}

