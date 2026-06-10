<?php

function inventoryTableExists(PDO $db, string $tableName): bool
{
    $stmt = $db->prepare("SHOW TABLES LIKE ?");
    $stmt->execute([$tableName]);
    return (bool) $stmt->fetch(PDO::FETCH_NUM);
}

function inventoryColumnExists(PDO $db, string $tableName, string $columnName): bool
{
    $allowedTables = ['rooms', 'containers', 'items'];
    if (!in_array($tableName, $allowedTables, true)) {
        return false;
    }

    $stmt = $db->prepare("SHOW COLUMNS FROM `{$tableName}` LIKE ?");
    $stmt->execute([$columnName]);
    return (bool) $stmt->fetch(PDO::FETCH_ASSOC);
}

function inventoryExecIgnore(PDO $db, string $sql): void
{
    try {
        $db->exec($sql);
    } catch (Throwable $e) {
        // A concurrent request may have already applied this compatibility change.
    }
}

function inventoryEnsureColumn(PDO $db, string $tableName, string $columnName, string $definition, string $afterColumn): void
{
    if (!inventoryTableExists($db, $tableName) || inventoryColumnExists($db, $tableName, $columnName)) {
        return;
    }

    inventoryExecIgnore(
        $db,
        "ALTER TABLE `{$tableName}` ADD COLUMN `{$columnName}` {$definition} AFTER `{$afterColumn}`"
    );
}

function ensureInventorySoftDeleteColumns(PDO $db): void
{
    $columns = [
        'rooms' => 'created_at',
        'containers' => 'created_at',
        'items' => 'updated_at',
    ];

    foreach ($columns as $tableName => $afterColumn) {
        if (!inventoryTableExists($db, $tableName) || inventoryColumnExists($db, $tableName, 'deleted_at')) {
            continue;
        }

        inventoryExecIgnore(
            $db,
            "ALTER TABLE `{$tableName}` ADD COLUMN `deleted_at` TIMESTAMP NULL DEFAULT NULL AFTER `{$afterColumn}`"
        );
    }

    inventoryEnsureColumn($db, 'items', 'source', 'VARCHAR(100) DEFAULT NULL', 'min_stock');
    inventoryEnsureColumn($db, 'items', 'acquisition_date', 'DATE DEFAULT NULL', 'source');
    inventoryEnsureColumn($db, 'items', 'acquisition_cost', 'DECIMAL(15,2) DEFAULT NULL', 'acquisition_date');
}

/**
 * Ensures the item_types master table exists (for the new "Item" + "Label" model).
 * This allows Manajemen Barang to manage item types, and containers to reference them.
 */
function ensureItemTypesTable(PDO $db): void
{
    if (inventoryTableExists($db, 'item_types')) {
        return;
    }

    $sql = <<<SQL
CREATE TABLE `item_types` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `type` varchar(100) NOT NULL,
  `category` varchar(50) DEFAULT NULL,
  `specs` text DEFAULT NULL,
  `parameters` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`parameters`)),
  `image_url` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
SQL;

    inventoryExecIgnore($db, $sql);
}

/**
 * Ensures items table has the item_type_id column (and supporting index/FK if possible).
 * Safe to call on existing databases — uses the compat ignore pattern.
 */
function ensureItemsItemTypeColumn(PDO $db): void
{
    // Try to add the column (the helper tries AFTER a known column; we also have a fallback)
    inventoryEnsureColumn($db, 'items', 'item_type_id', 'int(11) DEFAULT NULL', 'deleted_at');

    // Fallback: if the column still doesn't exist (e.g. very old schema without 'deleted_at'), add it at the end
    if (!inventoryColumnExists($db, 'items', 'item_type_id')) {
        inventoryExecIgnore($db, "ALTER TABLE `items` ADD COLUMN `item_type_id` int(11) DEFAULT NULL");
    }

    // Add the index (ignore duplicate key errors)
    inventoryExecIgnore($db, "ALTER TABLE `items` ADD KEY `item_type_id` (`item_type_id`)");

    // Add the foreign key (ignore if already present or if there are existing rows that would violate)
    inventoryExecIgnore($db, "ALTER TABLE `items` ADD CONSTRAINT `fk_item_item_type` FOREIGN KEY (`item_type_id`) REFERENCES `item_types` (`id`) ON DELETE SET NULL");
}

/**
 * One-call helper for the full item_types integration schema.
 * Call this early in item_types.php and in rooms.php item-handling paths.
 */
function ensureItemTypesSchema(PDO $db): void
{
    ensureItemTypesTable($db);
    ensureItemsItemTypeColumn($db);
}

/**
 * Ensure a simple categories table for "Manajemen Kategori Barang" in Manajemen Barang.
 * Categories are managed centrally and used as dropdown when creating item types and labels.
 */
function ensureCategoriesTable(PDO $db): void
{
    if (inventoryTableExists($db, 'item_categories')) {
        return;
    }

    $sql = <<<SQL
CREATE TABLE `item_categories` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
SQL;

    inventoryExecIgnore($db, $sql);
}

function ensureCategoriesSchema(PDO $db): void
{
    ensureCategoriesTable($db);
}

/**
 * Events table for real-time push notifications (SSE) so all clients can auto-sync
 * changes (categories, item types, rooms/items) without client polling or manual refresh.
 */
function ensureInventoryEventsTable(PDO $db): void
{
    if (inventoryTableExists($db, 'inventory_events')) {
        return;
    }

    $sql = <<<SQL
CREATE TABLE `inventory_events` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `event_type` varchar(64) NOT NULL,
  `payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`payload`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_event_type` (`event_type`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
SQL;

    inventoryExecIgnore($db, $sql);
}

function ensureInventoryEventsSchema(PDO $db): void
{
    ensureInventoryEventsTable($db);
}
