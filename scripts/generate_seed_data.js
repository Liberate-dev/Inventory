/* eslint-disable no-console */
import fs from 'node:fs';

const OUTPUT_PATH = 'docker/mysql/init/2-seed.sql';
const PASSWORD_HASH = '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'; // password

const users = [
  { id: 1, username: 'admin', email: 'admin@school.com', name: 'Super Admin', phone: '081200000001', role: 'admin', lab_scope: null },
  { id: 2, username: 'kepala.lab', email: 'kepalalab@school.com', name: 'Kepala Lab Utama', phone: '081200000002', role: 'kepala_lab', lab_scope: 'all' },
  { id: 3, username: 'sarpras.1', email: 'sarpras@school.com', name: 'Koordinator Sarpras', phone: '081200000003', role: 'sarpras', lab_scope: null },
  { id: 4, username: 'kepsek', email: 'kepsek@school.com', name: 'Kepala Sekolah', phone: '081200000004', role: 'kepala_sekolah', lab_scope: null },
  { id: 5, username: 'guru.fisika', email: 'fisika@school.com', name: 'Ibu Neta Fisika', phone: '081200000005', role: 'guru', lab_scope: null },
  { id: 6, username: 'guru.biologi', email: 'biologi@school.com', name: 'Pak Yudhi Biologi', phone: '081200000006', role: 'guru', lab_scope: null },
  { id: 7, username: 'guru.tik', email: 'tik@school.com', name: 'Bu Rika TIK', phone: '081200000007', role: 'guru', lab_scope: null },
  { id: 8, username: 'wali.7a', email: 'wali7a@school.com', name: 'Wali Kelas 7A', phone: '081200000008', role: 'guru', lab_scope: null },
  { id: 9, username: 'wali.8a', email: 'wali8a@school.com', name: 'Wali Kelas 8A', phone: '081200000009', role: 'guru', lab_scope: null },
  { id: 10, username: 'wali.9a', email: 'wali9a@school.com', name: 'Wali Kelas 9A', phone: '081200000010', role: 'guru', lab_scope: null },
  { id: 11, username: 'lab.komputer', email: 'labkomputer@school.com', name: 'Koordinator Lab Komputer', phone: '081200000011', role: 'kepala_lab', lab_scope: 'computer' },
  { id: 12, username: 'lab.fisika', email: 'labfisika@school.com', name: 'Koordinator Lab Fisika', phone: '081200000012', role: 'kepala_lab', lab_scope: 'physics' },
  { id: 13, username: 'lab.biologi', email: 'labbiologi@school.com', name: 'Koordinator Lab Biologi', phone: '081200000013', role: 'kepala_lab', lab_scope: 'biology' },
  { id: 14, username: 'operator.tu', email: 'tu@school.com', name: 'Operator Tata Usaha', phone: '081200000014', role: 'sarpras', lab_scope: null },
  { id: 15, username: 'pustakawan', email: 'library@school.com', name: 'Pustakawan Sekolah', phone: '081200000015', role: 'guru', lab_scope: null }
];

const rooms = [
  { id: 1, name: 'Lab Komputer 1', category: 'lab', type: 'computer', custom_type: null, capacity: 36 },
  { id: 2, name: 'Lab Komputer 2', category: 'lab', type: 'computer', custom_type: null, capacity: 32 },
  { id: 3, name: 'Lab Fisika', category: 'lab', type: 'physics', custom_type: null, capacity: 28 },
  { id: 4, name: 'Lab Biologi', category: 'lab', type: 'biology', custom_type: null, capacity: 28 },
  { id: 5, name: 'Lab IPA Terpadu', category: 'lab', type: 'other', custom_type: 'science', capacity: 30 },
  { id: 6, name: 'Lab Bahasa', category: 'lab', type: 'other', custom_type: 'language', capacity: 30 },
  { id: 7, name: 'Kelas 7A', category: 'non-lab', type: 'classroom', custom_type: null, capacity: 36 },
  { id: 8, name: 'Kelas 7B', category: 'non-lab', type: 'classroom', custom_type: null, capacity: 36 },
  { id: 9, name: 'Kelas 8A', category: 'non-lab', type: 'classroom', custom_type: null, capacity: 34 },
  { id: 10, name: 'Kelas 8B', category: 'non-lab', type: 'classroom', custom_type: null, capacity: 34 },
  { id: 11, name: 'Kelas 9A', category: 'non-lab', type: 'classroom', custom_type: null, capacity: 32 },
  { id: 12, name: 'Kelas 9B', category: 'non-lab', type: 'classroom', custom_type: null, capacity: 32 },
  { id: 13, name: 'Perpustakaan', category: 'non-lab', type: 'other', custom_type: 'library', capacity: 60 },
  { id: 14, name: 'Ruang Guru', category: 'non-lab', type: 'office', custom_type: null, capacity: 25 },
  { id: 15, name: 'Ruang Tata Usaha', category: 'non-lab', type: 'office', custom_type: null, capacity: 15 },
  { id: 16, name: 'Ruang Kepala Sekolah', category: 'non-lab', type: 'office', custom_type: null, capacity: 8 },
  { id: 17, name: 'Gudang Utama', category: 'non-lab', type: 'warehouse', custom_type: null, capacity: 120 },
  { id: 18, name: 'Gudang ATK', category: 'non-lab', type: 'warehouse', custom_type: null, capacity: 80 },
  { id: 19, name: 'Ruang UKS', category: 'non-lab', type: 'other', custom_type: 'uks', capacity: 12 },
  { id: 20, name: 'Aula Serbaguna', category: 'non-lab', type: 'other', custom_type: 'hall', capacity: 200 }
];

const roomById = new Map(rooms.map((r) => [r.id, r]));

let containerId = 1;
const containers = [];
const pushContainer = (roomId, name, type, status, x, y) => containers.push({ id: containerId++, room_id: roomId, name, type, status, position_x: x, position_y: y });

for (const room of rooms) {
  if (room.type === 'computer') {
    pushContainer(room.id, 'Meja Guru', 'table', 'good', 0, 0);
    pushContainer(room.id, 'Rak Jaringan', 'shelf', 'good', 1, 0);
    pushContainer(room.id, 'Lemari Peripheral', 'cupboard', 'good', 2, 0);
    pushContainer(room.id, 'Meja Siswa Blok A', 'table', 'good', 0, 1);
    pushContainer(room.id, 'Meja Siswa Blok B', 'table', 'good', 1, 1);
    continue;
  }
  if (room.type === 'physics' || room.type === 'biology') {
    pushContainer(room.id, 'Lemari Alat Utama', 'cupboard', 'good', 0, 0);
    pushContainer(room.id, 'Lemari Cadangan', 'cupboard', room.type === 'physics' ? 'warning' : 'good', 1, 0);
    pushContainer(room.id, 'Meja Praktikum 1', 'table', 'good', 0, 1);
    pushContainer(room.id, 'Meja Praktikum 2', 'table', 'good', 1, 1);
    continue;
  }
  if (room.type === 'classroom') {
    pushContainer(room.id, 'Meja Guru', 'table', 'good', 0, 0);
    pushContainer(room.id, 'Lemari Kelas', 'cupboard', 'good', 1, 0);
    pushContainer(room.id, 'Rak Media Belajar', 'shelf', 'good', 2, 0);
    continue;
  }
  if (room.type === 'office') {
    pushContainer(room.id, 'Meja Kerja', 'table', 'good', 0, 0);
    pushContainer(room.id, 'Lemari Dokumen', 'cupboard', 'good', 1, 0);
    pushContainer(room.id, 'Rak Arsip', 'shelf', 'good', 2, 0);
    continue;
  }
  if (room.type === 'warehouse') {
    pushContainer(room.id, 'Rak Barang A', 'shelf', 'good', 0, 0);
    pushContainer(room.id, 'Rak Barang B', 'shelf', 'good', 1, 0);
    pushContainer(room.id, 'Rak Barang C', 'shelf', 'warning', 2, 0);
    pushContainer(room.id, 'Lemari Terkunci', 'cupboard', 'good', 3, 0);
    continue;
  }
  if (room.custom_type === 'library') {
    pushContainer(room.id, 'Rak Referensi', 'shelf', 'good', 0, 0);
    pushContainer(room.id, 'Rak Sirkulasi', 'shelf', 'good', 1, 0);
    pushContainer(room.id, 'Meja Sirkulasi', 'table', 'good', 2, 0);
    pushContainer(room.id, 'Lemari Arsip Perpustakaan', 'cupboard', 'good', 3, 0);
    continue;
  }
  if (room.custom_type === 'uks') {
    pushContainer(room.id, 'Lemari Obat', 'cupboard', 'good', 0, 0);
    pushContainer(room.id, 'Rak Alat Medis', 'shelf', 'good', 1, 0);
    pushContainer(room.id, 'Meja Pemeriksaan', 'table', 'good', 2, 0);
    continue;
  }
  if (room.custom_type === 'hall') {
    pushContainer(room.id, 'Lemari Sound System', 'cupboard', 'good', 0, 0);
    pushContainer(room.id, 'Rak Kursi Lipat', 'shelf', 'good', 1, 0);
    pushContainer(room.id, 'Meja Kontrol Acara', 'table', 'good', 2, 0);
    continue;
  }
  if (room.custom_type === 'science') {
    pushContainer(room.id, 'Lemari Reagen', 'cupboard', 'warning', 0, 0);
    pushContainer(room.id, 'Rak Peralatan Eksperimen', 'shelf', 'good', 1, 0);
    pushContainer(room.id, 'Meja Praktikum IPA 1', 'table', 'good', 0, 1);
    pushContainer(room.id, 'Meja Praktikum IPA 2', 'table', 'good', 1, 1);
    continue;
  }
  if (room.custom_type === 'language') {
    pushContainer(room.id, 'Lemari Headset', 'cupboard', 'good', 0, 0);
    pushContainer(room.id, 'Rak Modul Bahasa', 'shelf', 'good', 1, 0);
    pushContainer(room.id, 'Meja Instruktur', 'table', 'good', 2, 0);
    pushContainer(room.id, 'Meja Siswa Bahasa', 'table', 'good', 0, 1);
    continue;
  }
  pushContainer(room.id, 'Lemari Umum', 'cupboard', 'good', 0, 0);
  pushContainer(room.id, 'Rak Umum', 'shelf', 'good', 1, 0);
  pushContainer(room.id, 'Meja Umum', 'table', 'good', 2, 0);
}
const containerById = new Map(containers.map((c) => [c.id, c]));

const tpl = (name, type, category, isConsumable, quantity, unit, minStock, specs, brand) => ({ name, type, category, isConsumable, quantity, unit, minStock, specs, brand });

function templatesFor(room, container) {
  if (room.type === 'computer') {
    if (container.name.includes('Meja Guru')) return [tpl('Laptop Guru', 'Laptop', 'Elektronik', false, 1, 'unit', 0, 'Core i5 / 16GB / SSD 512GB', 'Lenovo'), tpl('Proyektor Portable', 'Proyektor', 'Elektronik', false, 1, 'unit', 0, '3600 ANSI Lumens', 'Epson'), tpl('Remote Presenter', 'Aksesori', 'Elektronik', false, 1, 'unit', 0, 'Laser pointer', 'Logitech')];
    if (container.name.includes('Rak Jaringan')) return [tpl('Switch 24 Port', 'Jaringan', 'Elektronik', false, 2, 'unit', 0, 'Gigabit managed switch', 'TP-Link'), tpl('Access Point Indoor', 'Jaringan', 'Elektronik', false, 4, 'unit', 0, 'Dual band WiFi 6', 'Ubiquiti'), tpl('UPS 1200VA', 'Kelistrikan', 'Elektronik', false, 2, 'unit', 0, 'Line interactive', 'APC')];
    if (container.name.includes('Peripheral')) return [tpl('Headset Praktikum', 'Audio', 'Elektronik', false, 30, 'unit', 0, 'Over-ear USB headset', 'Fantech'), tpl('Mouse USB Cadangan', 'Periferal', 'Elektronik', false, 20, 'unit', 0, 'Optical mouse', 'Logitech'), tpl('Kabel LAN Cat6', 'Kabel', 'Elektronik', true, 120, 'pcs', 30, 'Patch cord 3m', 'Belden')];
    return [tpl('PC All-in-One Siswa', 'Komputer', 'Elektronik', false, 18, 'unit', 0, 'Core i3 / 8GB / SSD 256GB', 'Acer'), tpl('Keyboard USB', 'Periferal', 'Elektronik', false, 18, 'unit', 0, 'Full-size keyboard', 'Logitech'), tpl('Mouse Pad', 'Aksesori', 'Elektronik', true, 40, 'pcs', 10, 'Rubber anti-slip', 'Generic')];
  }
  if (room.type === 'physics') return [tpl('Multimeter Digital', 'Alat Ukur', 'Fisika', false, 16, 'unit', 0, 'True RMS', 'Sanwa'), tpl('Catu Daya DC', 'Kelistrikan', 'Fisika', false, 8, 'unit', 0, '0-30V adjustable', 'Korad'), tpl('Kit Rangkaian Listrik', 'Praktikum', 'Fisika', false, 12, 'set', 0, 'Breadboard + resistor', 'EduLab'), tpl('Baterai 9V', 'Kelistrikan', 'Fisika', true, 45, 'pcs', 12, 'Alkaline battery', 'Energizer')];
  if (room.type === 'biology') return [tpl('Mikroskop Binokuler', 'Mikroskop', 'Biologi', false, 14, 'unit', 0, '40x-1000x', 'Olympus'), tpl('Kaca Preparat', 'Kaca', 'Biologi', true, 300, 'pcs', 80, 'Glass slide 75x25mm', 'SailBrand'), tpl('Model Anatomi Organ', 'Model', 'Biologi', false, 8, 'unit', 0, 'Model 3D edukasi', 'Anatomica'), tpl('Sarung Tangan Lateks', 'Praktikum', 'Biologi', true, 220, 'pasang', 60, 'Disposable latex gloves', 'SafeTouch')];
  if (room.custom_type === 'science') return [tpl('Larutan NaCl 0.9%', 'Reagen', 'Kimia', true, 40, 'botol', 10, '500 ml', 'Merck'), tpl('Neraca Digital', 'Alat Ukur', 'IPA', false, 6, 'unit', 0, '0.01g precision', 'Ohaus'), tpl('Kit Percobaan IPA', 'Praktikum', 'IPA', false, 16, 'set', 0, 'Integrated science kit', 'EduLab'), tpl('Masker Praktikum', 'Keselamatan', 'IPA', true, 180, 'pcs', 50, 'Disposable mask', 'SafeAir')];
  if (room.custom_type === 'language') return [tpl('Headset Bahasa', 'Audio', 'Bahasa', false, 32, 'unit', 0, 'Noise-cancelling mic', 'Sennheiser'), tpl('Modul Listening', 'Modul', 'Bahasa', true, 120, 'buku', 25, 'Bahan ajar listening', 'Sekolah'), tpl('Komputer Instruktur', 'Komputer', 'Bahasa', false, 1, 'unit', 0, 'Core i5 / 16GB / SSD', 'HP'), tpl('Kabel Audio AUX', 'Kabel', 'Bahasa', true, 45, 'pcs', 12, '1.5 meter', 'Vention')];
  if (room.type === 'classroom') return [tpl('Laptop Wali Kelas', 'Laptop', 'Elektronik', false, 1, 'unit', 0, 'Core i3 / 8GB / SSD', 'Asus'), tpl('Spidol Whiteboard', 'ATK', 'ATK', true, 90, 'pcs', 25, 'Marker board assorted', 'Snowman'), tpl('Kursi Siswa', 'Furniture', 'Furnitur', false, room.capacity, 'unit', 0, 'Kursi belajar standar', 'Local'), tpl('Meja Siswa', 'Furniture', 'Furnitur', false, room.capacity, 'unit', 0, 'Meja belajar standar', 'Local')];
  if (room.custom_type === 'library') return [tpl('Buku Referensi Sains', 'Buku', 'Buku', false, 350, 'buku', 0, 'Koleksi referensi', 'Beragam'), tpl('Buku Fiksi', 'Buku', 'Buku', false, 420, 'buku', 0, 'Novel dan cerpen', 'Beragam'), tpl('PC Katalog', 'Komputer', 'Elektronik', false, 2, 'unit', 0, 'PC katalog perpustakaan', 'Lenovo'), tpl('Kartu Anggota', 'Administrasi', 'Administrasi', true, 500, 'lembar', 100, 'Member card blank', 'Sekolah')];
  if (room.type === 'office') return [tpl('PC Office', 'Komputer', 'Elektronik', false, 4, 'unit', 0, 'Core i5 / 8GB / SSD', 'Dell'), tpl('Arsip Dokumen Siswa', 'Dokumen', 'Administrasi', false, 250, 'map', 0, 'Arsip aktif', 'Sekolah'), tpl('Toner Printer', 'ATK', 'ATK', true, 25, 'pcs', 8, 'Laser toner', 'HP'), tpl('Kertas A4', 'ATK', 'ATK', true, 120, 'rim', 25, '80 gsm', 'PaperOne')];
  if (room.type === 'warehouse') return [tpl('Kertas A4 Cadangan', 'ATK', 'ATK', true, 300, 'rim', 80, '80 gsm bulk', 'PaperOne'), tpl('Lampu LED Cadangan', 'Kelistrikan', 'Sarana', true, 180, 'pcs', 50, 'LED bulb 12W', 'Philips'), tpl('Kabel Roll', 'Kelistrikan', 'Sarana', false, 25, 'unit', 0, 'Extension cable 20m', 'Uticon'), tpl('Cat Tembok', 'Perawatan', 'Sarana', true, 40, 'kaleng', 10, 'Emulsion paint', 'Avitex')];
  if (room.custom_type === 'uks') return [tpl('Obat Paracetamol', 'Obat', 'UKS', true, 220, 'tablet', 80, '500mg', 'Kimia Farma'), tpl('Tensimeter Digital', 'Medis', 'UKS', false, 4, 'unit', 0, 'Automatic blood pressure', 'Omron'), tpl('Bed Lipat UKS', 'Furniture', 'UKS', false, 3, 'unit', 0, 'Folding patient bed', 'Hospitalia'), tpl('Kotak P3K', 'Medis', 'UKS', false, 6, 'set', 0, 'First aid kit set', 'OneMed')];
  if (room.custom_type === 'hall') return [tpl('Mixer Audio', 'Audio', 'Aula', false, 1, 'unit', 0, '12-channel mixer', 'Yamaha'), tpl('Mic Wireless', 'Audio', 'Aula', false, 6, 'unit', 0, 'UHF wireless mic', 'Shure'), tpl('Kursi Lipat', 'Furniture', 'Aula', false, 220, 'unit', 0, 'Folding chair', 'Local'), tpl('Proyektor Aula', 'Proyektor', 'Aula', false, 2, 'unit', 0, '5000 ANSI Lumens', 'Epson')];
  return [tpl('Perlengkapan Umum', 'Umum', 'Lainnya', false, 5, 'unit', 0, 'General equipment', 'Generic'), tpl('Stok Cadangan', 'Umum', 'Lainnya', true, 20, 'pcs', 5, 'General stock', 'Generic')];
}

const hashCode = (str) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
};

let itemId = 1;
let skuCounter = 1;
const items = [];
for (const container of containers) {
  const room = roomById.get(container.room_id);
  const templates = templatesFor(room, container);
  templates.forEach((t, idx) => {
    let condition = 'good';
    let status = 'available';
    if (!t.isConsumable) {
      const mod = hashCode(`${room.id}-${container.id}-${t.name}-${idx}`) % 100;
      if (mod < 4) { condition = 'broken'; status = 'missing'; }
      else if (mod < 12) { condition = 'service'; status = 'maintenance'; }
      else if (mod < 20) { condition = 'damaged'; status = 'available'; }
      else if (mod < 30) { condition = 'good'; status = 'in_use'; }
    }
    items.push({
      id: itemId++,
      container_id: container.id,
      name: t.name,
      type: t.type,
      condition,
      status,
      specs: t.specs,
      image_url: null,
      sku: `INV-${String(room.id).padStart(2, '0')}-${String(skuCounter++).padStart(4, '0')}`,
      category: t.category,
      is_consumable: t.isConsumable ? 1 : 0,
      quantity: t.quantity,
      unit: t.unit,
      min_stock: t.minStock,
      parameters: JSON.stringify(
        t.isConsumable
          ? [{ label: 'Merek', value: t.brand }, { label: 'Jenis', value: t.type }, { label: 'Satuan', value: t.unit }]
          : [{ label: 'Merek', value: t.brand }, { label: 'Tipe', value: t.type }, { label: 'Lokasi Awal', value: `${room.name} / ${container.name}` }]
      )
    });
  });
}

const dt = (day, hour, min = 0) => {
  const d = new Date(Date.UTC(2026, 2, day, hour - 7, min, 0));
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
};

let logId = 1;
let requestId = 1;
const itemLogs = [];
const serviceRequests = [];
for (const item of items) {
  const seedDay = (item.id % 24) + 1;
  const creatorUser = (item.id % 10) + 5;
  itemLogs.push({ id: logId++, item_id: item.id, user_id: creatorUser, action: 'CREATED', date: dt(seedDay, 9, item.id % 50), details: JSON.stringify({ source: 'stock_opname_awal', qty: item.quantity }) });
  if (item.is_consumable) {
    itemLogs.push({ id: logId++, item_id: item.id, user_id: 14, action: 'STOCK_IN', date: dt(seedDay, 10, item.id % 50), details: JSON.stringify({ qty: item.quantity, unit: item.unit, note: 'Pengadaan awal semester' }) });
    if (item.id % 7 === 0) itemLogs.push({ id: logId++, item_id: item.id, user_id: 14, action: 'STOCK_OUT', date: dt(seedDay, 11, item.id % 50), details: JSON.stringify({ qty: Math.max(1, Math.floor(item.quantity * 0.15)), unit: item.unit, note: 'Pemakaian rutin pembelajaran' }) });
    if (item.quantity <= item.min_stock + 5) itemLogs.push({ id: logId++, item_id: item.id, user_id: 14, action: 'LOW_STOCK_ALERT', date: dt(seedDay, 15, item.id % 50), details: JSON.stringify({ qty: item.quantity, minStock: item.min_stock }) });
  }
  if (item.status === 'in_use') {
    itemLogs.push({ id: logId++, item_id: item.id, user_id: 8 + (item.id % 3), action: 'CHECK_OUT', date: dt(seedDay, 11, item.id % 50), details: JSON.stringify({ borrower: `Kelas ${7 + (item.id % 3)}${String.fromCharCode(65 + (item.id % 2))}`, purpose: 'Kegiatan pembelajaran', verifiedBy: 'admin@school.com', condition: 'good' }) });
    if (item.id % 2 === 0) itemLogs.push({ id: logId++, item_id: item.id, user_id: 8 + (item.id % 3), action: 'RETURNED', date: dt(seedDay, 17, item.id % 50), details: JSON.stringify({ returnedBy: `Kelas ${7 + (item.id % 3)}${String.fromCharCode(65 + (item.id % 2))}`, verifiedBy: 'admin@school.com', condition: item.condition }) });
  }
  if (!item.is_consumable && item.condition === 'good' && item.id % 11 === 0) {
    const sourceContainer = containerById.get(item.container_id);
    const sourceRoom = roomById.get(sourceContainer.room_id);
    const targetRoom = rooms[(sourceRoom.id + 2) % rooms.length];
    itemLogs.push({
      id: logId++,
      item_id: item.id,
      user_id: 3,
      action: 'TRANSFER',
      date: dt(seedDay, 16, item.id % 50),
      details: JSON.stringify({
        from: `${sourceRoom.name} - ${sourceContainer.name}`,
        to: `${targetRoom.name} - Area Penyimpanan`,
        mover: 'Petugas Sarpras',
        receiver: 'Penanggung Jawab Ruangan',
        verifiedBy: 'admin@school.com',
        condition: item.condition,
        verificationStatus: 'verified'
      })
    });
  }
  if (item.condition === 'service') {
    itemLogs.push({ id: logId++, item_id: item.id, user_id: 5 + (item.id % 3), action: 'MAINTENANCE_REQUESTED', date: dt(seedDay, 12, item.id % 50), details: JSON.stringify({ description: 'Perangkat tidak berfungsi stabil', requesterId: 5 + (item.id % 3) }) });
    itemLogs.push({ id: logId++, item_id: item.id, user_id: 3, action: 'MAINTENANCE_ACCEPTED', date: dt(seedDay, 14, item.id % 50), details: JSON.stringify({ serviceRequestId: String(requestId), note: 'Dijadwalkan pemeriksaan teknisi.' }) });
    serviceRequests.push({ id: requestId++, item_id: item.id, requester_id: 5 + (item.id % 3), description: 'Perangkat perlu pemeriksaan teknis', status: item.id % 2 === 0 ? 'accepted' : 'pending', request_date: dt(seedDay, 12, item.id % 50), resolution_date: null, rejection_reason: null });
  }
  if (item.condition === 'damaged') {
    itemLogs.push({ id: logId++, item_id: item.id, user_id: 6, action: 'MAINTENANCE_REQUESTED', date: dt(seedDay, 12, item.id % 50), details: JSON.stringify({ description: 'Kerusakan fisik ringan terdeteksi', requesterId: 6 }) });
    itemLogs.push({ id: logId++, item_id: item.id, user_id: 3, action: 'MAINTENANCE_DENIED', date: dt(seedDay, 13, item.id % 50), details: JSON.stringify({ serviceRequestId: String(requestId), reason: 'Ditunda sampai pengadaan suku cadang tersedia' }) });
    serviceRequests.push({ id: requestId++, item_id: item.id, requester_id: 6, description: 'Kerusakan ringan pada perangkat', status: 'denied', request_date: dt(seedDay, 12, item.id % 50), resolution_date: dt(seedDay, 13, item.id % 50), rejection_reason: 'Ditunda sampai pengadaan suku cadang tersedia' });
  }
  if (item.condition === 'broken') {
    itemLogs.push({ id: logId++, item_id: item.id, user_id: 7, action: 'MAINTENANCE_REQUESTED', date: dt(seedDay, 12, item.id % 50), details: JSON.stringify({ description: 'Perangkat rusak berat dan tidak menyala', requesterId: 7 }) });
    itemLogs.push({ id: logId++, item_id: item.id, user_id: 3, action: 'MAINTENANCE_ACCEPTED', date: dt(seedDay, 13, item.id % 50), details: JSON.stringify({ serviceRequestId: String(requestId), note: 'Masuk antrian perbaikan sarpras.' }) });
    itemLogs.push({ id: logId++, item_id: item.id, user_id: 3, action: 'MAINTENANCE_COMPLETED', date: dt(seedDay, 16, item.id % 50), details: JSON.stringify({ serviceRequestId: String(requestId), outcome: 'broken', note: 'Perangkat tidak dapat diperbaiki.' }) });
    serviceRequests.push({ id: requestId++, item_id: item.id, requester_id: 7, description: 'Rusak berat, perlu penghapusan/replace', status: 'completed', request_date: dt(seedDay, 12, item.id % 50), resolution_date: dt(seedDay, 16, item.id % 50), rejection_reason: null });
  }
}

const esc = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
};

const insertSQL = (table, cols, rows) => {
  if (!rows.length) return '';
  const values = rows.map((r) => `(${cols.map((c) => esc(r[c])).join(', ')})`).join(',\n');
  return `INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES\n${values};\n`;
};

let sql = '';
sql += '-- Seed data besar dan realistis untuk lab + non-lab\n';
sql += '-- Generated by scripts/generate_seed_data.js\n\n';
sql += 'SET SQL_MODE = \"NO_AUTO_VALUE_ON_ZERO\";\n';
sql += 'START TRANSACTION;\n';
sql += 'SET time_zone = \"+07:00\";\n';
sql += 'SET FOREIGN_KEY_CHECKS = 0;\n\n';
sql += 'DELETE FROM `service_requests`;\n';
sql += 'DELETE FROM `item_logs`;\n';
sql += 'DELETE FROM `items`;\n';
sql += 'DELETE FROM `containers`;\n';
sql += 'DELETE FROM `rooms`;\n';
sql += 'DELETE FROM `users`;\n\n';
sql += 'ALTER TABLE `service_requests` AUTO_INCREMENT = 1;\n';
sql += 'ALTER TABLE `item_logs` AUTO_INCREMENT = 1;\n';
sql += 'ALTER TABLE `items` AUTO_INCREMENT = 1;\n';
sql += 'ALTER TABLE `containers` AUTO_INCREMENT = 1;\n';
sql += 'ALTER TABLE `rooms` AUTO_INCREMENT = 1;\n';
sql += 'ALTER TABLE `users` AUTO_INCREMENT = 1;\n\n';
sql += 'SET FOREIGN_KEY_CHECKS = 1;\n\n';

sql += insertSQL('users', ['id', 'username', 'password', 'email', 'name', 'phone', 'role', 'lab_scope', 'avatar_url', 'created_at'], users.map((u) => ({ ...u, password: PASSWORD_HASH, avatar_url: null, created_at: '2026-03-01 07:00:00' })));
sql += '\n';
sql += insertSQL('rooms', ['id', 'name', 'category', 'type', 'custom_type', 'capacity', 'created_at'], rooms.map((r) => ({ ...r, created_at: '2026-03-01 07:10:00' })));
sql += '\n';
sql += insertSQL('containers', ['id', 'room_id', 'name', 'type', 'status', 'position_x', 'position_y', 'created_at'], containers.map((c) => ({ ...c, created_at: '2026-03-01 07:20:00' })));
sql += '\n';
sql += insertSQL('items', ['id', 'container_id', 'name', 'type', 'condition', 'status', 'specs', 'image_url', 'sku', 'category', 'is_consumable', 'quantity', 'unit', 'min_stock', 'parameters', 'created_at', 'updated_at'], items.map((i, idx) => ({ ...i, created_at: dt((idx % 24) + 1, 8, idx % 59), updated_at: dt((idx % 24) + 1, 9, idx % 59) })));
sql += '\n';
sql += insertSQL('item_logs', ['id', 'item_id', 'user_id', 'action', 'date', 'details', 'created_at'], itemLogs.map((l, idx) => ({ ...l, created_at: dt((idx % 24) + 1, 18, idx % 59) })));
sql += '\n';
sql += insertSQL('service_requests', ['id', 'item_id', 'requester_id', 'description', 'status', 'request_date', 'resolution_date', 'rejection_reason'], serviceRequests);
sql += '\nCOMMIT;\n';

fs.mkdirSync('docker/mysql/init', { recursive: true });
fs.writeFileSync(OUTPUT_PATH, sql);
console.log(`Generated ${OUTPUT_PATH}`);
console.log(`Users=${users.length}, Rooms=${rooms.length}, Containers=${containers.length}, Items=${items.length}, Logs=${itemLogs.length}, Requests=${serviceRequests.length}`);
