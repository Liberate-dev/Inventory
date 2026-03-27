<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once '../config/database.php';
require_once '../auth/auth_helper.php';

$database = new Database();
$db = $database->getConnection();
$authUser = authCurrentUser($db, true);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["status" => "error", "message" => "Method not allowed"]);
    exit();
}

if (!isset($_FILES['image'])) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "No image uploaded"]);
    exit();
}

$file = $_FILES['image'];
$allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
$maxSize = 5 * 1024 * 1024; // 5MB

if (!in_array($file['type'], $allowedTypes)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Invalid file type. Only JPG, PNG, GIF, and WEBP allowed."]);
    exit();
}

if ($file['size'] > $maxSize) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "File too large. Max size is 5MB."]);
    exit();
}

$uploadDir = '../../uploads/';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

$extension = pathinfo($file['name'], PATHINFO_EXTENSION);
$filename = uniqid('img_', true) . '.' . $extension;
$targetPath = $uploadDir . $filename;

if (move_uploaded_file($file['tmp_name'], $targetPath)) {
    // Return the relative URL from the public directory
    $publicUrl = 'public/uploads/' . $filename;
    echo json_encode([
        "status" => "success",
        "message" => "File uploaded successfully",
        "url" => $publicUrl
    ]);
} else {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Failed to move uploaded file"]);
}
?>
