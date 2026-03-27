const fs = require('fs');
const filepath = 'e:/pklnew/src/pages/admin/OperationsPage.tsx';
let content = fs.readFileSync(filepath, 'utf-8');

// Chunk 1: Replace placeholder with RecentActivityFeed
const from1_pattern = /<div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-center">\s*<Clock size=\{32\} className="mx-auto text-slate-300 mb-3" \/>\s*<p className="text-sm text-slate-500 font-medium">Buka <b className="text-slate-700">Riwayat Operasional<\/b> untuk melihat detail histori dan filter data secara lengkap\.<\/p>\s*<\/div>/;

const to1 = `<RecentActivityFeed />

                        <div className="mt-6 pt-4 border-t border-slate-100 text-center">
                            <button
                                onClick={() => setIsHistoryOpen(true)}
                                className="text-sm text-indigo-600 font-bold hover:text-indigo-700 flex items-center justify-center gap-2 w-full"
                            >
                                <History size={16} /> Lihat Semua Riwayat Operasional
                            </button>
                        </div>`;

if (from1_pattern.test(content)) {
    content = content.replace(from1_pattern, to1);
    console.log('Chunk 1 replaced');
} else {
    console.log('Chunk 1 NOT found');
}

// Chunk 2: Add RecentActivityFeed component before HistoryModal Component
const from2_pattern = /\/\/ ---------------------------------------------------------\r?\n\/\/ HistoryModal Component/;

const to2 = `// ---------------------------------------------------------
// Recent Activity Feed Component
// ---------------------------------------------------------
function RecentActivityFeed() {
    const { recentLogs, rooms } = useInventory();
    const { user } = useAuth();

    const isScopeRestricted = Boolean(user?.labScope && user?.labScope !== 'all' && user?.labScope !== 'non-lab');
    const scopedRooms = isScopeRestricted
        ? rooms.filter(r => r.type === user?.labScope)
        : rooms;

    const allowedRoomIds = new Set(scopedRooms.map(r => r.id));
    const operationalActions = new Set(['TRANSFER', 'CHECK_OUT', 'RETURNED']);

    const scopedRecentLogs = isScopeRestricted
        ? recentLogs.filter(entry => allowedRoomIds.has(entry.roomId))
        : recentLogs;
    
    const operationalLogs = scopedRecentLogs.filter((entry) => operationalActions.has(entry.log.action));
    const topLogs = operationalLogs.slice(0, 5); // Pick top 5 most recent

    if (topLogs.length === 0) return null;

    return (
        <div className="space-y-3 mt-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1 mb-2">Riwayat Terbaru</h4>
            {topLogs.map((entry, idx) => {
                const details = parseLogDetails(entry.log.details);
                return (
                    <div key={idx} className="bg-white p-3 rounded-xl border border-slate-100 flex items-start gap-3 shadow-sm hover:border-indigo-100 transition-colors">
                        <div className={\`mt-0.5 w-2.5 h-2.5 rounded-full shrink-0 \${entry.log.action === 'TRANSFER' ? 'bg-amber-400' :
                            entry.log.action === 'CHECK_OUT' ? 'bg-indigo-400' :
                                entry.log.action === 'RETURNED' ? 'bg-emerald-400' : 'bg-slate-300'
                            }\`} />
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-slate-700 truncate">{entry.itemName}</div>
                            <div className="text-[10px] uppercase font-bold text-indigo-600 mb-0.5 mt-0.5 bg-indigo-50 inline-block px-1.5 py-0.5 rounded">
                                {entry.log.action.replace('_', ' ')}
                            </div>
                            <div className="text-xs text-slate-500 line-clamp-2 mt-1">
                                {entry.log.action === 'TRANSFER' && \`Dari \${formatLocationLabel(details.from)} ke \${formatLocationLabel(details.to)}\`}
                                {entry.log.action === 'CHECK_OUT' && \`Peminjam: \${details.borrower ? String(details.borrower) : '-'} \\u2014 \${details.purpose ? String(details.purpose) : '-'}\`}
                                {entry.log.action === 'RETURNED' && \`Dikembalikan: \${details.returner ? String(details.returner) : '-'} (Kondisi: \${details.condition ? String(details.condition) : '-'})\`}
                            </div>
                            <div className="text-[10px] font-medium text-slate-400 mt-1.5 flex items-center gap-1">
                                <Clock size={10} />
                                {new Date(entry.log.date).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ---------------------------------------------------------
// HistoryModal Component`;

if (from2_pattern.test(content)) {
    content = content.replace(from2_pattern, to2);
    console.log('Chunk 2 replaced');
} else {
    console.log('Chunk 2 NOT found');
}

fs.writeFileSync(filepath, content, 'utf-8');
console.log('Done');
