import { useState } from 'react';
import { Download, TrendingUp, AlertTriangle, FileText } from 'lucide-react';

interface Log {
    id: string;
    item: string;
    action: string;
    date: string;
    status: 'good' | 'warning' | 'bad';
}

const MOCK_LOGS: Log[] = [
    { id: '1', item: 'Microscope B-20', action: 'Reported Broken', date: '2026-01-20', status: 'bad' },
    { id: '2', item: 'PC Station 04', action: 'Maintenance Completed', date: '2026-01-18', status: 'good' },
    { id: '3', item: 'Erlenmeyer Flask', action: 'Stock Added (+10)', date: '2026-01-15', status: 'good' },
    { id: '4', item: 'Projector P-01', action: 'Checked Out', date: '2026-01-10', status: 'warning' },
];

const ReportPage = () => {
    const [selectedMonth, setSelectedMonth] = useState('2026-01');

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto print:max-w-none print:p-0">
            <div className="flex justify-between items-center print:hidden">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Monthly Inventory Report</h2>
                    <p className="text-gray-500">Usage history, maintenance, and stock movement.</p>
                </div>
                <div className="flex gap-3">
                    <input
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="border border-gray-200 rounded-xl px-4 py-2 bg-white"
                    />
                    <button
                        onClick={handlePrint}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold shadow-lg shadow-indigo-200"
                    >
                        <Download size={20} /> Export / Print
                    </button>
                </div>
            </div>

            {/* Print Header */}
            <div className="hidden print:block text-center mb-8 border-b-2 border-gray-800 pb-4">
                <h1 className="text-3xl font-bold">Portal Inventory Panderman</h1>
                <p className="text-xl text-gray-600">Monthly Activity Report - {selectedMonth}</p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-6 print:grid-cols-3">
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm print:border-gray-300">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
                            <TrendingUp size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 font-medium uppercase">Stock In</p>
                            <h3 className="text-2xl font-bold text-gray-900">14 Items</h3>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm print:border-gray-300">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center">
                            <AlertTriangle size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 font-medium uppercase">Broken / Damaged</p>
                            <h3 className="text-2xl font-bold text-gray-900">3 Items</h3>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm print:border-gray-300">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                            <FileText size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 font-medium uppercase">Total Reports</p>
                            <h3 className="text-2xl font-bold text-gray-900">28 Actions</h3>
                        </div>
                    </div>
                </div>
            </div>

            {/* Activity Log Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden print:border-gray-300">
                <div className="p-6 border-b border-gray-100 bg-gray-50 print:bg-white print:border-b-2 print:border-gray-300">
                    <h3 className="font-bold text-lg text-gray-900">Activity Log & Stock Movement</h3>
                </div>
                <table className="w-full text-left">
                    <thead className="bg-gray-50 text-gray-500 font-semibold text-xs uppercase tracking-wider print:bg-gray-100">
                        <tr>
                            <th className="p-4">Date</th>
                            <th className="p-4">Item Name</th>
                            <th className="p-4">Action</th>
                            <th className="p-4 text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 print:divide-gray-300">
                        {MOCK_LOGS.map((log) => (
                            <tr key={log.id} className="hover:bg-gray-50 transition-colors print:hover:bg-transparent">
                                <td className="p-4 text-gray-600 font-mono text-sm">{log.date}</td>
                                <td className="p-4 font-bold text-gray-900">{log.item}</td>
                                <td className="p-4 text-gray-700">{log.action}</td>
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

            <div className="hidden print:flex mt-12 justify-between text-sm text-gray-500 pt-8 border-t border-gray-300">
                <div>Printed on: {new Date().toLocaleDateString()}</div>
                <div>Authorized Signature: _______________________</div>
            </div>
        </div>
    );
};

export default ReportPage;
