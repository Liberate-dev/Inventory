<?php
include_once '../config/cors.php';
include_once '../config/database.php';

header('Content-Type: application/json');

$database = new Database();
$db = $database->getConnection();

if (!$db) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Database connection failed."]);
    exit;
}

$data = json_decode(file_get_contents("php://input"));

if(isset($data->username) && isset($data->password)) {
    $username = $data->username;
    $password = $data->password;

    $query = "SELECT id, username, password, name, email, phone, role, avatar_url, lab_scope FROM users WHERE username = :username OR email = :email LIMIT 0,1";
    $stmt = $db->prepare($query);
    $stmt->bindParam(":username", $username);
    $stmt->bindParam(":email", $username);
    $stmt->execute();

    if($stmt->rowCount() > 0) {
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        
        // Verify password
        // Note: For initial 'admin' user inserted via SQL, the hash is for 'password'
        if(password_verify($password, $row['password'])) {
            
            // Remove password from response
            unset($row['password']);

            $user = [
                "id" => (string)$row['id'],
                "username" => $row['username'],
                "name" => $row['name'],
                "email" => $row['email'],
                "phone" => $row['phone'],
                "role" => $row['role'],
                "avatar" => $row['avatar_url'],
                "labScope" => $row['lab_scope']
            ];
            
            echo json_encode(array(
                "success" => true,
                "message" => "Login successful.",
                "user" => $user,
                "token" =>  base64_encode($user['username'] . ':' . time()) // Simple mock token
            ));
        } else {
            echo json_encode(array("success" => false, "message" => "Invalid password."));
        }
    } else {
        echo json_encode(array("success" => false, "message" => "User not found."));
    }
} else {
    echo json_encode(array("success" => false, "message" => "Incomplete data."));
}
?>
