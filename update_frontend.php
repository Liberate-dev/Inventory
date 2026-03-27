<?php
$file = 'src/pages/admin/UserManagement.tsx';
$content = file_get_contents($file);

$search1 = "                                                : user.labScope === 'all'\n                                                    ? 'Semua Lab'\n                                                    : user.labScope || '-'";
$replace1 = "                                                : user.labScope === 'all'\n                                                    ? 'Semua Lab'\n                                                    : user.labScope === 'non-lab'\n                                                        ? 'Hanya Non-Lab'\n                                                        : user.labScope || '-'";

$search2 = "                            <option value=\"physics\">Hanya Lab Fisika</option>\n                        </select>";
$replace2 = "                            <option value=\"physics\">Hanya Lab Fisika</option>\n                            <option value=\"non-lab\">Hanya Non-Lab</option>\n                        </select>";

$content = str_replace($search1, $replace1, $content);
$content = str_replace($search2, $replace2, $content);

file_put_contents($file, $content);
echo "Frontend options updated\n";
