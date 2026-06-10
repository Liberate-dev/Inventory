<?php

function assetTableExists(PDO $db, string $tableName): bool
{
    $stmt = $db->prepare("SHOW TABLES LIKE ?");
    $stmt->execute([$tableName]);
    return (bool) $stmt->fetch(PDO::FETCH_NUM);
}

function assetColumn(PDO $db, string $tableName, string $columnName): ?array
{
    $stmt = $db->prepare("SHOW COLUMNS FROM `{$tableName}` LIKE ?");
    $stmt->execute([$columnName]);
    $column = $stmt->fetch(PDO::FETCH_ASSOC);
    return $column ?: null;
}

function assetColumnExists(PDO $db, string $tableName, string $columnName): bool
{
    return assetColumn($db, $tableName, $columnName) !== null;
}

function assetIndexExists(PDO $db, string $tableName, string $indexName): bool
{
    $stmt = $db->prepare("SHOW INDEX FROM `{$tableName}` WHERE Key_name = ?");
    $stmt->execute([$indexName]);
    return (bool) $stmt->fetch(PDO::FETCH_ASSOC);
}

function assetExecIgnore(PDO $db, string $sql): void
{
    try {
        $db->exec($sql);
    } catch (Throwable $e) {
        // Schema drift should not block normal API use when the target shape is already present.
    }
}

function assetSqlInitPath(string $filename): ?string
{
    $candidates = [
        __DIR__ . '/../../../../docker/mysql/init/' . $filename,
        '/var/www/html/Inventory/docker/mysql/init/' . $filename,
    ];

    foreach ($candidates as $path) {
        if (is_readable($path)) {
            return $path;
        }
    }

    return null;
}

function assetRunSqlInitFile(PDO $db, string $filename): void
{
    $path = assetSqlInitPath($filename);
    if ($path === null) {
        return;
    }

    $sql = file_get_contents($path);
    if ($sql === false) {
        return;
    }

    $sql = preg_replace('/^--.*$/m', '', $sql);
    $statements = preg_split('/;\s*(?:\r?\n|$)/', $sql);

    foreach ($statements as $statement) {
        $statement = trim($statement);
        if ($statement === '' || preg_match('/^(SET|START TRANSACTION|COMMIT)\b/i', $statement)) {
            continue;
        }

        assetExecIgnore($db, $statement);
    }
}

function assetEnsureAdminNlUser(PDO $db): void
{
    if (!assetTableExists($db, 'users')) {
        return;
    }

    $stmt = $db->prepare("SELECT id FROM users WHERE username = 'admin_nl' LIMIT 1");
    $stmt->execute();
    if ($stmt->fetch(PDO::FETCH_ASSOC)) {
        return;
    }

    $passwordHash = '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';
    $insert = $db->prepare("
        INSERT INTO users (id, username, password, email, name, phone, role, lab_scope, avatar_url, created_at)
        VALUES (16, 'admin_nl', :password, 'adminnl@school.com', 'Admin Non Lab', '081200000016', 'admin_nl', NULL, NULL, '2026-03-01 07:00:00')
        ON DUPLICATE KEY UPDATE role = 'admin_nl'
    ");
    $insert->execute(['password' => $passwordHash]);
}

function assetBootstrapSchema(PDO $db): void
{
    assetEnsureAdminNlUser($db);

    if (!assetTableExists($db, 'asset_categories')) {
        assetRunSqlInitFile($db, '3-assets-schema.sql');
    }

    if (assetTableExists($db, 'asset_categories')) {
        $count = (int) $db->query('SELECT COUNT(*) FROM asset_categories')->fetchColumn();
        if ($count === 0) {
            assetRunSqlInitFile($db, '4-assets-seed.sql');
        }
    }
}

function assetEnsureSchema(PDO $db): void
{
    assetBootstrapSchema($db);

    if (assetTableExists($db, 'users')) {
        $userRoleColumn = assetColumn($db, 'users', 'role');
        if ($userRoleColumn && strpos((string) $userRoleColumn['Type'], "'admin_nl'") === false) {
            assetExecIgnore($db, "ALTER TABLE users MODIFY `role` ENUM('admin', 'kepala_lab', 'guru', 'kepala_sekolah', 'sarpras', 'admin_nl') NOT NULL");
        }
    }

    if (!assetTableExists($db, 'assets')) {
        return;
    }

    $statusColumn = assetColumn($db, 'assets', 'status');
    if ($statusColumn && strpos((string) $statusColumn['Type'], "'inactive'") === false) {
        assetExecIgnore($db, "ALTER TABLE assets MODIFY `status` ENUM('active', 'inactive', 'fully_depreciated', 'disposed', 'on_hold', 'under_maintenance') NOT NULL DEFAULT 'active'");
        assetExecIgnore($db, "UPDATE assets SET status = 'inactive' WHERE status IN ('on_hold', 'under_maintenance')");
        assetExecIgnore($db, "ALTER TABLE assets MODIFY `status` ENUM('active', 'inactive', 'fully_depreciated', 'disposed') NOT NULL DEFAULT 'active'");
    }

    $conditionColumn = assetColumn($db, 'assets', 'condition');
    if ($conditionColumn && strpos((string) $conditionColumn['Type'], "'damaged'") === false) {
        assetExecIgnore($db, "ALTER TABLE assets MODIFY `condition` ENUM('new', 'good', 'fair', 'damaged') NOT NULL DEFAULT 'good'");
    }

    if (!assetColumnExists($db, 'assets', 'inactive_reason')) {
        assetExecIgnore($db, "ALTER TABLE assets ADD COLUMN `inactive_reason` TEXT DEFAULT NULL AFTER `status`");
    }
    if (!assetColumnExists($db, 'assets', 'inactive_date')) {
        assetExecIgnore($db, "ALTER TABLE assets ADD COLUMN `inactive_date` DATE DEFAULT NULL AFTER `inactive_reason`");
    }
    if (!assetColumnExists($db, 'assets', 'funding_source')) {
        assetExecIgnore($db, "ALTER TABLE assets ADD COLUMN `funding_source` ENUM('dana_bos', 'dana_komite', 'hibah', 'apbd', 'yayasan', 'lainnya') NOT NULL DEFAULT 'lainnya' AFTER `document_reference`");
    }

    assetExecIgnore($db, "ALTER TABLE assets DROP CHECK chk_salvage_less_than_cost");
    assetExecIgnore($db, "ALTER TABLE assets ADD CONSTRAINT chk_salvage_not_more_than_cost CHECK (`salvage_value` <= `acquisition_cost`)");

    if (assetTableExists($db, 'depreciation_schedules')) {
        $scheduleStatusColumn = assetColumn($db, 'depreciation_schedules', 'status');
        if ($scheduleStatusColumn && strpos((string) $scheduleStatusColumn['Type'], "'voided'") === false) {
            assetExecIgnore($db, "ALTER TABLE depreciation_schedules MODIFY `status` ENUM('scheduled', 'posted', 'voided', 'adjusted') NOT NULL DEFAULT 'scheduled'");
        }
    }

    if (assetTableExists($db, 'depreciation_runs') && !assetColumnExists($db, 'depreciation_runs', 'journal_entry_id')) {
        assetExecIgnore($db, "ALTER TABLE depreciation_runs ADD COLUMN `journal_entry_id` INT UNSIGNED DEFAULT NULL AFTER `posted_at`");
    }

    if (assetTableExists($db, 'asset_audit_log')) {
        $auditEventColumn = assetColumn($db, 'asset_audit_log', 'event_type');
        if ($auditEventColumn && strpos((string) $auditEventColumn['Type'], "'reactivated'") === false) {
            assetExecIgnore($db, "ALTER TABLE asset_audit_log MODIFY `event_type` ENUM('created', 'updated', 'depreciation_posted', 'disposal', 'improvement', 'location_changed', 'status_changed', 'document_uploaded', 'approval_granted', 'approval_rejected', 'schedule_regenerated', 'reactivated') NOT NULL");
        }
    }

    assetExecIgnore($db, "
        CREATE TABLE IF NOT EXISTS `asset_disposals` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `asset_id` INT UNSIGNED NOT NULL,
            `disposal_date` DATE NOT NULL,
            `disposal_method` ENUM('sold', 'written_off', 'traded_in', 'donated', 'stolen_lost') NOT NULL,
            `disposal_reason` TEXT NOT NULL,
            `book_value_at_disposal` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
            `accumulated_dep_at_disposal` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
            `proceeds` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
            `surplus_deficit` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
            `surplus_deficit_account_code` VARCHAR(20) DEFAULT NULL,
            `document_reference` VARCHAR(100) DEFAULT NULL,
            `approved_by` INT DEFAULT NULL,
            `journal_entry_id` INT UNSIGNED DEFAULT NULL,
            `created_by` INT DEFAULT NULL,
            `created_at` TIMESTAMP NOT NULL DEFAULT current_timestamp(),
            CONSTRAINT `fk_disposal_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_disposal_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
            CONSTRAINT `fk_disposal_created_by` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
            CONSTRAINT `uk_disposal_asset` UNIQUE (`asset_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    ");

    if (assetTableExists($db, 'asset_disposals')) {
        if (!assetIndexExists($db, 'asset_disposals', 'idx_disposals_date')) {
            assetExecIgnore($db, "CREATE INDEX `idx_disposals_date` ON `asset_disposals`(`disposal_date`)");
        }
        if (!assetIndexExists($db, 'asset_disposals', 'idx_disposals_method')) {
            assetExecIgnore($db, "CREATE INDEX `idx_disposals_method` ON `asset_disposals`(`disposal_method`)");
        }
    }

    if (assetTableExists($db, 'asset_config')) {
        $stmt = $db->prepare("
            INSERT INTO asset_config (config_key, config_value, description)
            VALUES
                ('dep_start_convention', 'acquisition_month', 'Penyusutan mulai mengikuti tanggal perolehan aset'),
                ('fiscal_year_start_month', '7', 'Bulan pertama tahun fiskal sekolah, 7 = Juli'),
                ('disposal_approval_role', 'kepala_sekolah', 'Role yang menyetujui pelepasan aset')
            ON DUPLICATE KEY UPDATE
                config_value = VALUES(config_value),
                description = VALUES(description)
        ");
        $stmt->execute();
    }
}

function assetNormalizeFundingSource(?string $source): string
{
    $allowed = ['dana_bos', 'dana_komite', 'hibah', 'apbd', 'yayasan', 'lainnya'];
    return in_array($source, $allowed, true) ? $source : 'lainnya';
}

function assetFundingSourceRequiresDocument(string $source): bool
{
    return in_array($source, ['dana_bos', 'hibah', 'apbd'], true);
}
