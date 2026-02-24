import { useState, useMemo } from 'react';
import { Download, TrendingUp, AlertTriangle, FileText } from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';

const ReportPage = () => {
    const { rooms } = useInventory();
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

    const handlePrint = () => {
        window.print();
    };
    // Aggregate logs for ALL rooms
    const { roomLogs, stats } = useMemo(() => {
        const logs: any[] = [];
        let stockInCount = 0;

        rooms.forEach((room) => {
            room.containers.forEach((container) => {
                container.items.forEach((item) => {
                    if (item.logs) {
                        item.logs.forEach((log) => {
                            if (log.date.startsWith(selectedMonth)) {
                                const status = item.condition === 'good' ? 'good' : item.condition === 'service' ? 'warning' : 'bad';
                                logs.push({
                                    id: log.id,
                                    date: log.date,
                                    roomName: room.name,
                                    item: item.name,
                                    action: log.action,
                                    status: status,
                                    details: log.details // Keep for tooltip if needed
                                });

                                if (log.action.toLowerCase().includes('add') || log.action.toLowerCase().includes('new')) stockInCount++;
                            }
                        });
                    }
                    // Current status adds to issues if bad
                    if (item.condition !== 'good') {
                        // This is current state, not historical log. For report, maybe we just count logs?
                        // Let's stick to log based stats for "Activity Report"
                    }
                });
            });
        });

        const sortedLogs = logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return {
            roomLogs: sortedLogs,
            stats: {
                totalActions: logs.length,
                issues: logs.filter(l => l.status === 'bad' || l.action === 'REPORT_ISSUE').length,
                stockIn: stockInCount
            }
        };
    }, [rooms, selectedMonth]);

    return (
        <div className="h-full flex flex-col bg-white border border-slate-200 rounded-2xl shadow-md shadow-blue-900/5 overflow-hidden print:border-none print:shadow-none">
            <div className="p-8 space-y-8 max-w-6xl mx-auto w-full overflow-y-auto">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h2 className="text-2xl font-extrabold text-[#000080] tracking-tight">Global Monthly Report</h2>
                        <p className="text-slate-500">Period: {new Date(selectedMonth).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p>
                    </div>
                    <div className="flex gap-3 print:hidden">
                        <input
                            type="month"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="border border-slate-200 rounded-xl px-4 py-2 bg-white outline-none focus:ring-2 focus:ring-[#000080]"
                        />
                        <button
                            onClick={handlePrint}
                            className="bg-[#000080] hover:bg-[#000060] text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold shadow-md shadow-blue-900/10 transition-all"
                        >
                            <Download size={20} /> Print Report
                        </button>
                    </div>
                </div>

                {/* Print Header */}
                <div className="hidden print:block text-center mb-8 border-b-2 border-gray-800 pb-4">
                    <h1 className="text-3xl font-bold">PORTAL INVENTORY SMPK SANTA MARIA 2 MALANG</h1>
                    <p className="text-xl text-slate-600">Global Activity Report</p>
                    <p className="text-sm text-slate-500">{selectedMonth}</p>
                </div>

                {roomLogs.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                        <p className="text-slate-500 font-medium">No activity recorded for this period.</p>
                    </div>
                ) : (
                    <>
                        {/* Stats Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 print:grid-cols-3">
                            <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100 print:border-gray-300">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-white text-emerald-600 rounded-xl flex items-center justify-center shadow-sm">
                                        <TrendingUp size={24} />
                                    </div>
                                    <div>
                                        <p className="text-sm text-emerald-700 font-medium uppercase">Stock / Additions</p>
                                        <h3 className="text-2xl font-bold text-emerald-900">{stats.stockIn} Items</h3>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-rose-50 p-6 rounded-2xl border border-rose-100 print:border-gray-300">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-white text-rose-600 rounded-xl flex items-center justify-center shadow-sm">
                                        <AlertTriangle size={24} />
                                    </div>
                                    <div>
                                        <p className="text-sm text-rose-700 font-medium uppercase">Issues / Incidents</p>
                                        <h3 className="text-2xl font-bold text-rose-900">{stats.issues} Events</h3>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 print:border-gray-300">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-white text-blue-600 rounded-xl flex items-center justify-center shadow-sm">
                                        <FileText size={24} />
                                    </div>
                                    <div>
                                        <p className="text-sm text-blue-700 font-medium uppercase">Total Actions</p>
                                        <h3 className="text-2xl font-bold text-blue-900">{stats.totalActions} Logs</h3>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Activity Log Table */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-md shadow-blue-900/5 overflow-hidden print:border-gray-300">
                            <div className="p-6 border-b border-slate-100 bg-slate-50 print:bg-white print:border-b-2 print:border-gray-300">
                                <h3 className="font-bold text-lg text-slate-900">Activity Log & Stock Movement</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50 text-slate-500 font-semibold text-xs uppercase tracking-wider print:bg-gray-100">
                                        <tr>
                                            <th className="p-4">Date</th>
                                            <th className="p-4">Room</th>
                                            <th className="p-4">Item Name</th>
                                            <th className="p-4">Action</th>
                                            <th className="p-4 text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 print:divide-gray-300">
                                        {roomLogs.map((log) => (
                                            <tr key={log.id} className="hover:bg-slate-50 transition-colors print:hover:bg-transparent">
                                                <td className="p-4 text-slate-600 font-mono text-sm whitespace-nowrap">{new Date(log.date).toLocaleDateString()}</td>
                                                <td className="p-4 text-slate-700 font-medium">{log.roomName}</td>
                                                <td className="p-4 font-bold text-slate-900">{log.item}</td>
                                                <td className="p-4 text-slate-700">
                                                    <span className="truncate max-w-[200px] block" title={log.action}>{log.action}</span>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide
                                                    ${log.status === 'good' ? 'bg-emerald-100 text-emerald-700 print:bg-transparent print:text-black' :
                                                            log.status === 'bad' ? 'bg-red-100 text-red-700 print:bg-transparent print:text-black' :
                                                                'bg-amber-100 text-amber-700 print:bg-transparent print:text-black'}`}>
                                                        {log.status === 'bad' ? 'Issue' : log.status === 'good' ? 'Normal' : 'Warning'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}

                <div className="hidden print:flex mt-12 justify-between text-sm text-gray-500 pt-8 border-t border-gray-300">
                    <div>Printed on: {new Date().toLocaleDateString()}</div>
                    <div>Authorized Signature: _______________________</div>
                </div>
            </div>
        </div>
    );
};

export default ReportPage;
