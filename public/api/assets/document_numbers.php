<?php
/**
 * Asset Document Number Settings API
 * GET: Load settings
 * PUT: Update settings
 * POST action=preview: Preview next document number without advancing sequence
 * POST action=generate: Generate next document number and advance sequence
 */

include_once '../config/cors.php';
include_once '../config/database.php';
include_once '../config/auth.php';
include_once 'includes/schema.php';
include_once 'includes/document_numbering.php';

header('Content-Type: application/json');

$db = (new Database())->getConnection();

if (!$db) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Database connection failed.']);
    exit;
}

assetEnsureSchema($db);

$method = $_SERVER['REQUEST_METHOD'];
$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload)) {
    $payload = [];
}

function respondDocumentNumber(int $statusCode, array $data): void
{
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

try {
    assetEnsureDocumentNumberSettingsTable($db);
} catch (Throwable $e) {
    respondDocumentNumber(500, ['status' => 'error', 'message' => 'Gagal inisialisasi tabel nomor dokumen.']);
}

if ($method === 'GET') {
    authRequireFeature($db, 'asset_accounting', 'view');
    respondDocumentNumber(200, [
        'status' => 'success',
        'settings' => assetFetchDocumentNumberSettings($db)
    ]);
}

if ($method === 'PUT') {
    authRequireFeature($db, 'asset_accounting', 'full');
    $settings = assetFetchDocumentNumberSettings($db);

    $prefix = strtoupper(trim((string) ($payload['prefix'] ?? $settings['prefix'])));
    if ($prefix === '' || strlen($prefix) > 20) {
        respondDocumentNumber(400, ['status' => 'error', 'message' => 'Prefix harus 1-20 karakter.']);
    }

    $separator = trim((string) ($payload['separator'] ?? $settings['separator']));
    if ($separator === '' || strlen($separator) > 3) {
        respondDocumentNumber(400, ['status' => 'error', 'message' => 'Separator harus 1-3 karakter.']);
    }

    $yearFormat = (string) ($payload['yearFormat'] ?? $payload['year_format'] ?? $settings['yearFormat']);
    if (!in_array($yearFormat, ['none', '2', '4'], true)) {
        respondDocumentNumber(400, ['status' => 'error', 'message' => 'Format tahun tidak valid.']);
    }

    $sequencePadding = assetParsePositiveInt($payload['sequencePadding'] ?? $payload['sequence_padding'] ?? $settings['sequencePadding'], 4);
    if ($sequencePadding < 2 || $sequencePadding > 8) {
        respondDocumentNumber(400, ['status' => 'error', 'message' => 'Panjang nomor urut harus 2-8 digit.']);
    }

    $nextNumber = assetParsePositiveInt($payload['nextNumber'] ?? $payload['next_number'] ?? $settings['nextNumber'], 1);

    $stmt = $db->prepare(
        "UPDATE asset_document_number_settings
         SET prefix = :prefix,
             `separator` = :separator,
             year_format = :year_format,
             sequence_padding = :sequence_padding,
             next_number = :next_number
         WHERE id = 1"
    );
    $stmt->bindValue(':prefix', $prefix, PDO::PARAM_STR);
    $stmt->bindValue(':separator', $separator, PDO::PARAM_STR);
    $stmt->bindValue(':year_format', $yearFormat, PDO::PARAM_STR);
    $stmt->bindValue(':sequence_padding', $sequencePadding, PDO::PARAM_INT);
    $stmt->bindValue(':next_number', $nextNumber, PDO::PARAM_INT);
    $stmt->execute();

    authWriteSystemLog($db, null, 'asset.document_number_settings.updated', [
        'prefix' => $prefix,
        'yearFormat' => $yearFormat,
        'sequencePadding' => $sequencePadding,
        'nextNumber' => $nextNumber
    ]);

    respondDocumentNumber(200, [
        'status' => 'success',
        'message' => 'Pengaturan nomor dokumen tersimpan.',
        'settings' => assetFetchDocumentNumberSettings($db)
    ]);
}

if ($method === 'POST') {
    $action = (string) ($payload['action'] ?? '');

    if (!in_array($action, ['preview', 'generate'], true)) {
        respondDocumentNumber(400, ['status' => 'error', 'message' => 'Action tidak didukung.']);
    }

    authRequireFeature($db, 'asset_accounting', $action === 'preview' ? 'view' : 'full');

    try {
        $date = isset($payload['date']) ? (string) $payload['date'] : null;
        $result = $action === 'preview'
            ? assetPreviewDocumentNumber($db, $date)
            : assetGenerateDocumentNumber($db, $date);

        respondDocumentNumber(200, [
            'status' => 'success',
            'documentNumber' => $result['documentNumber'],
            'settings' => $result['settings']
        ]);
    } catch (Throwable $e) {
        respondDocumentNumber(500, ['status' => 'error', 'message' => 'Gagal generate nomor dokumen.']);
    }
}

respondDocumentNumber(405, ['status' => 'error', 'message' => 'Method not allowed.']);

?>
