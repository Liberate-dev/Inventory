<?php
// Make relative includes in legacy PHP endpoints resolve from each script directory.
if (isset($_SERVER['SCRIPT_FILENAME'])) {
    $scriptDir = dirname($_SERVER['SCRIPT_FILENAME']);
    if (is_dir($scriptDir)) {
        chdir($scriptDir);
    }
}
