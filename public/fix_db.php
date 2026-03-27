<?php
include_once 'api/config/database.php';

$database = new Database();
$db = $database->getConnection();

if (!$db) {
    die('Database connection failed.');
}

try {
    // Check if deleted_at column exists in items table
    $stmt = $db->query("SHOW COLUMNS FROM items LIKE 'deleted_at'");
    $exists = $stmt->fetch();

    if (!$exists) {
        $db->exec("ALTER TABLE items ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at");
        echo "Column 'deleted_at' successfully added to 'items' table.<br>";
    } else {
        echo "Column 'deleted_at' already exists in 'items' table.<br>";
    }

    // Also check other tables if they need deleted_at (e.g., rooms, containers)
    $stmt = $db->query("SHOW COLUMNS FROM rooms LIKE 'deleted_at'");
    if (!$stmt->fetch()) {
        $db->exec("ALTER TABLE rooms ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL");
        echo "Column 'deleted_at' successfully added to 'rooms' table.<br>";
    }

    $stmt = $db->query("SHOW COLUMNS FROM containers LIKE 'deleted_at'");
    if (!$stmt->fetch()) {
        $db->exec("ALTER TABLE containers ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL");
        echo "Column 'deleted_at' successfully added to 'containers' table.<br>";
    }

    echo "Database schema check complete.";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
?>
