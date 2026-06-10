import { useState, useEffect } from 'react';
import { Package, RefreshCw, Trash2, Undo, Search, Settings2, Tags, FileSpreadsheet } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAccessMatrix } from '../../context/AccessMatrixContext';
import { getAuthHeaders } from '../../utils/api';
import { ItemStatusBadge } from '../../components/common/ItemStatusBadge';
import { getProcurementDateFromLogs } from '../../utils/itemHistory';
import InventoryCodeManagementPage from './InventoryCodeManagementPage';
import PrintAssetsPage from './PrintAssetsPage';
import type { Item } from '../../types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/public/api');
const ITEMS_API_ENDPOINT = `${API_BASE_URL}/inventory/items_management.php`;

type ItemWithLocation = Item & {
    container_name?: string;
    room_name?: string;
    deleted_at?: string | null;
    created_at?: string;
};

const ItemManagementPage = ({ embedded = false }: { embedded?: boolean }) => {
    const { user } = useAuth();
    const { canEditFeature } = useAccessMatrix();
    const [searchParams, setSearchParams] = useSearchParams();
    
    // Manage active tab via URL search parameters
    const tabParam = searchParams.get('tab');
    const activeTab = (tabParam === 'codes' || tabParam === 'label' || tabParam === 'card') ? tabParam : 'items';
    
    const [items, setItems] = useState<ItemWithLocation[]>([]);
    const [loading, setLoading] = useState(false);
    const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'deleted'>('all');
    const [search, setSearch] = useState('');
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    const canManageItems = user ? canEditFeature('item_management', user.role) : false;

    const fetchItems = async () => {
        setLoading(true);
        setFeedback(null);
        try {
            const response = await fetch(ITEMS_API_ENDPOINT, {
                headers: getAuthHeaders()
            });
            const data = await response.json();
            if (!response.ok || data.status !== 'success') {
                throw new Error(data.message || 'Gagal memuat barang.');
            }
            setItems(data.items || []);
        } catch (err) {
            setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Terjadi kesalahan tidak diketahui' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'items') {
            void fetchItems();
        }
    }, [activeTab]);

    const handleAction = async (itemId: string, action: 'restore' | 'hard_delete' | 'soft_delete') => {
        if (action === 'hard_delete' && !confirm('Apakah Anda yakin ingin menghapus barang ini secara permanen?')) {
            return;
        }
        if (action === 'soft_delete' && !confirm('Apakah Anda yakin ingin menonaktifkan barang ini?')) {
            return;
        }

        try {
            const response = await fetch(ITEMS_API_ENDPOINT, {
                method: 'POST',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ item_id: itemId, action })
            });
            const data = await response.json();

            if (!response.ok || data.status !== 'success') {
                throw new Error(data.message || 'Aksi gagal dilaksanakan.');
            }

            setFeedback({ type: 'success', message: data.message });
            void fetchItems();
        } catch (err) {
            setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
        }

        setTimeout(() => setFeedback(null), 3000);
    };

    const formatDateId = (value?: string) => {
        if (!value || value === '-') return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('id-ID');
    };

    const filteredItems = items.filter(item => {
        if (filterStatus === 'active' && item.deleted_at) return false;
        if (filterStatus === 'deleted' && !item.deleted_at) return false;

        if (search) {
            const q = search.toLowerCase();
            return item.name.toLowerCase().includes(q) ||
                (item.sku && item.sku.toLowerCase().includes(q)) ||
                (item.room_name && item.room_name.toLowerCase().includes(q));
        }
        return true;
    });

    const handleTabChange = (tab: 'items' | 'codes' | 'label' | 'card') => {
        const nextParams = new URLSearchParams(searchParams);
        if (tab === 'items') {
            nextParams.delete('tab');
        } else {
            nextParams.set('tab', tab);
        }
        setSearchParams(nextParams, { replace: true });
    };

    return (
        <div className="space-y-6">
            {!embedded && (
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex flex-col gap-1">
                        <h2 className="text-2xl font-extrabold text-[#000080] tracking-tight">Manajemen Barang</h2>
                        <p className="text-sm text-slate-500">
                            Atur status barang, pantau barang yang telah dihapus, dan konfigurasikan kode inventaris.
                        </p>
                    </div>

                    <div className="inline-flex flex-wrap rounded-xl border border-slate-200 bg-slate-50 p-1 print:hidden self-start md:self-auto gap-1">
                        <button
                            onClick={() => handleTabChange('items')}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                                activeTab === 'items'
                                    ? 'bg-white shadow-sm text-[#000080]'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            <Package size={16} />
                            Daftar Item
                        </button>
                        <button
                            onClick={() => handleTabChange('codes')}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                                activeTab === 'codes'
                                    ? 'bg-white shadow-sm text-[#000080]'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            <Settings2 size={16} />
                            Kode Inventaris
                        </button>
                        <button
                            onClick={() => handleTabChange('label')}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                                activeTab === 'label'
                                    ? 'bg-white shadow-sm text-[#000080]'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            <Tags size={16} />
                            Label Memanjang
                        </button>
                        <button
                            onClick={() => handleTabChange('card')}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                                activeTab === 'card'
                                    ? 'bg-white shadow-sm text-[#000080]'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            <FileSpreadsheet size={16} />
                            Kartu Inventaris
                        </button>
                    </div>
                </div>
            )}

            {feedback && (
                <div className={`rounded-xl border px-4 py-3 text-sm ${feedback.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-rose-200 bg-rose-50 text-rose-700'
                    }`}>
                    {feedback.message}
                </div>
            )}

            {activeTab === 'items' && (
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                    <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
                        <div className="flex bg-slate-100 p-1 rounded-xl w-full md:w-auto">
                            <button
                                onClick={() => setFilterStatus('all')}
                                className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${filterStatus === 'all' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Semua
                            </button>
                            <button
                                onClick={() => setFilterStatus('active')}
                                className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${filterStatus === 'active' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Aktif
                            </button>
                            <button
                                onClick={() => setFilterStatus('deleted')}
                                className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${filterStatus === 'deleted' ? 'bg-white shadow-sm text-rose-600' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Terhapus
                            </button>
                        </div>

                        <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="text"
                                    placeholder="Cari barang..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                />
                            </div>
                            <button
                                onClick={fetchItems}
                                disabled={loading}
                                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors font-semibold text-sm disabled:opacity-60"
                            >
                                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                            </button>
                        </div>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 font-semibold text-slate-700 border-b border-slate-200">
                                <tr>
                                    <th className="px-4 py-3 whitespace-nowrap">Nama Barang</th>
                                    <th className="px-4 py-3 whitespace-nowrap">Kode/SKU</th>
                                    <th className="px-4 py-3 whitespace-nowrap">Lokasi</th>
                                    <th className="px-4 py-3 whitespace-nowrap">Tanggal</th>
                                    <th className="px-4 py-3 whitespace-nowrap min-w-[170px]">Status</th>
                                    <th className="px-4 py-3 whitespace-nowrap">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredItems.map(item => (
                                    <tr key={item.id} className={`hover:bg-slate-50 ${item.deleted_at ? 'bg-rose-50/30 text-slate-500' : ''}`}>
                                        <td className="px-4 py-3">
                                            <div className="font-semibold text-slate-800 flex items-center gap-2">
                                                <Package size={16} className={item.deleted_at ? 'text-rose-400' : 'text-indigo-400'} />
                                                {item.name}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs">{item.sku}</td>
                                        <td className="px-4 py-3">
                                            {item.room_name}
                                            {item.container_name ? ` - ${item.container_name}` : ''}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            {formatDateId(getProcurementDateFromLogs(item.logs, item.created_at))}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap min-w-[170px]">
                                            <ItemStatusBadge status={item.status} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2" title="Aksi">
                                                {!item.deleted_at && canManageItems && (
                                                    <button
                                                        onClick={() => handleAction(item.id, 'soft_delete')}
                                                        className="p-1.5 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors"
                                                        title="Nonaktifkan (Soft Delete)"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                                {item.deleted_at && canManageItems && (
                                                    <>
                                                        <button
                                                            onClick={() => handleAction(item.id, 'restore')}
                                                            className="p-1.5 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors"
                                                            title="Kembalikan Barang (Restore)"
                                                        >
                                                            <Undo size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleAction(item.id, 'hard_delete')}
                                                            className="p-1.5 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors border border-rose-200"
                                                            title="Hapus Permanen"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {filteredItems.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                                            Tidak ada barang yang ditemukan.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            {activeTab === 'codes' && (
                <InventoryCodeManagementPage embedded />
            )}
            {activeTab === 'label' && (
                <PrintAssetsPage forcedMode="label" />
            )}
            {activeTab === 'card' && (
                <PrintAssetsPage forcedMode="card" />
            )}
        </div>
    );
};

export default ItemManagementPage;
