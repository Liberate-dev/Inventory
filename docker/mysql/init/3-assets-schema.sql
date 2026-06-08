-- =====================================================
-- ASSET ACCOUNTING MODULE - PHASE 1 CORE TABLES
-- =====================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;

-- --------------------------------------------------------
-- 1. asset_categories
-- --------------------------------------------------------
CREATE TABLE `asset_categories` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL,
    `gl_account_code` VARCHAR(20) DEFAULT NULL COMMENT 'Kode akun buku besar untuk aset jenis ini',
    `accumulated_dep_account_code` VARCHAR(20) DEFAULT NULL COMMENT 'Kode akun akumulasi penyusutan',
    `depreciation_expense_account_code` VARCHAR(20) DEFAULT NULL COMMENT 'Kode akun beban penyusutan',
    `default_depreciation_method` ENUM('straight_line', 'declining_balance', 'units_of_production', 'sum_of_years') NOT NULL DEFAULT 'straight_line',
    `default_useful_life_months` INT UNSIGNED NOT NULL DEFAULT 48,
    `default_salvage_value_pct` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    `default_depreciation_rate` DECIMAL(5,2) DEFAULT NULL COMMENT 'Untuk metode saldo menurun',
    `capitalization_threshold` DECIMAL(15,2) NOT NULL DEFAULT 1000000.00,
    `is_depreciable` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'False untuk tanah',
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` TIMESTAMP NOT NULL DEFAULT current_timestamp(),
    `updated_at` TIMESTAMP NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- 2. assets
-- --------------------------------------------------------
CREATE TABLE `assets` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `asset_number` VARCHAR(30) NOT NULL COMMENT 'Format: AST-YYYY-NNNN',
    `name` VARCHAR(200) NOT NULL,
    `description` TEXT DEFAULT NULL,
    `asset_category_id` INT UNSIGNED DEFAULT NULL,
    `inventory_item_id` INT DEFAULT NULL COMMENT 'FK ke items (opsional)',
    `acquisition_date` DATE NOT NULL,
    `acquisition_cost` DECIMAL(15,2) NOT NULL,
    `salvage_value` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    `depreciable_amount` DECIMAL(15,2) NOT NULL COMMENT 'acquisition_cost - salvage_value',
    `depreciation_method` ENUM('straight_line', 'declining_balance', 'units_of_production', 'sum_of_years') NOT NULL DEFAULT 'straight_line',
    `useful_life_months` INT UNSIGNED NOT NULL DEFAULT 48,
    `depreciation_rate` DECIMAL(5,2) DEFAULT NULL COMMENT 'Untuk metode saldo menurun',
    `depreciation_start_date` DATE NOT NULL,
    `location_id` INT DEFAULT NULL COMMENT 'FK ke rooms',
    `responsible_user_id` INT DEFAULT NULL COMMENT 'FK ke users',
    `condition` ENUM('new', 'good', 'fair', 'damaged') NOT NULL DEFAULT 'good',
    `status` ENUM('active', 'inactive', 'fully_depreciated', 'disposed') NOT NULL DEFAULT 'active',
    `inactive_reason` TEXT DEFAULT NULL,
    `inactive_date` DATE DEFAULT NULL,
    `document_reference` VARCHAR(100) DEFAULT NULL,
    `funding_source` ENUM('dana_bos', 'dana_komite', 'hibah', 'apbd', 'yayasan', 'lainnya') NOT NULL DEFAULT 'lainnya',
    `vendor_name` VARCHAR(200) DEFAULT NULL,
    `notes` TEXT DEFAULT NULL,
    `created_by` INT DEFAULT NULL,
    `approved_by` INT DEFAULT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT current_timestamp(),
    `updated_at` TIMESTAMP NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    CONSTRAINT `fk_asset_category` FOREIGN KEY (`asset_category_id`) REFERENCES `asset_categories`(`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_asset_location` FOREIGN KEY (`location_id`) REFERENCES `rooms`(`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_asset_responsible` FOREIGN KEY (`responsible_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_asset_created_by` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_asset_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    CONSTRAINT `uk_asset_number` UNIQUE (`asset_number`),
    CONSTRAINT `uk_asset_document_reference` UNIQUE (`document_reference`),
    CONSTRAINT `chk_acquisition_cost` CHECK (`acquisition_cost` > 0),
    CONSTRAINT `chk_salvage_not_more_than_cost` CHECK (`salvage_value` <= `acquisition_cost`),
    CONSTRAINT `chk_depreciation_start_after_acquisition` CHECK (`depreciation_start_date` >= `acquisition_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- 3. depreciation_schedules
-- --------------------------------------------------------
CREATE TABLE `depreciation_schedules` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `asset_id` INT UNSIGNED NOT NULL,
    `period_year` INT UNSIGNED NOT NULL,
    `period_month` TINYINT UNSIGNED NOT NULL,
    `opening_book_value` DECIMAL(15,2) NOT NULL,
    `depreciation_amount` DECIMAL(15,2) NOT NULL,
    `accumulated_depreciation` DECIMAL(15,2) NOT NULL,
    `closing_book_value` DECIMAL(15,2) NOT NULL,
    `is_prorata` TINYINT(1) NOT NULL DEFAULT 0,
    `prorata_days` INT DEFAULT NULL,
    `status` ENUM('scheduled', 'posted', 'voided', 'adjusted') NOT NULL DEFAULT 'scheduled',
    `posted_at` TIMESTAMP NULL DEFAULT NULL,
    `journal_entry_id` INT UNSIGNED DEFAULT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT current_timestamp(),
    CONSTRAINT `fk_schedule_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE CASCADE,
    CONSTRAINT `uk_schedule_asset_period` UNIQUE (`asset_id`, `period_year`, `period_month`),
    CONSTRAINT `chk_period_month` CHECK (`period_month` BETWEEN 1 AND 12)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- 4. depreciation_runs
-- --------------------------------------------------------
CREATE TABLE `depreciation_runs` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `period_year` INT UNSIGNED NOT NULL,
    `period_month` TINYINT UNSIGNED NOT NULL,
    `status` ENUM('draft', 'reviewed', 'posted', 'cancelled') NOT NULL DEFAULT 'draft',
    `total_assets_processed` INT NOT NULL DEFAULT 0,
    `total_depreciation_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    `run_by` INT DEFAULT NULL,
    `reviewed_by` INT DEFAULT NULL,
    `posted_by` INT DEFAULT NULL,
    `run_at` TIMESTAMP NOT NULL DEFAULT current_timestamp(),
    `posted_at` TIMESTAMP NULL DEFAULT NULL,
    `journal_entry_id` INT UNSIGNED DEFAULT NULL,
    `notes` TEXT DEFAULT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT current_timestamp(),
    `updated_at` TIMESTAMP NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    CONSTRAINT `fk_run_by` FOREIGN KEY (`run_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_run_reviewed` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_run_posted` FOREIGN KEY (`posted_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    CONSTRAINT `uk_run_period_posted` UNIQUE (`period_year`, `period_month`, `status`) COMMENT 'Hanya satu run posted per periode',
    CONSTRAINT `chk_run_period_month` CHECK (`period_month` BETWEEN 1 AND 12)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- 5a. asset_disposals
-- --------------------------------------------------------
CREATE TABLE `asset_disposals` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- 5. depreciation_run_items
-- --------------------------------------------------------
CREATE TABLE `depreciation_run_items` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `depreciation_run_id` INT UNSIGNED NOT NULL,
    `asset_id` INT UNSIGNED NOT NULL,
    `depreciation_schedule_id` INT UNSIGNED NOT NULL,
    `depreciation_amount` DECIMAL(15,2) NOT NULL,
    `is_included` TINYINT(1) NOT NULL DEFAULT 1,
    `exclusion_reason` TEXT DEFAULT NULL,
    `override_amount` DECIMAL(15,2) DEFAULT NULL,
    `override_reason` TEXT DEFAULT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT current_timestamp(),
    CONSTRAINT `fk_item_run` FOREIGN KEY (`depreciation_run_id`) REFERENCES `depreciation_runs`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_item_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_item_schedule` FOREIGN KEY (`depreciation_schedule_id`) REFERENCES `depreciation_schedules`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- 6. journal_entries
-- --------------------------------------------------------
CREATE TABLE `journal_entries` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `journal_number` VARCHAR(30) NOT NULL COMMENT 'Format: JRN-YYYY-MM-NNNN',
    `entry_date` DATE NOT NULL,
    `period_year` INT UNSIGNED NOT NULL,
    `period_month` TINYINT UNSIGNED NOT NULL,
    `type` ENUM('acquisition', 'depreciation', 'disposal', 'improvement', 'adjustment') NOT NULL,
    `reference_id` INT UNSIGNED DEFAULT NULL COMMENT 'ID dari tabel sumber',
    `reference_type` VARCHAR(50) DEFAULT NULL COMMENT 'Nama tabel sumber',
    `description` TEXT DEFAULT NULL,
    `total_debit` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    `total_credit` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    `status` ENUM('draft', 'posted') NOT NULL DEFAULT 'draft',
    `created_by` INT DEFAULT NULL,
    `posted_by` INT DEFAULT NULL,
    `posted_at` TIMESTAMP NULL DEFAULT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT current_timestamp(),
    CONSTRAINT `fk_journal_created` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_journal_posted` FOREIGN KEY (`posted_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    CONSTRAINT `uk_journal_number` UNIQUE (`journal_number`),
    CONSTRAINT `chk_journal_balanced` CHECK (`total_debit` = `total_credit`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- 7. journal_entry_lines
-- --------------------------------------------------------
CREATE TABLE `journal_entry_lines` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `journal_entry_id` INT UNSIGNED NOT NULL,
    `line_number` INT UNSIGNED NOT NULL DEFAULT 1,
    `account_code` VARCHAR(20) NOT NULL,
    `account_name` VARCHAR(100) DEFAULT NULL COMMENT 'Snapshot nama akun saat posting',
    `debit_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    `credit_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    `asset_id` INT UNSIGNED DEFAULT NULL COMMENT 'NULL jika baris agregat',
    `description` TEXT DEFAULT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT current_timestamp(),
    CONSTRAINT `fk_line_journal` FOREIGN KEY (`journal_entry_id`) REFERENCES `journal_entries`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_line_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE SET NULL,
    CONSTRAINT `chk_debit_or_credit` CHECK ((`debit_amount` > 0 AND `credit_amount` = 0) OR (`debit_amount` = 0 AND `credit_amount` > 0) OR (`debit_amount` = 0 AND `credit_amount` = 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- 8. asset_audit_log (IMMUTABLE - hanya INSERT)
-- --------------------------------------------------------
CREATE TABLE `asset_audit_log` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `asset_id` INT UNSIGNED DEFAULT NULL,
    `event_type` ENUM('created', 'updated', 'depreciation_posted', 'disposal', 'improvement', 'location_changed', 'status_changed', 'document_uploaded', 'approval_granted', 'approval_rejected', 'schedule_regenerated', 'reactivated') NOT NULL,
    `event_description` TEXT DEFAULT NULL,
    `field_changed` VARCHAR(100) DEFAULT NULL,
    `old_value` TEXT DEFAULT NULL,
    `new_value` TEXT DEFAULT NULL,
    `reference_id` INT UNSIGNED DEFAULT NULL,
    `reference_type` VARCHAR(50) DEFAULT NULL,
    `performed_by` INT DEFAULT NULL,
    `ip_address` VARCHAR(45) DEFAULT NULL,
    `user_agent` TEXT DEFAULT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT current_timestamp(),
    CONSTRAINT `fk_audit_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_audit_performed` FOREIGN KEY (`performed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
    -- NOTE: Buat database user terpisah dengan hanya INSERT + SELECT pada tabel ini
    -- untuk enforce immutability di level database
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- 9. asset_config
-- --------------------------------------------------------
CREATE TABLE `asset_config` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `config_key` VARCHAR(100) NOT NULL,
    `config_value` VARCHAR(255) NOT NULL,
    `description` TEXT DEFAULT NULL,
    `updated_at` TIMESTAMP NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    CONSTRAINT `uk_config_key` UNIQUE (`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- 10. asset_document_number_settings
-- --------------------------------------------------------
CREATE TABLE `asset_document_number_settings` (
    `id` TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    `prefix` VARCHAR(20) NOT NULL DEFAULT 'DOC',
    `separator` VARCHAR(3) NOT NULL DEFAULT '-',
    `year_format` ENUM('none', '2', '4') NOT NULL DEFAULT '4',
    `sequence_padding` TINYINT UNSIGNED NOT NULL DEFAULT 4,
    `next_number` INT UNSIGNED NOT NULL DEFAULT 1,
    `updated_at` TIMESTAMP NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Indexes untuk performa
-- --------------------------------------------------------
CREATE INDEX `idx_assets_category` ON `assets`(`asset_category_id`);
CREATE INDEX `idx_assets_status` ON `assets`(`status`);
CREATE INDEX `idx_assets_location` ON `assets`(`location_id`);
CREATE INDEX `idx_assets_responsible` ON `assets`(`responsible_user_id`);
CREATE INDEX `idx_schedules_asset` ON `depreciation_schedules`(`asset_id`);
CREATE INDEX `idx_schedules_status` ON `depreciation_schedules`(`status`);
CREATE INDEX `idx_schedules_period` ON `depreciation_schedules`(`period_year`, `period_month`);
CREATE INDEX `idx_runs_period` ON `depreciation_runs`(`period_year`, `period_month`);
CREATE INDEX `idx_run_items_run` ON `depreciation_run_items`(`depreciation_run_id`);
CREATE INDEX `idx_disposals_date` ON `asset_disposals`(`disposal_date`);
CREATE INDEX `idx_disposals_method` ON `asset_disposals`(`disposal_method`);
CREATE INDEX `idx_journal_period` ON `journal_entries`(`period_year`, `period_month`);
CREATE INDEX `idx_journal_type` ON `journal_entries`(`type`);
CREATE INDEX `idx_audit_asset` ON `asset_audit_log`(`asset_id`);
CREATE INDEX `idx_audit_event` ON `asset_audit_log`(`event_type`);
CREATE INDEX `idx_audit_created` ON `asset_audit_log`(`created_at`);

COMMIT;
