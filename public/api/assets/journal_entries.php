<?php
/**
 * Journal Entries API
 * GET: List journal entries
 * GET: Single journal entry with lines
 */

include_once '../config/cors.php';
include_once '../config/database.php';
include_once '../config/auth.php';
include_once 'includes/schema.php';
header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];
$db = (new Database())->getConnection();

if (!$db) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Database connection failed.']);
    exit;
}

assetEnsureSchema($db);

switch ($method) {
    case 'GET':
        if (isset($_GET['id'])) {
            getJournalEntry($db, (int) $_GET['id']);
        } else {
            listJournalEntries($db);
        }
        break;
    default:
        http_response_code(405);
        echo json_encode(['status' => 'error', 'message' => 'Method not allowed.']);
}

/**
 * List journal entries with filters
 */
function listJournalEntries(PDO $db): void {
    $authUser = authCurrentUser($db, true);
    authRequireFeature($db, 'asset_accounting', 'view');

    $where = ['1=1'];
    $params = [];

    if (!empty($_GET['type'])) {
        $where[] = "je.type = ?";
        $params[] = $_GET['type'];
    }
    if (!empty($_GET['year'])) {
        $where[] = "je.period_year = ?";
        $params[] = (int) $_GET['year'];
    }
    if (!empty($_GET['month'])) {
        $where[] = "je.period_month = ?";
        $params[] = (int) $_GET['month'];
    }
    if (!empty($_GET['status'])) {
        $where[] = "je.status = ?";
        $params[] = $_GET['status'];
    }

    $sql = "
        SELECT je.*,
               creator.name as created_by_name,
               poster.name as posted_by_name
        FROM journal_entries je
        LEFT JOIN users creator ON je.created_by = creator.id
        LEFT JOIN users poster ON je.posted_by = poster.id
        WHERE " . implode(' AND ', $where) . "
        ORDER BY je.entry_date DESC, je.id DESC
        LIMIT 100
    ";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $entries = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($entries as &$entry) {
        $entry['id'] = (int) $entry['id'];
        $entry['period_year'] = (int) $entry['period_year'];
        $entry['period_month'] = (int) $entry['period_month'];
        $entry['total_debit'] = (float) $entry['total_debit'];
        $entry['total_credit'] = (float) $entry['total_credit'];
    }

    echo json_encode([
        'status' => 'success',
        'journal_entries' => $entries
    ]);
}

/**
 * Get single journal entry with lines
 */
function getJournalEntry(PDO $db, int $id): void {
    $authUser = authCurrentUser($db, true);
    authRequireFeature($db, 'asset_accounting', 'view');

    $stmt = $db->prepare("
        SELECT je.*,
               creator.name as created_by_name,
               poster.name as posted_by_name
        FROM journal_entries je
        LEFT JOIN users creator ON je.created_by = creator.id
        LEFT JOIN users poster ON je.posted_by = poster.id
        WHERE je.id = ?
    ");
    $stmt->execute([$id]);
    $entry = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$entry) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Journal entry not found.']);
        return;
    }

    // Get journal lines
    $stmt = $db->prepare("
        SELECT *
        FROM journal_entry_lines
        WHERE journal_entry_id = ?
        ORDER BY line_number ASC
    ");
    $stmt->execute([$id]);
    $lines = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($lines as &$line) {
        $line['id'] = (int) $line['id'];
        $line['line_number'] = (int) $line['line_number'];
        $line['debit_amount'] = (float) $line['debit_amount'];
        $line['credit_amount'] = (float) $line['credit_amount'];
        $line['asset_id'] = $line['asset_id'] ? (int) $line['asset_id'] : null;
    }

    echo json_encode([
        'status' => 'success',
        'journal_entry' => $entry,
        'journal_lines' => $lines
    ]);
}
