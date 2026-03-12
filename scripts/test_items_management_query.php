<?php

declare(strict_types=1);

$source = file_get_contents(__DIR__ . '/../public/api/inventory/items_management.php');

if ($source === false) {
    fwrite(STDERR, "Unable to read items_management.php\n");
    exit(1);
}

$expected = "SELECT id, sku, name, `condition`, deleted_at FROM items WHERE id = ? LIMIT 1";

if (strpos($source, $expected) === false) {
    fwrite(STDERR, "Expected quoted `condition` column in item lookup query.\n");
    exit(1);
}

fwrite(STDOUT, "items_management query: ok\n");
