<?php
include_once 'config/cors.php';
include_once 'config/database.php';
include_once 'config/auth.php';

$database = new Database();
$db = $database->getConnection();

if (!$db) {
    authRespond(500, ["status" => "error", "message" => "Connection Failed."]);
}

authRequireFeature($db, 'user_management', 'view');

if($db){
    echo json_encode(["status" => "success", "message" => "Database Connected Successfully!"]);
} else {
    echo json_encode(["status" => "error", "message" => "Connection Failed."]);
}
?>
