<?php
include_once __DIR__ . '/public/api/config/database.php';

$database = new Database();
$db = $database->getConnection();

if (!$db) {
    echo "DB connection failed\n";
    exit(1);
}

try {
    $db->exec("ALTER TABLE users MODIFY lab_scope ENUM('computer','biology','physics','chemistry','all','non-lab') DEFAULT NULL;");
    echo "Table users altered successfully (chemistry + non-lab)\n";
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
    ],
    [
        'username' => 'kepala_fisika',
        'password' => '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // 'password'
        'email' => 'fisika@inventory.local',
        'name' => 'Kepala Lab Fisika',
        'role' => 'kepala_lab',
        'lab_scope' => 'physics'
    ],
    [
        'username' => 'kepala_biologi',
        'password' => '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // 'password'
        'email' => 'biologi@inventory.local',
        'name' => 'Kepala Lab Biologi',
        'role' => 'kepala_lab',
        'lab_scope' => 'biology'
    ],
    [
        'username' => 'kepala_kimia',
        'password' => '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // 'password'
        'email' => 'kimia@inventory.local',
        'name' => 'Kepala Lab Kimia',
        'role' => 'kepala_lab',
        'lab_scope' => 'chemistry'
    ],
    [
        'username' => 'kepsek',
        'password' => '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // 'password'
        'email' => 'kepsek@inventory.local',
        'name' => 'Kepala Sekolah',
        'role' => 'kepala_sekolah',
        'lab_scope' => 'all'
    ],
    [
        'username' => 'guru',
        'password' => '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // 'password'
        'email' => 'guru@inventory.local',
        'name' => 'Guru / Asisten',
        'role' => 'guru',
        'lab_scope' => 'all'
    ],
    [
        'username' => 'sarpras',
        'password' => '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // 'password'
        'email' => 'sarpras@inventory.local',
        'name' => 'Sarana Prasarana',
        'role' => 'sarpras',
        'lab_scope' => 'all'
    ]
];

$stmt = $db->prepare("
    INSERT INTO users (username, password, email, name, role, lab_scope) 
    VALUES (:username, :password, :email, :name, :role, :lab_scope)
    ON DUPLICATE KEY UPDATE 
    password=VALUES(password), email=VALUES(email), name=VALUES(name), role=VALUES(role), lab_scope=VALUES(lab_scope)
");

foreach ($users as $u) {
    try {
        $stmt->execute($u);
        echo "Upserted " . $u['username'] . "\n";
    } catch (Exception $e) {
        $msg = $e->getMessage();
        if (strpos($msg, 'Duplicate entry') !== false) {
             echo "Updating existing duplicate for " . $u['username'] . " manually...\n";
             $updateStmt = $db->prepare("UPDATE users SET password=:password, email=:email, name=:name, role=:role, lab_scope=:lab_scope WHERE username=:username");
             $updateStmt->execute($u);
             echo "Manually updated " . $u['username'] . "\n";
        } else {
             echo "Error upserting " . $u['username'] . ": " . $msg . "\n";
        }
    }
}
echo "Done seeding exactly 8 users.\n";
