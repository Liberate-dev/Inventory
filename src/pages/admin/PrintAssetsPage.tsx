import { useEffect, useMemo, useState } from 'react';
import { Printer, Tags, FileSpreadsheet, Settings2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { getProcurementDateFromLogs } from '../../utils/itemHistory';
import InventoryCodeManagementPage from './InventoryCodeManagementPage';
import logo from '../../assets/logo.png';

type PrintItem = {
    id: string;
    sku: string;
    name: string;
    roomId: string;
    roomName: string;
    location: string;
    quantity: number;
    unit: string;
    minStock: number;
    isConsumable: boolean;
    condition: string;
    brand: string;
    procurementDate: string;
};

const currentYear = new Date().getFullYear();

const normalizeCondition = (condition: string): string => {
    if (condition === 'good') return 'Baik';
    if (condition === 'service') return 'Perlu Perbaikan';
    if (condition === 'damaged') return 'Rusak Ringan';
    return 'Rusak Berat';
};

const extractBrand = (parameters?: { label: string; value: string }[]): string => {
    if (!Array.isArray(parameters)) return '-';
    const hit = parameters.find((param) => {
        const key = String(param.label || '').toLowerCase();
        return key.includes('brand') || key.includes('merek');
    });
    return hit?.value?.trim() ? hit.value : '-';
};

const getSkuTextSizeClass = (sku: string): string => {
    const length = sku.trim().length;
    if (length >= 22) return 'text-xs md:text-sm';
    if (length >= 18) return 'text-sm md:text-base';
    return 'text-base md:text-lg';
};

const formatDateId = (value: string): string => {
    if (!value || value === '-') return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
};

const PrintAssetsPage = () => {
    const { rooms } = useInventory();
    const { user } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const getModeFromQuery = (): 'label' | 'card' | 'codes' => {
        const tab = searchParams.get('tab');
        if (tab === 'card' || tab === 'codes' || tab === 'label') {
            return tab;
        }
        return 'label';
    };
    const [mode, setMode] = useState<'label' | 'card' | 'codes'>(getModeFromQuery());
    const [search, setSearch] = useState('');
    const [roomFilter, setRoomFilter] = useState('all');
    const [cardRoomId, setCardRoomId] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    useEffect(() => {
        const nextMode = getModeFromQuery();
        if (nextMode !== mode) {
            setMode(nextMode);
        }
    }, [searchParams]);

    const visibleRooms = useMemo(() => {
        if (!user) return rooms;
        const isScopeRestricted =
            Boolean(user.labScope)
            && user.labScope !== 'all';

        return isScopeRestricted
            ? rooms.filter((room) => room.type === user.labScope)
            : rooms;
    }, [rooms, user]);

    useEffect(() => {
        if (roomFilter !== 'all' && !visibleRooms.some((room) => room.id === roomFilter)) {
            setRoomFilter('all');
        }
    }, [roomFilter, visibleRooms]);

    useEffect(() => {
        if (cardRoomId !== '' && !visibleRooms.some((room) => room.id === cardRoomId)) {
            setCardRoomId('');
        }
    }, [cardRoomId, visibleRooms]);

    const allItems = useMemo<PrintItem[]>(() => {
        const rows: PrintItem[] = [];
        visibleRooms.forEach((room) => {
            room.containers.forEach((container) => {
                container.items.forEach((item) => {
                    rows.push({
                        id: item.id,
                        sku: item.sku?.trim() || `INV-${item.id}`,
                        name: item.name,
                        roomId: room.id,
                        roomName: room.name,
                        location: `${room.name} / ${container.name}`,
                        quantity: item.quantity ?? 1,
                        unit: item.unit ?? 'pcs',
                        minStock: item.minStock ?? 0,
                        isConsumable: Boolean(item.isConsumable),
                        condition: item.condition,
                        brand: extractBrand(item.parameters),
                        procurementDate: getProcurementDateFromLogs(item.logs)
                    });
                });
            });
        });
        return rows;
    }, [visibleRooms]);

    const filteredItems = useMemo(() => {
        const needle = search.toLowerCase().trim();
        return allItems.filter((item) => {
            const byRoom = roomFilter === 'all' || item.roomId === roomFilter;
            const bySearch = needle === ''
                || item.name.toLowerCase().includes(needle)
                || item.sku.toLowerCase().includes(needle)
                || item.roomName.toLowerCase().includes(needle);
            return byRoom && bySearch;
        });
    }, [allItems, roomFilter, search]);

    const labelItems = useMemo(
        () => filteredItems.filter((item) => selectedIds.includes(item.id)),
        [filteredItems, selectedIds]
    );

    const cardRoomItems = useMemo(
        () => allItems.filter((item) => item.roomId === cardRoomId),
        [allItems, cardRoomId]
    );

    const cardRoomName = useMemo(
        () => visibleRooms.find((room) => room.id === cardRoomId)?.name || '-',
        [visibleRooms, cardRoomId]
    );

    const toggleSelect = (itemId: string) => {
        setSelectedIds((prev) => (prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]));
    };

    const selectAllFiltered = () => {
        setSelectedIds(filteredItems.map((item) => item.id));
    };

    const clearSelection = () => setSelectedIds([]);

    const handlePrint = () => window.print();

    const handleModeChange = (nextMode: 'label' | 'card' | 'codes') => {
        setMode(nextMode);
        const nextParams = new URLSearchParams(searchParams);
        if (nextMode === 'label') {
            nextParams.delete('tab');
        } else {
            nextParams.set('tab', nextMode);
        }
        setSearchParams(nextParams, { replace: true });
    };

    return (
        <div className="h-full flex flex-col bg-white border border-slate-200 rounded-2xl shadow-md shadow-blue-900/5 overflow-hidden">
            <style>{`
                @media print {
                    .print-break { page-break-after: always; }
                }
            `}</style>
            <div className="p-6 md:p-8 space-y-6 overflow-y-auto">
                <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between print:hidden">
                    <div>
                        <h2 className="text-2xl font-extrabold text-[#000080] tracking-tight">Cetak & Manajemen Kode Inventaris</h2>
                        <p className="text-slate-500">Cetak label, kartu inventaris, dan atur patokan manajemen kode inventaris.</p>
                    </div>
                    {mode !== 'codes' && (
                        <button
                            onClick={handlePrint}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#000080] text-white font-bold hover:bg-[#000060] transition-colors"
                        >
                            <Printer size={18} />
                            Print
                        </button>
                    )}
                </div>

                <div className="print:hidden inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                    <button
                        onClick={() => handleModeChange('label')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${mode === 'label' ? 'bg-white text-[#000080] shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                    >
                        <span className="inline-flex items-center gap-2"><Tags size={14} /> Label Memanjang</span>
                    </button>
                    <button
                        onClick={() => handleModeChange('card')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${mode === 'card' ? 'bg-white text-[#000080] shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                    >
                        <span className="inline-flex items-center gap-2"><FileSpreadsheet size={14} /> Kartu Inventaris</span>
                    </button>
                    <button
                        onClick={() => handleModeChange('codes')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${mode === 'codes' ? 'bg-white text-[#000080] shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                    >
                        <span className="inline-flex items-center gap-2"><Settings2 size={14} /> Kode Inventaris</span>
                    </button>
                </div>

                {mode === 'label' && (
                    <section className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 print:hidden">
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Cari nama / kode item"
                                className="md:col-span-2 px-3 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-[#000080]"
                            />
                            <select
                                value={roomFilter}
                                onChange={(e) => setRoomFilter(e.target.value)}
                                className="px-3 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-[#000080]"
                            >
                                <option value="all">Semua Ruangan</option>
                                {visibleRooms.map((room) => (
                                    <option key={room.id} value={room.id}>{room.name}</option>
                                ))}
                            </select>
                            <div className="flex gap-2">
                                <button onClick={selectAllFiltered} className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold hover:bg-slate-50">Pilih Semua</button>
                                <button onClick={clearSelection} className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold hover:bg-slate-50">Reset</button>
                            </div>
                        </div>

                        <div className="print:hidden border border-slate-200 rounded-xl overflow-hidden">
                            <div className="max-h-72 overflow-y-auto">
                                {filteredItems.map((item) => (
                                    <label key={item.id} className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 hover:bg-slate-50 cursor-pointer">
                                        <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelect(item.id)} />
                                        <div className="min-w-0">
                                            <div className="font-semibold text-slate-800">{item.name}</div>
                                            <div className="text-xs text-slate-500">{item.sku} • {item.location}</div>
                                        </div>
                                    </label>
                                ))}
                                {filteredItems.length === 0 && <p className="p-4 text-sm text-slate-500">Tidak ada item.</p>}
                            </div>
                        </div>

                        <div className="space-y-3">
                            {labelItems.map((item) => (
                                <div key={`label-${item.id}`} className="border border-slate-300 rounded-xl p-3 bg-white">
                                    <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-sm">
                                        <div className="border border-slate-300 rounded-lg px-3 py-2 font-semibold text-slate-700 flex flex-col items-center justify-center text-center gap-1">
                                            <img src={logo} alt="logo" className="w-5 h-5 object-contain" />
                                            <span>SMPK SANTA MARIA 2</span>
                                        </div>
                                        <div className="border border-slate-300 rounded-lg px-3 py-2 font-semibold text-slate-700 text-center flex flex-col items-center justify-center min-w-0">
                                            <span>No. Inventaris:</span>
                                            <span
                                                title={item.sku}
                                                className={`block w-full font-extrabold leading-tight tracking-tight whitespace-normal break-all ${getSkuTextSizeClass(item.sku)}`}
                                            >
                                                {item.sku}
                                            </span>
                                        </div>
                                        <div className="border border-slate-300 rounded-lg px-3 py-2 font-semibold text-slate-700 text-center flex items-center justify-center">Nama Barang: {item.name}</div>
                                        <div className="border border-slate-300 rounded-lg px-3 py-2 font-semibold text-slate-700 text-center flex items-center justify-center">Ruangan: {item.roomName}</div>
                                        <div className="border border-slate-300 rounded-lg px-3 py-2 font-semibold text-slate-700 text-center flex flex-col items-center justify-center leading-tight">
                                            <span>Tahun: {currentYear}</span>
                                            <span className="text-xs font-semibold text-slate-600 mt-1">
                                                Tgl Pengadaan: {formatDateId(item.procurementDate)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {labelItems.length === 0 && (
                                <div className="border border-dashed border-slate-300 rounded-xl p-6 text-center text-slate-500">
                                    Pilih item untuk menampilkan preview label.
                                </div>
                            )}
                        </div>
                    </section>
                )}

                {mode === 'card' && (
                    <section className="space-y-4">
                        <div className="print:hidden flex flex-col md:flex-row gap-3">
                            <select
                                value={cardRoomId}
                                onChange={(e) => setCardRoomId(e.target.value)}
                                className="px-3 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-[#000080] max-w-md"
                            >
                                <option value="">Pilih ruangan untuk kartu inventaris</option>
                                {visibleRooms.map((room) => (
                                    <option key={room.id} value={room.id}>{room.name}</option>
                                ))}
                            </select>
                        </div>

                        {cardRoomId ? (
                            <div className="border border-slate-300 rounded-xl p-5 bg-white print:border-slate-400">
                                <div className="text-center mb-4">
                                    <h3 className="font-bold text-slate-900">KARTU INVENTARIS RUANGAN</h3>
                                    <p className="text-sm text-slate-600">SMPK SANTA MARIA 2 MALANG</p>
                                    <p className="text-sm text-slate-600">Ruangan: {cardRoomName}</p>
                                    <p className="text-xs text-slate-500">Tanggal cetak: {new Date().toLocaleDateString()}</p>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm border border-slate-400">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                <th className="border border-slate-400 px-2 py-1">No</th>
                                                <th className="border border-slate-400 px-2 py-1">Jenis Barang</th>
                                                <th className="border border-slate-400 px-2 py-1">Merek</th>
                                                <th className="border border-slate-400 px-2 py-1">Tahun</th>
                                                <th className="border border-slate-400 px-2 py-1">No. Barang</th>
                                                <th className="border border-slate-400 px-2 py-1">Jumlah</th>
                                                <th className="border border-slate-400 px-2 py-1">Kondisi</th>
                                                <th className="border border-slate-400 px-2 py-1">Ket.</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {cardRoomItems.map((item, idx) => {
                                                const lowStock = item.isConsumable && item.quantity <= item.minStock;
                                                const note = lowStock ? 'Stok rawan' : (item.condition === 'good' ? 'Baik' : 'Perlu tindak lanjut');
                                                return (
                                                    <tr key={`card-${item.id}`}>
                                                        <td className="border border-slate-300 px-2 py-1 text-center">{idx + 1}</td>
                                                        <td className="border border-slate-300 px-2 py-1">{item.name}</td>
                                                        <td className="border border-slate-300 px-2 py-1">{item.brand}</td>
                                                        <td className="border border-slate-300 px-2 py-1 text-center">{currentYear}</td>
                                                        <td className="border border-slate-300 px-2 py-1 font-mono text-xs">{item.sku}</td>
                                                        <td className="border border-slate-300 px-2 py-1 text-center">{item.quantity} {item.unit}</td>
                                                        <td className="border border-slate-300 px-2 py-1 text-center">{normalizeCondition(item.condition)}</td>
                                                        <td className="border border-slate-300 px-2 py-1">{note}</td>
                                                    </tr>
                                                );
                                            })}
                                            {cardRoomItems.length === 0 && (
                                                <tr>
                                                    <td className="border border-slate-300 px-2 py-3 text-center text-slate-500" colSpan={8}>
                                                        Tidak ada item pada ruangan ini.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="border border-dashed border-slate-300 rounded-xl p-6 text-center text-slate-500">
                                Pilih ruangan untuk menampilkan kartu inventaris.
                            </div>
                        )}
                    </section>
                )}

                {mode === 'codes' && (
                    <section className="space-y-4">
                        <InventoryCodeManagementPage embedded />
                    </section>
                )}
            </div>
        </div>
    );
};

export default PrintAssetsPage;
