import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { getAuthHeaders, getAuthToken } from '../utils/api';

type Language = 'en' | 'id';

interface LanguageContextType {
    language: Language;
    toggleLanguage: () => void;
    t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/public/api').replace(/\/+$/, '');
const PREFERENCES_ENDPOINT = `${API_BASE_URL}/preferences/preferences.php`;

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
    const [language, setLanguage] = useState<Language>(() => {
        const saved = localStorage.getItem('language_pref');
        return saved === 'en' || saved === 'id' ? saved : 'id';
    });

    useEffect(() => {
        localStorage.setItem('language_pref', language);
    }, [language]);

    useEffect(() => {
        const rawUser = localStorage.getItem('auth_user');
        if (!rawUser) return;

        let userId: string | null = null;
        try {
            const parsed = JSON.parse(rawUser) as { id?: string };
            userId = typeof parsed.id === 'string' ? parsed.id : null;
        } catch {
            userId = null;
        }
        if (!userId) return;

        const loadLanguagePreference = async () => {
            try {
                const token = getAuthToken();
                if (!token) return;

                const response = await fetch(`${PREFERENCES_ENDPOINT}?user_id=${encodeURIComponent(userId)}`, {
                    headers: getAuthHeaders()
                });
                const payload = await response.json().catch(() => ({})) as { status?: string; preferences?: { language?: string } };
                if (!response.ok || payload.status === 'error') return;

                const backendLanguage = payload.preferences?.language;
                if (backendLanguage === 'en' || backendLanguage === 'id') {
                    setLanguage(backendLanguage);
                }
            } catch (error) {
                console.error('Failed to load language preference:', error);
            }
        };

        void loadLanguagePreference();
    }, []);

    const toggleLanguage = () => {
        setLanguage(prev => {
            const nextLanguage: Language = prev === 'en' ? 'id' : 'en';

            const rawUser = localStorage.getItem('auth_user');
            if (!rawUser) return nextLanguage;

            try {
                const parsed = JSON.parse(rawUser) as { id?: string };
                if (!parsed.id) return nextLanguage;

                void fetch(PREFERENCES_ENDPOINT, {
                    method: 'PUT',
                    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({
                        userId: parsed.id,
                        language: nextLanguage
                    })
                });
            } catch {
                // ignore malformed session
            }

            return nextLanguage;
        });
    };

    const translations: Record<string, { en: string; id: string }> = {
        'dashboard': { en: 'Dashboard', id: 'Dashboard' },
        'overview': { en: 'Overview', id: 'Ringkasan' },
        'lab_rooms': { en: 'Lab Rooms', id: 'Ruang Lab' },
        'service_requests': { en: 'Service Requests', id: 'Permintaan Layanan' },
        'operations': { en: 'Operations', id: 'Operasional' },
        'reports': { en: 'Reports', id: 'Laporan' },
        'assets': { en: 'Assets', id: 'Aset' },
        'monthly_report': { en: 'Monthly Report', id: 'Laporan Bulanan' },
        'print_assets': { en: 'Label & Inventory Codes', id: 'Manajemen Kode Inventaris' },
        'inventory_code_management': { en: 'Inventory Code Management', id: 'Manajemen Kode Inventaris' },
        'user_management': { en: 'User Management', id: 'Manajemen Pengguna' },
        'my_profile': { en: 'My Profile', id: 'Profil Saya' },
        'logout': { en: 'Logout', id: 'Keluar' },
        'welcome_back': { en: 'Welcome back', id: 'Selamat datang kembali' },

        // Dashboard Overview
        'dashboard_title': { en: 'Dashboard Overview', id: 'Ringkasan Dashboard' },
        'dashboard_subtitle': { en: 'Real-time inventory monitoring and health status', id: 'Pemantauan inventaris realtime dan status kesehatan' },
        'last_30_days': { en: 'Last 30 Days', id: '30 Hari Terakhir' },
        'download_report': { en: 'View Monthly Report', id: 'Lihat Laporan Bulanan' },

        // Dashboard Card Strings
        'active_rooms': { en: 'Active Rooms', id: 'Ruangan Aktif' },
        'total_open_rooms': { en: 'Total Open Rooms', id: 'Total Ruangan Dibuka' },
        'items_inside_all_containers': { en: 'Items inside all containers', id: 'Barang di dalam semua wadah' },
        'pending_issues': { en: 'Pending Issues', id: 'Kendala Menunggu' },
        'unseen_not_accepted': { en: 'Unseen / Not Accepted', id: 'Belum Dilihat / Belum Diterima' },
        'in_progress_issues': { en: 'In-Progress Issues', id: 'Kendala Diproses' },
        'currently_being_handled': { en: 'Currently being handled', id: 'Sedang ditangani' },
        'rooms_health': { en: 'Rooms Health Status', id: 'Status Kesehatan Ruangan' },


        // Stats
        'total_assets': { en: 'Total Assets', id: 'Total Aset' },
        'active_labs': { en: 'Active Labs', id: 'Lab Aktif' },
        'operational_rate': { en: 'Operational Rate', id: 'Tingkat Operasional' },
        'target_95': { en: 'Target: 95%', id: 'Target: 95%' },
        'active_issues': { en: 'Active Issues', id: 'Masalah Aktif' },
        'requires_attention': { en: 'Requires immediate attention', id: 'Perlu penanganan segera' },
        'pending_maintenance': { en: 'Pending Maintenance', id: 'Menunggu Perbaikan' },
        'in_progress': { en: 'In progress', id: 'Sedang berjalan' },

        // Sections
        'labs_health': { en: 'Labs Health Status', id: 'Status Kesehatan Lab' },
        'view_all': { en: 'View All Labs', id: 'Lihat Semua Lab' },
        'asset_condition': { en: 'Asset Condition', id: 'Kondisi Aset' },
        'maintenance_trend': { en: 'Maintenance Trend (6 Months)', id: 'Tren Perbaikan (6 Bulan)' },
        'recent_activity': { en: 'Recent Activity', id: 'Aktivitas Terbaru' },
        'no_activity': { en: 'No recent activity', id: 'Tidak ada aktivitas baru' },
        'assets_count': { en: 'Assets', id: 'Aset' },
        'capacity': { en: 'Capacity', id: 'Kapasitas' },

        // Common Statuses
        'good': { en: 'Good', id: 'Baik' },
        'service': { en: 'Service', id: 'Perbaikan' },
        'damaged': { en: 'Damaged', id: 'Rusak' },
        'broken': { en: 'Broken', id: 'Rusak Parah' },
        'no_assets': { en: 'No Assets', id: 'Tidak Ada Aset' },

        // Room Management
        'manage_rooms_title': { en: 'Select a Room to Manage', id: 'Pilih Ruangan untuk Dikelola' },
        'add_room': { en: 'Add Room', id: 'Tambah Ruangan' },
        'stations': { en: 'Stations', id: 'Stasiun' },
        'edit_room': { en: 'Edit Room', id: 'Edit Ruangan' },
        'delete_room': { en: 'Delete Room', id: 'Hapus Ruangan' },
        'room_id': { en: 'Room ID', id: 'ID Ruangan' },
        'room_name': { en: 'Room Name', id: 'Nama Ruangan' },
        'room_type': { en: 'Type', id: 'Tipe' },
        'specify_type': { en: 'Specify Type', id: 'Spesifikasikan Tipe' },
        'save_room': { en: 'Save Room', id: 'Simpan Ruangan' },
        'lab_computer': { en: 'Computer Lab', id: 'Lab Komputer' },
        'lab_physics': { en: 'Physics Lab', id: 'Lab Fisika' },
        'lab_biology': { en: 'Biology Lab', id: 'Lab Biologi' },
        'lab_other': { en: 'Other', id: 'Lainnya' },
        'confirm_delete_room': { en: 'Are you sure you want to delete this room?', id: 'Apakah Anda yakin ingin menghapus ruangan ini?' },

        // Service Requests
        'service_requests_title': { en: 'Service Requests', id: 'Permintaan Layanan' },
        'service_requests_subtitle': { en: 'Manage reported issues and maintenance tracking.', id: 'Kelola laporan masalah dan pelacakan perbaikan.' },
        'search_requests': { en: 'Search requests...', id: 'Cari permintaan...' },
        'status_all': { en: 'All', id: 'Semua' },
        'status_pending': { en: 'Pending', id: 'Menunggu' },
        'status_accepted': { en: 'Accepted', id: 'Diterima' },
        'status_completed': { en: 'Completed', id: 'Selesai' },
        'status_denied': { en: 'Denied', id: 'Ditolak' },
        'col_component': { en: 'Component / Station', id: 'Komponen / Stasiun' },
        'col_issue': { en: 'Issue Description', id: 'Deskripsi Masalah' },
        'col_date': { en: 'Date', id: 'Tanggal' },
        'col_status': { en: 'Status', id: 'Status' },
        'col_action': { en: 'Action', id: 'Tindakan' },
        'col_requester': { en: 'Requester', id: 'Pemohon' },
        'no_requests': { en: 'No service requests found', id: 'Tidak ada permintaan layanan' },

        // Service Modals
        'deny_title': { en: 'Deny Request', id: 'Tolak Permintaan' },
        'deny_desc': { en: 'Please provide a reason for rejecting this maintenance request.', id: 'Mohon berikan alasan penolakan permintaan ini.' },
        'deny_reason_placeholder': { en: 'Reason for rejection...', id: 'Alasan penolakan...' },
        'btn_cancel': { en: 'Cancel', id: 'Batal' },
        'btn_deny': { en: 'Deny Request', id: 'Tolak Permintaan' },
        'complete_title': { en: 'Complete Maintenance', id: 'Selesaikan Perbaikan' },
        'complete_desc': { en: 'What was the outcome of the maintenance?', id: 'Bagaimana hasil perbaikan?' },
        'outcome_repaired': { en: 'Repaired', id: 'Diperbaiki' },
        'outcome_repaired_desc': { en: 'Item is fixed and status set to Good', id: 'Barang diperbaiki, status menjadi Baik' },
        'outcome_broken': { en: 'Unrepairable', id: 'Tidak Bisa Diperbaiki' },
        'outcome_broken_desc': { en: 'Item status set to Broken', id: 'Status barang diubah menjadi Rusak' },

        // Station Detail Modal
        'station_overview': { en: 'Station Overview', id: 'Ringkasan Stasiun' },
        'station_interact_hint': { en: 'Interact with components for details', id: 'Interaksi dengan komponen untuk detail' },
        'program_desc': { en: 'Program', id: 'Program' },
        'physical_desk': { en: 'Physical Desk', id: 'Meja Fisik' },
        'monitor': { en: 'Monitor', id: 'Monitor' },
        'pc_tower': { en: 'PC Tower', id: 'PC Tower' },
        'keyboard': { en: 'Keyboard', id: 'Keyboard' },
        'mouse': { en: 'Mouse', id: 'Mouse' },
        'component_details': { en: 'Component Details', id: 'Detail Komponen' },
        'station_status': { en: 'Station Status', id: 'Status Stasiun' },
        'condition': { en: 'Condition', id: 'Kondisi' },
        'uptime': { en: 'Uptime', id: 'Waktu Aktif' },
        'technical_specs': { en: 'Technical Specs', id: 'Spesifikasi Teknis' },
        'no_specs': { en: 'No specifications added.', id: 'Tidak ada spesifikasi ditambahkan.' },
        'report_issue': { en: 'Report Issue', id: 'Laporkan Masalah' },
        'view_logs': { en: 'View Logs', id: 'Lihat Log' },
        'edit_config': { en: 'Edit Configuration', id: 'Edit Konfigurasi' },
        'remove_component': { en: 'Remove', id: 'Hapus' },
        'station_components': { en: 'Station Components', id: 'Komponen Stasiun' },
        'station_components_desc': { en: 'Components currently installed in this station.', id: 'Komponen yang terpasang di stasiun ini.' },
        'no_components_installed': { en: 'No components installed', id: 'Tidak ada komponen terpasang' },
        'add_component': { en: 'Add Component', id: 'Tambah Komponen' },
        'add_physical_desk': { en: 'Add Physical Desk', id: 'Tambah Meja Fisik' },
        'add_monitor': { en: 'Add Monitor', id: 'Tambah Monitor' },
        'add_pc': { en: 'Add PC', id: 'Tambah PC' },
        'add_keyboard': { en: 'Add Keyboard', id: 'Tambah Keyboard' },
        'add_mouse': { en: 'Add Mouse', id: 'Tambah Mouse' },
        'system_check': { en: 'System Check', id: 'Cek Sistem' },
        'test_component': { en: 'Test Component', id: 'Tes Komponen' },
        'submit_report': { en: 'Submit Report', id: 'Kirim Laporan' },
        'report_issue_title': { en: 'Report Issue', id: 'Laporkan Masalah' },
        'report_success': { en: 'Report submitted successfully!', id: 'Laporan berhasil dikirim!' },
        'report_issue_desc': { en: 'Describe the issue clearly. This will initiate a service request.', id: 'Jelaskan masalah dengan jelas. Ini akan membuat permintaan layanan.' },
        'component_history': { en: 'Component History', id: 'Riwayat Komponen' },
        'no_history': { en: 'No history recorded', id: 'Belum ada riwayat' },
        'save': { en: 'Save', id: 'Simpan' },
        'status_managed_hint': { en: 'Status manages via Service Requests only.', id: 'Status dikelola hanya melalui Permintaan Layanan.' },

        // Container Detail Modal
        'items_count': { en: 'Items', id: 'Item' },
        'container_empty': { en: 'This container is empty', id: 'Kontainer ini kosong' },
        'container_empty_desc': { en: 'Add items to keep track of inventory', id: 'Tambahkan item untuk melacak inventaris' },
        'add_first_item': { en: '+ Add First Item', id: '+ Tambah Item Pertama' },
        'add_new_item': { en: 'Add New Item', id: 'Tambah Item Baru' },
        'edit_item_details': { en: 'Edit Item Details', id: 'Edit Detail Item' },
        'item_name': { en: 'Item Name', id: 'Nama Item' },
        'sku_code': { en: 'SKU / Inventory Code', id: 'SKU / Kode Inventaris' },
        'category_label': { en: 'Category', id: 'Kategori' },
        'is_consumable': { en: 'Is Consumable?', id: 'Barang Habis Pakai?' },
        'enable_stock_tracking': { en: 'Enable stock tracking for this item', id: 'Aktifkan pelacakan stok untuk item ini' },
        'current_stock': { en: 'Current Stock', id: 'Stok Saat Ini' },
        'quantity': { en: 'Quantity', id: 'Kuantitas' },
        'unit': { en: 'Unit', id: 'Satuan' },
        'min_stock': { en: 'Minimum Stock', id: 'Stok Minimum' },
        'params_specs': { en: 'Parameters / Specs', id: 'Parameter / Spesifikasi' },
        'add_custom_param': { en: '+ Add Custom Parameter', id: '+ Tambah Parameter Kustom' },
        'condition_status_hint': { en: 'Condition Status (Managed via Service Requests)', id: 'Status Kondisi (Dikelola via Permintaan Layanan)' },
        'save_changes': { en: 'Save Changes', id: 'Simpan Perubahan' },
        'add_item': { en: 'Add Item', id: 'Tambah Item' },
        'report_issue_item': { en: 'Report\nIssue', id: 'Lapor\nMasalah' },
        'low_stock': { en: 'LOW STOCK', id: 'STOK RENDAH' },
        'describe_issue': { en: 'Describe the issue with', id: 'Jelaskan masalah dengan' },

        // Verification
        'verification_title': { en: 'Identity Verification', id: 'Verifikasi Identitas' },
        'verification_desc': { en: 'Please enter your name, phone number, or email to proceed.', id: 'Mohon masukkan nama, nomor HP, atau email untuk melanjutkan.' },
        'verification_label': { en: 'Identity (Name / Phone / Email)', id: 'Identitas (Nama / No. HP / Email)' },
        'verification_placeholder': { en: 'Example: Budi / 08123456789', id: 'Contoh: Budi / 08123456789' },
        'btn_verify': { en: 'Verify', id: 'Verifikasi' },

        // Report
        'report_overview_title': { en: 'Global Inventory Overview', id: 'Ringkasan Inventaris Global' },
        'total_items': { en: 'Total Items', id: 'Total Item' },
        'total_value': { en: 'Total Value', id: 'Total Nilai' },
        'items_by_room': { en: 'Items by Room', id: 'Item per Ruangan' },
        'items_by_category': { en: 'Items by Category', id: 'Item per Kategori' },
    };

    const t = (key: string) => {
        const item = translations[key];
        if (!item) return key; // Fallback to key if missing
        return item[language];
    };

    return (
        <LanguageContext.Provider value={{ language, toggleLanguage, t }
        }>
            {children}
        </LanguageContext.Provider >
    );
};

export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
};
