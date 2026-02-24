<?php
include_once '../config/cors.php';
include_once '../config/database.php';

$database = new Database();
$db = $database->getConnection();

$method = $_SERVER['REQUEST_METHOD'];

if ($method == 'GET') {
    // 1. Fetch all Rooms
    $query = "SELECT * FROM rooms ORDER BY id ASC";
    $stmt = $db->prepare($query);
    $stmt->execute();
    $rooms = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 2. Fetch all Containers
    $queryCont = "SELECT * FROM containers";
    $stmtCont = $db->prepare($queryCont);
    $stmtCont->execute();
    $containers = $stmtCont->fetchAll(PDO::FETCH_ASSOC);

    // 3. Fetch all Items and their logs (Log retrieval might be heavy, optimize later if needed)
    // For now, let's just get items. Logs can be fetched separately or we do a simple join if strictly needed for specific views.
    // The frontend expects item.logs. Let's fetch basic item info first.
    // NOTE: For performance, fetching ALL logs for ALL items every time is bad. 
    // But for the current exact structure replication:
    $queryItems = "SELECT * FROM items";
    $stmtItems = $db->prepare($queryItems);
    $stmtItems->execute();
    $items = $stmtItems->fetchAll(PDO::FETCH_ASSOC);
    
    // Fetch logs separately to attach? 
    // Or simpler: The frontend types.ts defines ItemLog[] on Item.
    // Let's do a quick fetch of logs for these items.
    $queryLogs = "SELECT * FROM item_logs ORDER BY date DESC";
    $stmtLogs = $db->prepare($queryLogs);
    $stmtLogs->execute();
    $logs = $stmtLogs->fetchAll(PDO::FETCH_ASSOC);

    // HIERARCHY ASSEMBLY (PHP Side to save SQL Complexity)
    
    // Build Item Map with Logs
    $itemsMap = [];
    foreach ($items as $item) {
        // Cast types to match frontend EXPECTATIONS
        $item['id'] = (string)$item['id']; // Frontend uses strings often for IDs?
        // Actually DB uses INT. Let's keep consistency. Frontend TS has strings.
        // It's safer to cast all IDs to string for frontend compatibility if interfaces say string.
        
        $item['quantity'] = (int)$item['quantity'];
        $item['is_consumable'] = (bool)$item['is_consumable']; // Check tinyint conversion
        
        // Parse specs and parameters from JSON
        // Note: In DB structure `parameters` is JSON.
        $item['parameters'] = json_decode($item['parameters'] ?? '[]', true);
        // `specs` is TEXT in DB, string in Frontend.
        
        // Attach logs
        $itemLogs = array_filter($logs, function($l) use ($item) {
            return $l['item_id'] == $item['id'];
        });
        $item['logs'] = array_values($itemLogs); // Reset keys
        
        $itemsMap[$item['container_id']][] = $item;
    }

    // Build Container Map with Items
    $containersMap = [];
    foreach ($containers as $cont) {
        $cont['id'] = (string)$cont['id'];
        $cont['room_id'] = (string)$cont['room_id'];
        $cont['items'] = $itemsMap[$cont['id']] ?? [];
        
        // Frontend expects 'position' object {x, y}
        $cont['position'] = [
            'x' => (int)$cont['position_x'],
            'y' => (int)$cont['position_y']
        ];
        unset($cont['position_x']);
        unset($cont['position_y']);
        
        $containersMap[$cont['room_id']][] = $cont;
    }

    // Attach Containers to Rooms
    foreach ($rooms as &$room) {
        $room['id'] = (string)$room['id'];
        $room['capacity'] = (int)$room['capacity'];
        $room['containers'] = $containersMap[$room['id']] ?? [];
    }

    echo json_encode($rooms);

} elseif ($method == 'POST') {
    // Add new Room
    $data = json_decode(file_get_contents("php://input"));
    
    if(isset($data->name) && isset($data->type) && isset($data->category)) {
        $query = "INSERT INTO rooms (name, type, category, capacity) VALUES (:name, :type, :category, :capacity)";
        $stmt = $db->prepare($query);
        
        $stmt->bindParam(":name", $data->name);
        $stmt->bindParam(":type", $data->type);
        $stmt->bindParam(":category", $data->category);
        $capacity = $data->capacity ?? 0;
        $stmt->bindParam(":capacity", $capacity);
        
        if($stmt->execute()) {
            echo json_encode(["status" => "success", "id" => $db->lastInsertId(), "message" => "Room created."]);
        } else {
            echo json_encode(["status" => "error", "message" => "Unable to create room."]);
        }
    } else {
        echo json_encode(["status" => "error", "message" => "Incomplete data."]);
    }
}
?>
