<?php
include_once __DIR__ . '/public/api/config/database.php';

$database = new Database();
$db = $database->getConnection();

if (!$db) {
    echo "DB connection failed\n";
    exit(1);
}

try {
    $db->exec("ALTER TABLE users MODIFY role ENUM('admin','kepala_lab','guru','kepala_sekolah','sarpras','admin_nl') NOT NULL;");
    echo "Table users altered successfully (role added admin_nl)\n";
} catch (Exception $e) {
    echo "Warn: Alter table error: " . $e->getMessage() . "\n";
}

try {
    $stmt = $db->prepare("UPDATE users SET role = 'admin_nl' WHERE username IN ('admin_nonlab1', 'admin_nonlab2')");
    $stmt->execute();
    echo "Updated users admin_nonlab1 and admin_nonlab2 to role admin_nl\n";
} catch (Exception $e) {
    echo "Error updating users: " . $e->getMessage() . "\n";
}

// Update access matrix defaults manually for admin_nl
try {
    // Give admin_nl the same permissions as kepala_lab
    // By re-running the seed process, but we need to delete matrix to force refresh or just add it.
    // However, auth.php will handle defaults if we just update the matrix but auth.php must be updated first.
    // For now we just add the role in auth.php
} catch (Exception $e) {
    echo "Error updating matrix: " . $e->getMessage() . "\n";
}

echo "Done updating role.\n";
