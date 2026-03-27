<?php
echo "Testing localhost...\n";
try {
    $conn = new PDO("mysql:host=localhost;dbname=inventory_db", "root", "");
    echo "Localhost success!\n";
} catch (Exception $e) {
    echo "Localhost failed: " . $e->getMessage() . "\n";
}

echo "\nTesting 127.0.0.1...\n";
try {
    $conn = new PDO("mysql:host=127.0.0.1;dbname=inventory_db", "root", "");
    echo "127.0.0.1 success!\n";
} catch (Exception $e) {
    echo "127.0.0.1 failed: " . $e->getMessage() . "\n";
}
?>
