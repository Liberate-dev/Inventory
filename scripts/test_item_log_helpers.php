<?php

declare(strict_types=1);

require_once __DIR__ . '/../public/api/inventory/item_log_helpers.php';

$db = new PDO('sqlite::memory:');
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->exec(
    'CREATE TABLE item_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL,
        user_id INTEGER NULL,
        action TEXT NOT NULL,
        date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        details TEXT NULL
    )'
);

insertItemLog($db, 17, 'DELETE', ['conditionAtDeletion' => 'broken'], 9);

$row = $db->query('SELECT id, item_id, user_id, action, details FROM item_logs LIMIT 1')->fetch(PDO::FETCH_ASSOC);

if (!$row) {
    fwrite(STDERR, "No log row inserted.\n");
    exit(1);
}

if ((int) $row['id'] !== 1) {
    fwrite(STDERR, "Expected autoincrement id=1, got {$row['id']}.\n");
    exit(1);
}

if ((int) $row['item_id'] !== 17 || (int) $row['user_id'] !== 9 || $row['action'] !== 'DELETE') {
    fwrite(STDERR, "Unexpected log metadata.\n");
    exit(1);
}

$details = json_decode((string) $row['details'], true);
if (!is_array($details) || ($details['conditionAtDeletion'] ?? null) !== 'broken') {
    fwrite(STDERR, "Unexpected log details payload.\n");
    exit(1);
}

fwrite(STDOUT, "item_log_helpers: ok\n");
