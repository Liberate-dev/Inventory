<?php
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$configuredOrigins = getenv('APP_ALLOWED_ORIGINS');
$allowedOrigins = $configuredOrigins !== false && trim((string) $configuredOrigins) !== ''
    ? array_values(array_filter(array_map('trim', explode(',', (string) $configuredOrigins))))
    : [
        'http://localhost',
        'http://127.0.0.1',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
    ];

if ($origin !== '' && in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: {$origin}");
    header('Vary: Origin');
}

header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Auth-Token, X-Requested-With");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    if ($origin !== '' && !in_array($origin, $allowedOrigins, true)) {
        http_response_code(403);
        exit();
    }

    http_response_code(200);
    exit();
}
?>
