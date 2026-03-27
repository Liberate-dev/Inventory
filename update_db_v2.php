<?php
include_once __DIR__ . '/public/api/config/database.php';

$database = new Database();
$db = $database->getConnection();

if (!$db) {
    echo "DB connection failed\n";
    exit(1);
}

$queries = [
    "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_owner VARCHAR(255) NULL AFTER capacity;",
    "ALTER TABLE items ADD COLUMN IF NOT EXISTS source VARCHAR(255) NULL AFTER specs;"
];

foreach ($queries as $query) {
    try {
        $db->exec($query);
        echo "Success: $query\n";
    } catch (Exception $e) {
        echo "Error: $query - " . $e->getMessage() . "\n";
    }
}

echo "Database update completed.\n";
?>
