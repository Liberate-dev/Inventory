-- =====================================================
-- ASSET ACCOUNTING MODULE - SEED DATA
-- =====================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;

-- --------------------------------------------------------
-- Admin Non-Lab user (required by sample asset seed data)
-- --------------------------------------------------------
INSERT INTO `users` (`id`, `username`, `password`, `email`, `name`, `phone`, `role`, `lab_scope`, `avatar_url`, `created_at`) VALUES
(16, 'admin_nl', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'adminnl@school.com', 'Admin Non Lab', '081200000016', 'admin_nl', NULL, NULL, '2026-03-01 07:00:00')
ON DUPLICATE KEY UPDATE `role` = 'admin_nl';

-- --------------------------------------------------------
-- Default Asset Categories
-- --------------------------------------------------------
INSERT INTO `asset_categories` (`name`, `gl_account_code`, `accumulated_dep_account_code`, `depreciation_expense_account_code`, `default_depreciation_method`, `default_useful_life_months`, `default_salvage_value_pct`, `default_depreciation_rate`, `capitalization_threshold`, `is_depreciable`, `is_active`) VALUES
('Tanah', '1200', NULL, NULL, 'straight_line', 0, 100.00, NULL, 0.00, 0, 1),
('Bangunan & Gedung', '1300', '1301', '5704', 'straight_line', 240, 0.00, NULL, 10000000.00, 1, 1),
('Peralatan Komputer & IT', '1600', '1601', '5700', 'straight_line', 48, 0.00, NULL, 1000000.00, 1, 1),
('Perabot & Furnitur', '1400', '1401', '5703', 'straight_line', 60, 0.00, NULL, 500000.00, 1, 1),
('Peralatan Laboratorium', '1500', '1501', '5702', 'straight_line', 96, 0.00, NULL, 1000000.00, 1, 1),
('Peralatan Olahraga', '1402', '1403', '5706', 'straight_line', 60, 0.00, NULL, 500000.00, 1, 1),
('Kendaraan Operasional', '1700', '1701', '5701', 'declining_balance', 96, 10.00, 25.00, 5000000.00, 1, 1),
('Peralatan Dapur/UKS', '1406', '1407', '5708', 'straight_line', 60, 0.00, NULL, 300000.00, 1, 1),
('Buku Perpustakaan', '1800', '1801', '5709', 'straight_line', 60, 0.00, NULL, 100000.00, 1, 1),
('Aset Lainnya', '1900', '1901', '5799', 'straight_line', 60, 0.00, NULL, 500000.00, 1, 1)
ON DUPLICATE KEY UPDATE `name` = `name`;

-- --------------------------------------------------------
-- Asset Configuration
-- --------------------------------------------------------
INSERT INTO `asset_config` (`config_key`, `config_value`, `description`) VALUES
-- Konvensi kapan penyusutan mulai (next_month = bulan berikutnya setelah perolehan)
('dep_start_convention', 'acquisition_month', 'Kapan penyusutan mulai: acquisition_month atau next_month'),
-- Bulan pertama tahun fiskal sekolah (7 = Juli)
('fiscal_year_start_month', '7', 'Bulan pertama tahun fiskal sekolah'),
-- Level jurnal (by_category = satu jurnal per kategori aset)
('journal_level', 'by_category', 'Level jurnal: total, by_category, atau by_asset'),
-- Apakah disposal butuh approval
('require_disposal_approval', 'true', 'Apakah pelepasan aset butuh approval'),
-- Role minimum untuk approve disposal
('disposal_approval_role', 'kepala_sekolah', 'Role yang bisa menyetujui pelepasan aset'),
-- Aktifkan fitur stock opname
('enable_opname', 'false', 'Aktifkan fitur stock opname'),
-- Frekuensi opname (dalam bulan)
('opname_frequency_months', '12', 'Frekuensi opname yang direkomendasikan'),
-- Asset number sequence - reset each year
('asset_sequence_year', '2026', 'Tahun terakhir sequence number'),
('asset_sequence_next', '6', 'Next sequence number')
ON DUPLICATE KEY UPDATE `config_value` = `config_value`;

-- --------------------------------------------------------
-- Document Number Configuration
-- --------------------------------------------------------
INSERT INTO `asset_document_number_settings`
    (`id`, `prefix`, `separator`, `year_format`, `sequence_padding`, `next_number`)
VALUES
    (1, 'DOC', '-', '4', 4, 6)
ON DUPLICATE KEY UPDATE `id` = `id`;

UPDATE `asset_config`
SET `config_value` = '6'
WHERE `config_key` = 'asset_sequence_next'
  AND CAST(`config_value` AS UNSIGNED) < 6;

UPDATE `asset_document_number_settings`
SET `next_number` = GREATEST(`next_number`, 6)
WHERE `id` = 1;

-- --------------------------------------------------------
-- Sample Fixed Assets
-- --------------------------------------------------------
INSERT INTO `assets` (
    `asset_number`, `name`, `description`, `asset_category_id`, `inventory_item_id`,
    `acquisition_date`, `acquisition_cost`, `salvage_value`, `depreciable_amount`,
    `depreciation_method`, `useful_life_months`, `depreciation_rate`, `depreciation_start_date`,
    `location_id`, `responsible_user_id`, `condition`, `status`, `document_reference`,
    `funding_source`, `vendor_name`, `notes`, `created_by`, `approved_by`, `created_at`
) VALUES
(
    'AST-2026-0001', 'Server Rack Pembelajaran Digital',
    'Server utama untuk LMS lokal, penyimpanan materi, dan manajemen komputer lab.',
    (SELECT `id` FROM `asset_categories` WHERE `name` = 'Peralatan Komputer & IT' ORDER BY `id` ASC LIMIT 1),
    4, '2026-03-15', 45000000.00, 0.00, 45000000.00,
    'straight_line', 48, NULL, '2026-03-15',
    1, 11, 'new', 'active', 'DOC-2026-0001',
    'dana_bos', 'CV Teknologi Edukasi', 'Aset prioritas untuk Lab Komputer 1.', 16, 4, '2026-03-15 09:00:00'
),
(
    'AST-2026-0002', 'Mikroskop Trinokuler Digital',
    'Mikroskop trinokuler dengan kamera dokumentasi praktikum biologi.',
    (SELECT `id` FROM `asset_categories` WHERE `name` = 'Peralatan Laboratorium' ORDER BY `id` ASC LIMIT 1),
    NULL, '2025-08-20', 32000000.00, 0.00, 32000000.00,
    'straight_line', 96, NULL, '2025-08-20',
    4, 13, 'good', 'active', 'DOC-2025-0018',
    'hibah', 'PT Sains Nusantara', 'Hibah program peningkatan fasilitas laboratorium.', 16, 4, '2025-08-20 10:00:00'
),
(
    'AST-2026-0003', 'Lemari Arsip Tahan Api',
    'Lemari arsip dokumen keuangan dan dokumen penting sekolah.',
    (SELECT `id` FROM `asset_categories` WHERE `name` = 'Perabot & Furnitur' ORDER BY `id` ASC LIMIT 1),
    NULL, '2022-07-05', 8500000.00, 0.00, 8500000.00,
    'straight_line', 60, NULL, '2022-07-05',
    15, 14, 'good', 'active', 'DOC-2022-0041',
    'dana_komite', 'Mitra Office Furniture', 'Digunakan oleh Tata Usaha.', 16, 4, '2022-07-05 13:30:00'
),
(
    'AST-2026-0004', 'Bed Pemeriksaan UKS Elektrik',
    'Tempat pemeriksaan pasien UKS dengan pengaturan elektrik.',
    (SELECT `id` FROM `asset_categories` WHERE `name` = 'Peralatan Dapur/UKS' ORDER BY `id` ASC LIMIT 1),
    NULL, '2020-02-12', 12000000.00, 0.00, 12000000.00,
    'straight_line', 60, NULL, '2020-02-12',
    19, 3, 'fair', 'fully_depreciated', 'DOC-2020-0009',
    'apbd', 'CV Medika Sekolah', 'Masih digunakan, masuk daftar evaluasi penggantian.', 16, 4, '2020-02-12 08:30:00'
),
(
    'AST-2026-0005', 'Sepeda Motor Operasional Lama',
    'Kendaraan operasional sarpras untuk pengadaan dan pengiriman ringan.',
    (SELECT `id` FROM `asset_categories` WHERE `name` = 'Kendaraan Operasional' ORDER BY `id` ASC LIMIT 1),
    NULL, '2018-08-10', 18000000.00, 1800000.00, 16200000.00,
    'declining_balance', 96, 25.00, '2018-08-10',
    17, 3, 'damaged', 'disposed', 'DOC-2018-0027',
    'yayasan', 'Dealer Maju Motor', 'Dilepas karena biaya perawatan tidak ekonomis.', 16, 4, '2018-08-10 11:00:00'
)
ON DUPLICATE KEY UPDATE `asset_number` = `asset_number`;

-- --------------------------------------------------------
-- Sample Posted Depreciation Journal and Schedules
-- --------------------------------------------------------
INSERT INTO `journal_entries` (
    `journal_number`, `entry_date`, `period_year`, `period_month`, `type`,
    `reference_type`, `description`, `total_debit`, `total_credit`, `status`,
    `created_by`, `posted_by`, `posted_at`, `created_at`
) VALUES
(
    'JRN-2026-05-0001', '2026-05-31', 2026, 5, 'depreciation',
    'depreciation_runs', 'Posting penyusutan aset tetap periode Mei 2026',
    1412500.00, 1412500.00, 'posted', 16, 16, '2026-05-31 16:00:00', '2026-05-31 15:45:00'
)
ON DUPLICATE KEY UPDATE `journal_number` = `journal_number`;

INSERT INTO `depreciation_schedules` (
    `asset_id`, `period_year`, `period_month`, `opening_book_value`,
    `depreciation_amount`, `accumulated_depreciation`, `closing_book_value`,
    `is_prorata`, `status`, `posted_at`, `journal_entry_id`
) VALUES
(
    (SELECT `id` FROM `assets` WHERE `asset_number` = 'AST-2026-0001' LIMIT 1),
    2026, 3, 45000000.00, 937500.00, 937500.00, 44062500.00, 1, 'posted', '2026-03-31 16:00:00',
    (SELECT `id` FROM `journal_entries` WHERE `journal_number` = 'JRN-2026-05-0001' LIMIT 1)
),
(
    (SELECT `id` FROM `assets` WHERE `asset_number` = 'AST-2026-0001' LIMIT 1),
    2026, 4, 44062500.00, 937500.00, 1875000.00, 43125000.00, 0, 'posted', '2026-04-30 16:00:00',
    (SELECT `id` FROM `journal_entries` WHERE `journal_number` = 'JRN-2026-05-0001' LIMIT 1)
),
(
    (SELECT `id` FROM `assets` WHERE `asset_number` = 'AST-2026-0001' LIMIT 1),
    2026, 5, 43125000.00, 937500.00, 2812500.00, 42187500.00, 0, 'posted', '2026-05-31 16:00:00',
    (SELECT `id` FROM `journal_entries` WHERE `journal_number` = 'JRN-2026-05-0001' LIMIT 1)
),
(
    (SELECT `id` FROM `assets` WHERE `asset_number` = 'AST-2026-0002' LIMIT 1),
    2026, 5, 32000000.00, 333333.33, 333333.33, 31666666.67, 0, 'posted', '2026-05-31 16:00:00',
    (SELECT `id` FROM `journal_entries` WHERE `journal_number` = 'JRN-2026-05-0001' LIMIT 1)
),
(
    (SELECT `id` FROM `assets` WHERE `asset_number` = 'AST-2026-0003' LIMIT 1),
    2026, 5, 8500000.00, 141666.67, 141666.67, 8358333.33, 0, 'posted', '2026-05-31 16:00:00',
    (SELECT `id` FROM `journal_entries` WHERE `journal_number` = 'JRN-2026-05-0001' LIMIT 1)
),
(
    (SELECT `id` FROM `assets` WHERE `asset_number` = 'AST-2026-0004' LIMIT 1),
    2025, 2, 200000.00, 200000.00, 12000000.00, 0.00, 0, 'posted', '2025-02-28 16:00:00',
    NULL
)
ON DUPLICATE KEY UPDATE `status` = `status`;

-- --------------------------------------------------------
-- Sample Disposal
-- --------------------------------------------------------
INSERT INTO `asset_disposals` (
    `asset_id`, `disposal_date`, `disposal_method`, `disposal_reason`,
    `book_value_at_disposal`, `accumulated_dep_at_disposal`, `proceeds`,
    `surplus_deficit`, `surplus_deficit_account_code`, `document_reference`,
    `approved_by`, `created_by`, `created_at`
) VALUES
(
    (SELECT `id` FROM `assets` WHERE `asset_number` = 'AST-2026-0005' LIMIT 1),
    '2026-04-15', 'sold', 'Kendaraan lama dijual setelah evaluasi biaya perawatan.',
    1800000.00, 16200000.00, 2000000.00, 200000.00, '4900',
    'BA-LEPAS-2026-0001', 4, 16, '2026-04-15 14:00:00'
)
ON DUPLICATE KEY UPDATE `asset_id` = `asset_id`;

COMMIT;
