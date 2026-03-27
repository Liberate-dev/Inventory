<?php
include_once __DIR__ . '/public/api/config/database.php';

$database = new Database();
$db = $database->getConnection();

if (!$db) {
    echo "DB connection failed\n";
    exit(1);
}

try {
    $db->exec("ALTER TABLE users MODIFY lab_scope ENUM('computer','biology','physics','all','non-lab') DEFAULT NULL;");
    echo "Table altered successfully\n";
} catch (Exception $e) {
    echo "Warn: Alter table error: " . $e->getMessage() . "\n";
}

$users = [
    [
        'username' => 'admin_nonlab1',
        'password' => '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // 'password'
        'email' => 'admin_nonlab1@inventory.local',
        'name' => 'Admin Non-Lab 1',
        'role' => 'kepala_lab',
        'lab_scope' => 'non-lab'
    ],
    [
        'username' => 'admin_nonlab2',
        'password' => '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // 'password'
        'email' => 'admin_nonlab2@inventory.local',
        'name' => 'Admin Non-Lab 2',
        'role' => 'kepala_lab',
        'lab_scope' => 'non-lab'
    ]
];

$stmt = $db->prepare("INSERT INTO users (username, password, email, name, role, lab_scope) VALUES (:username, :password, :email, :name, :role, :lab_scope)");

foreach ($users as $u) {
    try {
        $stmt->execute($u);
        echo "Inserted " . $u['username'] . "\n";
    } catch (Exception $e) {
        if ($e->getCode() == '23000') {
            echo "Skipped " . $u['username'] . " (already exists)\n";
        } else {
            echo "Error inserting " . $u['username'] . ": " . $e->getMessage() . "\n";
        }
    }
}
echo "Done\n";
