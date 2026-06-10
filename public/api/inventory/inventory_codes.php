<?php
include_once '../config/cors.php';
include_once '../config/database.php';
include_once '../config/auth.php';

header('Content-Type: application/json');

$database = new Database();
$db = $database->getConnection();

if (!$db) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Database connection failed.']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$rawInput = file_get_contents('php://input');
$payload = json_decode($rawInput, true);
if (!is_array($payload)) {
    $payload = [];
}

function respondInventoryCode(int $statusCode, array $data): void
{
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

function ensureInventoryCodeSettingsTable(PDO $db): void
{
    $db->exec(
        "CREATE TABLE IF NOT EXISTS inventory_code_settings (
            id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
            prefix VARCHAR(20) NOT NULL DEFAULT 'INV',
            `separator` VARCHAR(3) NOT NULL DEFAULT '-',
            year_format ENUM('none', '2', '4') NOT NULL DEFAULT '4',
            include_room_code TINYINT(1) NOT NULL DEFAULT 1,
            sequence_padding TINYINT UNSIGNED NOT NULL DEFAULT 4,
            next_number INT UNSIGNED NOT NULL DEFAULT 1,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    );

    $db->exec(
        "INSERT INTO inventory_code_settings (id, prefix, `separator`, year_format, include_room_code, sequence_padding, next_number)
         VALUES (1, 'INV', '-', '4', 1, 4, 1)
         ON DUPLICATE KEY UPDATE id = id"
    );
}

function fetchInventoryCodeSettings(PDO $db, bool $forUpdate = false): array
{
    $query = "SELECT id, prefix, `separator`, year_format, include_room_code, sequence_padding, next_number
              FROM inventory_code_settings
              WHERE id = 1";
    if ($forUpdate) {
        $query .= " FOR UPDATE";
    }

    $stmt = $db->prepare($query);
    $stmt->execute();
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return [
            'prefix' => 'INV',
            'separator' => '-',
            'yearFormat' => '4',
            'includeRoomCode' => true,
            'sequencePadding' => 4,
            'nextNumber' => 1
        ];
    }

    return [
        'prefix' => (string) $row['prefix'],
        'separator' => (string) $row['separator'],
        'yearFormat' => (string) $row['year_format'],
        'includeRoomCode' => ((int) $row['include_room_code']) === 1,
        'sequencePadding' => (int) $row['sequence_padding'],
        'nextNumber' => (int) $row['next_number']
    ];
}

function parsePositiveInt($value, int $fallback): int
{
    if (!is_numeric($value)) return $fallback;
    $intValue = (int) $value;
    return $intValue > 0 ? $intValue : $fallback;
}

function deriveRoomCodeFromName(?string $roomName): string
{
    $name = strtoupper(trim((string) $roomName));
    if ($name === '') return 'ROOM';

    $cleaned = preg_replace('/[^A-Z0-9 ]+/', ' ', $name);
    if (!is_string($cleaned)) return 'ROOM';
    $cleaned = preg_replace('/\s+/', ' ', trim($cleaned));
    if (!is_string($cleaned) || $cleaned === '') return 'ROOM';

    $parts = array_values(array_filter(explode(' ', $cleaned), fn($part) => $part !== ''));
    if (count($parts) >= 2) {
        $initials = '';
        for ($i = 0; $i < min(3, count($parts)); $i++) {
            $initials .= substr($parts[$i], 0, 1);
        }
        if (strlen($initials) >= 2) return $initials;
    }

    return substr($parts[0], 0, 3);
}

function buildInventoryCode(array $settings, int $sequence, ?string $roomCode = null): string
{
    $separator = trim((string) ($settings['separator'] ?? '-'));
    if ($separator === '') $separator = '-';

    $parts = [];
    $prefix = strtoupper(trim((string) ($settings['prefix'] ?? 'INV')));
    if ($prefix !== '') $parts[] = $prefix;

    $yearFormat = (string) ($settings['yearFormat'] ?? '4');
    if ($yearFormat === '4') {
        $parts[] = date('Y');
    } elseif ($yearFormat === '2') {
        $parts[] = date('y');
    }

    $includeRoomCode = !empty($settings['includeRoomCode']);
    if ($includeRoomCode) {
        $normalizedRoomCode = strtoupper(trim((string) $roomCode));
        if ($normalizedRoomCode !== '') {
            $parts[] = $normalizedRoomCode;
        }
    }

    $padding = parsePositiveInt($settings['sequencePadding'] ?? 4, 4);
    if ($padding < 2) $padding = 2;
    if ($padding > 8) $padding = 8;

    $safeSequence = max(1, $sequence);
    $parts[] = str_pad((string) $safeSequence, $padding, '0', STR_PAD_LEFT);

    return implode($separator, $parts);
}

function resolveRoomNameById(PDO $db, $roomId): ?string
{
    if (!is_numeric($roomId)) return null;
    $intRoomId = (int) $roomId;
    if ($intRoomId <= 0) return null;

    $stmt = $db->prepare("SELECT name FROM rooms WHERE id = :room_id LIMIT 1");
    $stmt->bindValue(':room_id', $intRoomId, PDO::PARAM_INT);
    $stmt->execute();
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row || !isset($row['name'])) return null;
    return (string) $row['name'];
}

function updateNextNumber(PDO $db, int $nextNumber): void
{
    $stmt = $db->prepare("UPDATE inventory_code_settings SET next_number = :next_number WHERE id = 1");
    $stmt->bindValue(':next_number', max(1, $nextNumber), PDO::PARAM_INT);
    $stmt->execute();
}

try {
    ensureInventoryCodeSettingsTable($db);
} catch (Throwable $e) {
    respondInventoryCode(500, ['status' => 'error', 'message' => 'Gagal inisialisasi tabel pengaturan kode inventaris.', 'debug' => $e->getMessage()]);
}

if ($method === 'GET') {
    authRequireFeature($db, 'item_management', 'view');
    $settings = fetchInventoryCodeSettings($db);
    respondInventoryCode(200, ['status' => 'success', 'settings' => $settings]);
}

if ($method === 'PUT') {
    authRequireFeature($db, 'item_management', 'full');
    $settings = fetchInventoryCodeSettings($db);

    $prefix = strtoupper(trim((string) ($payload['prefix'] ?? $settings['prefix'])));
    if ($prefix === '' || strlen($prefix) > 20) {
        respondInventoryCode(400, ['status' => 'error', 'message' => 'Prefix harus 1-20 karakter.']);
    }

    $separator = trim((string) ($payload['separator'] ?? $settings['separator']));
    if ($separator === '' || strlen($separator) > 3) {
        respondInventoryCode(400, ['status' => 'error', 'message' => 'Separator harus 1-3 karakter.']);
    }

    $yearFormat = (string) ($payload['yearFormat'] ?? $payload['year_format'] ?? $settings['yearFormat']);
    if (!in_array($yearFormat, ['none', '2', '4'], true)) {
        respondInventoryCode(400, ['status' => 'error', 'message' => 'Format tahun tidak valid.']);
    }

    $includeRoomCode = array_key_exists('includeRoomCode', $payload)
        ? (bool) $payload['includeRoomCode']
        : (array_key_exists('include_room_code', $payload)
            ? (bool) $payload['include_room_code']
            : (bool) $settings['includeRoomCode']);

    $sequencePadding = parsePositiveInt($payload['sequencePadding'] ?? $payload['sequence_padding'] ?? $settings['sequencePadding'], 4);
    if ($sequencePadding < 2 || $sequencePadding > 8) {
        respondInventoryCode(400, ['status' => 'error', 'message' => 'Panjang nomor urut harus 2-8 digit.']);
    }

    $nextNumber = parsePositiveInt($payload['nextNumber'] ?? $payload['next_number'] ?? $settings['nextNumber'], 1);

    $stmt = $db->prepare(
        "UPDATE inventory_code_settings
         SET prefix = :prefix,
             `separator` = :separator,
             year_format = :year_format,
             include_room_code = :include_room_code,
             sequence_padding = :sequence_padding,
             next_number = :next_number
         WHERE id = 1"
    );
    $stmt->bindValue(':prefix', $prefix, PDO::PARAM_STR);
    $stmt->bindValue(':separator', $separator, PDO::PARAM_STR);
    $stmt->bindValue(':year_format', $yearFormat, PDO::PARAM_STR);
    $stmt->bindValue(':include_room_code', $includeRoomCode ? 1 : 0, PDO::PARAM_INT);
    $stmt->bindValue(':sequence_padding', $sequencePadding, PDO::PARAM_INT);
    $stmt->bindValue(':next_number', $nextNumber, PDO::PARAM_INT);
    $stmt->execute();

    respondInventoryCode(200, [
        'status' => 'success',
        'message' => 'Pengaturan kode inventaris tersimpan.',
        'settings' => fetchInventoryCodeSettings($db)
    ]);
}

if ($method === 'POST') {
    $authUser = authCurrentUser($db, true);
    $action = (string) ($payload['action'] ?? '');

    if ($action === 'generate') {
        if (!authHasFeatureAccess($authUser, 'item_management', 'full', $db) && !authHasFeatureAccess($authUser, 'rooms', 'full', $db)) {
            respondInventoryCode(403, ['status' => 'error', 'message' => 'Access denied.']);
        }

        $roomId = $payload['roomId'] ?? $payload['room_id'] ?? null;
        if ($roomId !== null && is_numeric($roomId)) {
            authAssertRoomScope($db, $authUser, (int) $roomId);
        }

        $roomName = resolveRoomNameById($db, $payload['roomId'] ?? $payload['room_id'] ?? null);
        if ($roomName === null && isset($payload['roomName'])) {
            $roomName = (string) $payload['roomName'];
        }
        $roomCode = deriveRoomCodeFromName($roomName);

        try {
            $db->beginTransaction();
            $settings = fetchInventoryCodeSettings($db, true);
            $sequence = max(1, parsePositiveInt($settings['nextNumber'] ?? 1, 1));

            $findSkuStmt = $db->prepare("SELECT id FROM items WHERE sku = :sku LIMIT 1");
            $code = '';

            while (true) {
                $candidate = buildInventoryCode($settings, $sequence, $roomCode);
                $findSkuStmt->bindValue(':sku', $candidate, PDO::PARAM_STR);
                $findSkuStmt->execute();
                $existing = $findSkuStmt->fetch(PDO::FETCH_ASSOC);
                if (!$existing) {
                    $code = $candidate;
                    break;
                }
                $sequence++;
            }

            updateNextNumber($db, $sequence + 1);
            $db->commit();

            respondInventoryCode(200, [
                'status' => 'success',
                'code' => $code,
                'settings' => fetchInventoryCodeSettings($db)
            ]);
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            respondInventoryCode(500, ['status' => 'error', 'message' => 'Gagal generate kode inventaris.']);
        }
    }

    if ($action === 'normalize') {
        if (!authHasFeatureAccess($authUser, 'item_management', 'full', $db)) {
            respondInventoryCode(403, ['status' => 'error', 'message' => 'Access denied.']);
        }

        $mode = (string) ($payload['mode'] ?? 'all');
        if (!in_array($mode, ['all', 'missing'], true)) {
            respondInventoryCode(400, ['status' => 'error', 'message' => 'Mode normalisasi tidak valid.']);
        }

        try {
            $db->beginTransaction();
            $settings = fetchInventoryCodeSettings($db, true);
            $sequence = max(1, parsePositiveInt($settings['nextNumber'] ?? 1, 1));

            $itemStmt = $db->prepare(
                "SELECT i.id, i.sku, r.name AS room_name
                 FROM items i
                 INNER JOIN containers c ON c.id = i.container_id
                 INNER JOIN rooms r ON r.id = c.room_id
                 WHERE i.deleted_at IS NULL
                 ORDER BY r.id ASC, c.id ASC, i.id ASC"
            );
            $itemStmt->execute();
            $items = $itemStmt->fetchAll(PDO::FETCH_ASSOC);

            $preservedSkus = [];
            foreach ($items as $item) {
                $sku = trim((string) ($item['sku'] ?? ''));
                if ($mode === 'missing' && $sku !== '') {
                    $preservedSkus[$sku] = true;
                }
            }

            $usedSkus = $preservedSkus;
            $updates = [];
            foreach ($items as $item) {
                $currentSku = trim((string) ($item['sku'] ?? ''));
                if ($mode === 'missing' && $currentSku !== '') {
                    continue;
                }

                $roomCode = deriveRoomCodeFromName((string) ($item['room_name'] ?? ''));
                $newSku = '';

                while (true) {
                    $candidate = buildInventoryCode($settings, $sequence, $roomCode);
                    if (!isset($usedSkus[$candidate])) {
                        $newSku = $candidate;
                        $usedSkus[$candidate] = true;
                        break;
                    }
                    $sequence++;
                }
                $sequence++;

                $updates[] = [
                    'id' => (int) $item['id'],
                    'sku' => $newSku
                ];
            }

            if (count($updates) > 0) {
                $tempUpdateStmt = $db->prepare("UPDATE items SET sku = :sku WHERE id = :id");
                $finalUpdateStmt = $db->prepare("UPDATE items SET sku = :sku WHERE id = :id");

                foreach ($updates as $index => $update) {
                    $tempSku = 'TMP' . (string) $update['id'] . 'N' . (string) ($index + 1);
                    $tempUpdateStmt->bindValue(':id', $update['id'], PDO::PARAM_INT);
                    $tempUpdateStmt->bindValue(':sku', $tempSku, PDO::PARAM_STR);
                    $tempUpdateStmt->execute();
                }

                foreach ($updates as $update) {
                    $finalUpdateStmt->bindValue(':id', $update['id'], PDO::PARAM_INT);
                    $finalUpdateStmt->bindValue(':sku', $update['sku'], PDO::PARAM_STR);
                    $finalUpdateStmt->execute();
                }
            }

            updateNextNumber($db, $sequence);
            $db->commit();

            respondInventoryCode(200, [
                'status' => 'success',
                'message' => 'Normalisasi kode inventaris selesai.',
                'result' => [
                    'mode' => $mode,
                    'updated' => count($updates),
                    'total' => count($items),
                    'nextNumber' => $sequence
                ],
                'settings' => fetchInventoryCodeSettings($db)
            ]);
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            respondInventoryCode(500, ['status' => 'error', 'message' => 'Gagal melakukan normalisasi kode inventaris.']);
        }
    }

    respondInventoryCode(400, ['status' => 'error', 'message' => 'Action tidak didukung.']);
}

respondInventoryCode(405, ['status' => 'error', 'message' => 'Method not allowed.']);
?>
