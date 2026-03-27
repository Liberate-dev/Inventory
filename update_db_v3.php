<?php
// Koneksi langsung (XAMPP: password kosong, host localhost)
$host = 'localhost';
$db_name = 'inventory_db';
$username = 'root';
$password = '';

try {
    $db = new PDO("mysql:host=$host;dbname=$db_name", $username, $password);
    $db->exec("set names utf8");
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    echo "Koneksi database berhasil.<br>\n";
} catch (PDOException $e) {
    die("Koneksi GAGAL: " . $e->getMessage() . "<br>\n");
}

$queries = [
    "ALTER TABLE containers ADD COLUMN image_url VARCHAR(500) DEFAULT NULL;",
    "ALTER TABLE items ADD COLUMN source VARCHAR(255) DEFAULT NULL;",
    "ALTER TABLE items ADD COLUMN image_url VARCHAR(500) DEFAULT NULL;",
    "ALTER TABLE rooms ADD COLUMN room_owner VARCHAR(255) DEFAULT NULL;",
];

echo "Updating database schema (v3)...<br>\n";

foreach ($queries as $query) {
    try {
        $db->exec($query);
        echo "✅ Berhasil: $query<br>\n";
    } catch (PDOException $e) {
        if ($e->getCode() == '42S21') {
            echo "⏭️ Kolom sudah ada, skip: $query<br>\n";
        } else {
            echo "❌ Error: " . $e->getMessage() . "<br>\n";
        }
    }
}

echo "<br>✅ Database update selesai.\n";
?>
