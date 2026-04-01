const fs = require('fs');
const filepath = 'e:/pklnew/src/pages/admin/OperationsPage.tsx';
let content = fs.readFileSync(filepath, 'utf-8');

// 1. Remove RecentActivityFeed usage
const recentFeedUsagePattern = /\s*<RecentActivityFeed \/>\r?\n/;
if (recentFeedUsagePattern.test(content)) {
    content = content.replace(recentFeedUsagePattern, '');
    console.log('Removed RecentActivityFeed usage');
}

// 2. Remove RecentActivityFeed component definition
// from `// ---------------------------------------------------------`
// `// Recent Activity Feed Component`
// to before `// HistoryModal Component`
const recentFeedDefPattern = /\/\/ ---------------------------------------------------------\r?\n\/\/ Recent Activity Feed Component[\s\S]*?(?=\/\/ ---------------------------------------------------------\r?\n\/\/ HistoryModal Component)/;
if (recentFeedDefPattern.test(content)) {
    content = content.replace(recentFeedDefPattern, '');
    console.log('Removed RecentActivityFeed definition');
}

// 3. Tab Labels
content = content.replace(
    '<ArrowRightLeft size={18} /> Transfer Aset',
    '<ArrowRightLeft size={18} /> Pemindahan Barang'
);
content = content.replace(
    '<ClipboardList size={18} /> Catat Penggunaan',
    '<ClipboardList size={18} /> Peminjaman/Pengembalian Barang'
);

// 4. Section Label
content = content.replace(
    'Aset yang Dipindahkan',
    'Barang yang Dipindahkan'
);

// 5. Button label
const btnPattern = /\{selectedItemIds\.length > 0 \? `Transfer \$\{selectedItemIds\.length\} Aset` : 'Pilih Aset Terlebih Dahulu'\}/;
content = content.replace(
    btnPattern,
    "{selectedItemIds.length > 0 ? `Pemindahan ${selectedItemIds.length} Barang` : 'Pilih Barang Terlebih Dahulu'}"
);

// 6. HistoryModal positioning
content = content.replace(
    'className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}',
    'className="fixed inset-0 z-[60] flex items-start justify-center pt-10 px-4 pb-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}'
);

fs.writeFileSync(filepath, content, 'utf-8');
console.log('Done refactoring strings in OperationsPage.tsx');
