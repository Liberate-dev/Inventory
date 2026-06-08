<?php

function assetEnsureDocumentNumberSettingsTable(PDO $db): void
{
    $db->exec(
        "CREATE TABLE IF NOT EXISTS asset_document_number_settings (
            id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
            prefix VARCHAR(20) NOT NULL DEFAULT 'DOC',
            `separator` VARCHAR(3) NOT NULL DEFAULT '-',
            year_format ENUM('none', '2', '4') NOT NULL DEFAULT '4',
            sequence_padding TINYINT UNSIGNED NOT NULL DEFAULT 4,
            next_number INT UNSIGNED NOT NULL DEFAULT 1,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    );

    $db->exec(
        "INSERT INTO asset_document_number_settings
            (id, prefix, `separator`, year_format, sequence_padding, next_number)
         VALUES (1, 'DOC', '-', '4', 4, 1)
         ON DUPLICATE KEY UPDATE id = id"
    );
}

function assetParsePositiveInt($value, int $fallback): int
{
    if (!is_numeric($value)) return $fallback;
    $intValue = (int) $value;
    return $intValue > 0 ? $intValue : $fallback;
}

function assetFetchDocumentNumberSettings(PDO $db, bool $forUpdate = false): array
{
    assetEnsureDocumentNumberSettingsTable($db);

    $query = "SELECT id, prefix, `separator`, year_format, sequence_padding, next_number
              FROM asset_document_number_settings
              WHERE id = 1";
    if ($forUpdate) {
        $query .= " FOR UPDATE";
    }

    $stmt = $db->prepare($query);
    $stmt->execute();
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        return [
            'prefix' => 'DOC',
            'separator' => '-',
            'yearFormat' => '4',
            'sequencePadding' => 4,
            'nextNumber' => 1
        ];
    }

    return [
        'prefix' => (string) $row['prefix'],
        'separator' => (string) $row['separator'],
        'yearFormat' => (string) $row['year_format'],
        'sequencePadding' => (int) $row['sequence_padding'],
        'nextNumber' => (int) $row['next_number']
    ];
}

function assetBuildDocumentNumber(array $settings, int $sequence, ?string $dateValue = null): string
{
    $separator = trim((string) ($settings['separator'] ?? '-'));
    if ($separator === '') $separator = '-';

    $parts = [];
    $prefix = strtoupper(trim((string) ($settings['prefix'] ?? 'DOC')));
    if ($prefix !== '') $parts[] = $prefix;

    $timestamp = $dateValue ? strtotime($dateValue) : false;
    if ($timestamp === false) {
        $timestamp = time();
    }

    $yearFormat = (string) ($settings['yearFormat'] ?? '4');
    if ($yearFormat === '4') {
        $parts[] = date('Y', $timestamp);
    } elseif ($yearFormat === '2') {
        $parts[] = date('y', $timestamp);
    }

    $padding = assetParsePositiveInt($settings['sequencePadding'] ?? 4, 4);
    if ($padding < 2) $padding = 2;
    if ($padding > 8) $padding = 8;

    $parts[] = str_pad((string) max(1, $sequence), $padding, '0', STR_PAD_LEFT);

    return implode($separator, $parts);
}

function assetUpdateDocumentNextNumber(PDO $db, int $nextNumber): void
{
    $stmt = $db->prepare("UPDATE asset_document_number_settings SET next_number = :next_number WHERE id = 1");
    $stmt->bindValue(':next_number', max(1, $nextNumber), PDO::PARAM_INT);
    $stmt->execute();
}

function assetGenerateDocumentNumber(PDO $db, ?string $dateValue = null): array
{
    assetEnsureDocumentNumberSettingsTable($db);

    $startedTransaction = !$db->inTransaction();
    if ($startedTransaction) {
        $db->beginTransaction();
    }

    try {
        $settings = assetFetchDocumentNumberSettings($db, true);
        $sequence = max(1, assetParsePositiveInt($settings['nextNumber'] ?? 1, 1));
        $findStmt = $db->prepare("SELECT id FROM assets WHERE document_reference = :document_reference LIMIT 1");
        $documentNumber = '';

        while (true) {
            $candidate = assetBuildDocumentNumber($settings, $sequence, $dateValue);
            $findStmt->bindValue(':document_reference', $candidate, PDO::PARAM_STR);
            $findStmt->execute();
            $existing = $findStmt->fetch(PDO::FETCH_ASSOC);
            if (!$existing) {
                $documentNumber = $candidate;
                break;
            }
            $sequence++;
        }

        assetUpdateDocumentNextNumber($db, $sequence + 1);

        if ($startedTransaction) {
            $db->commit();
        }

        return [
            'documentNumber' => $documentNumber,
            'settings' => assetFetchDocumentNumberSettings($db)
        ];
    } catch (Throwable $e) {
        if ($startedTransaction && $db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }
}

function assetPreviewDocumentNumber(PDO $db, ?string $dateValue = null): array
{
    assetEnsureDocumentNumberSettingsTable($db);

    $settings = assetFetchDocumentNumberSettings($db);
    $sequence = max(1, assetParsePositiveInt($settings['nextNumber'] ?? 1, 1));
    $findStmt = $db->prepare("SELECT id FROM assets WHERE document_reference = :document_reference LIMIT 1");
    $documentNumber = '';

    while (true) {
        $candidate = assetBuildDocumentNumber($settings, $sequence, $dateValue);
        $findStmt->bindValue(':document_reference', $candidate, PDO::PARAM_STR);
        $findStmt->execute();
        $existing = $findStmt->fetch(PDO::FETCH_ASSOC);
        if (!$existing) {
            $documentNumber = $candidate;
            break;
        }
        $sequence++;
    }

    return [
        'documentNumber' => $documentNumber,
        'settings' => $settings
    ];
}

?>
