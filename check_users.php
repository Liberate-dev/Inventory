<?php
include_once 'public/api/config/database.php';

$database = new Database();
$db = $database->getConnection();

if (!$db) {
    die("Database connection failed.\n");
}

try {
    $query = "SELECT id, username, password, role FROM users";
    $stmt = $db->prepare($query);
    $stmt->execute();
    
    echo "Users in database:\n";
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        echo "ID: " . $row['id'] . " | Username: " . $row['username'] . " | Role: " . $row['role'] . " | Hash: " . $row['password'] . "\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
