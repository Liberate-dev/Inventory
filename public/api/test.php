<?php
include_once 'config/cors.php';
include_once 'config/database.php';

$database = new Database();
$db = $database->getConnection();

if($db){
    echo json_encode(["status" => "success", "message" => "Database Connected Successfully!"]);
} else {
    echo json_encode(["status" => "error", "message" => "Connection Failed."]);
}
?>
