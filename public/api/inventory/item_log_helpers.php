<?php

function encodeItemLogDetails(array $details): string
{
    $payload = json_encode($details, JSON_UNESCAPED_UNICODE);
    if ($payload === false || $payload === null) {
        $payload = json_encode([]);
    }

    return $payload === false ? '{}' : $payload;
}

function insertItemLog(PDO $db, int $itemId, string $action, array $details, ?int $userId = null): void
{
    $stmt = $db->prepare(
        'INSERT INTO item_logs (item_id, user_id, action, date, details)
         VALUES (:item_id, :user_id, :action, NOW(), :details)'
    );

    $payload = encodeItemLogDetails($details);

    $stmt->bindValue(':item_id', $itemId, PDO::PARAM_INT);
    if ($userId === null) {
        $stmt->bindValue(':user_id', null, PDO::PARAM_NULL);
    } else {
        $stmt->bindValue(':user_id', $userId, PDO::PARAM_INT);
    }
    $stmt->bindValue(':action', $action, PDO::PARAM_STR);
    $stmt->bindValue(':details', $payload, PDO::PARAM_STR);
    $stmt->execute();
}
