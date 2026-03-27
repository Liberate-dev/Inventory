<?php
$file = 'src/pages/admin/UserManagement.tsx';
$content = file_get_contents($file);

$search1 = "    sarpras: {\n        label: 'Sarana Prasarana',\n        color: 'bg-orange-100 text-orange-700',\n        icon: <Shield className=\"w-3.5 h-3.5\" />\n    }\n};";
$replace1 = "    sarpras: {\n        label: 'Sarana Prasarana',\n        color: 'bg-orange-100 text-orange-700',\n        icon: <Shield className=\"w-3.5 h-3.5\" />\n    },\n    admin_nl: {\n        label: 'Admin NL',\n        color: 'bg-indigo-100 text-indigo-700',\n        icon: <Shield className=\"w-3.5 h-3.5\" />\n    }\n};";

// There might be another place where role is selected. Let's find "value: 'kepala_lab'"
$search2 = "    { value: 'sarpras', label: 'Sarana Prasarana' }";
$replace2 = "    { value: 'sarpras', label: 'Sarana Prasarana' },\n    { value: 'admin_nl', label: 'Admin NL' }";

$content = str_replace($search1, $replace1, $content);
$content = str_replace($search2, $replace2, $content);

file_put_contents($file, $content);
echo "Frontend options updated with admin_nl\n";
