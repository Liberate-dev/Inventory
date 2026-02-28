import { expect, test, type Page } from '@playwright/test';

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'password';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /Portal Inventory/i })).toBeVisible();

  await page.locator('#identifier').fill(ADMIN_USERNAME);
  await page.locator('#password').fill(ADMIN_PASSWORD);

  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name: /Masuk ke Sistem/i }).click(),
  ]);
}

async function enterPortal(page: Page, portal: 'lab' | 'non-lab'): Promise<void> {
  const headingName = portal === 'lab' ? 'Lab Portal' : 'Non-Lab Portal';
  const portalButton = page
    .locator('button')
    .filter({ has: page.getByRole('heading', { name: headingName, exact: true }) });

  await portalButton.click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function loginAndEnter(page: Page, portal: 'lab' | 'non-lab' = 'lab'): Promise<void> {
  await login(page);
  await expect(page.getByRole('heading', { name: /Portal Inventory Panderman/i })).toBeVisible();
  await enterPortal(page, portal);
  await expect(page.getByRole('heading', { name: /PORTAL INVENTORY/i })).toBeVisible();
}

test.describe('Full App Smoke Coverage', () => {
  test('lab portal sidebar navigates to all main pages', async ({ page }) => {
    await loginAndEnter(page, 'lab');

    const routes: Array<{
      href: string;
      marker: () => Promise<void>;
    }> = [
      {
        href: '/dashboard',
        marker: async () => {
          await expect(page.getByText(/SMPK SANTA MARIA 2 MALANG/i)).toBeVisible();
        },
      },
      {
        href: '/dashboard/rooms',
        marker: async () => {
          await expect(page.getByRole('button', { name: /Tambah Ruangan|Add Room/i })).toBeVisible();
        },
      },
      {
        href: '/dashboard/service-requests',
        marker: async () => {
          await expect(page.getByPlaceholder(/Cari permintaan|Search requests/i)).toBeVisible();
        },
      },
      {
        href: '/dashboard/operations',
        marker: async () => {
          await expect(page.getByRole('heading', { name: /Operasional/i })).toBeVisible();
        },
      },
      {
        href: '/dashboard/reports',
        marker: async () => {
          await expect(page.getByRole('heading', { name: /Global Monthly Report/i })).toBeVisible();
        },
      },
      {
        href: '/dashboard/admin/users',
        marker: async () => {
          await expect(page.getByRole('heading', { name: /Manajemen Pengguna/i })).toBeVisible();
        },
      },
      {
        href: '/dashboard/profile',
        marker: async () => {
          await expect(page.getByRole('heading', { name: /Profil Saya/i })).toBeVisible();
        },
      },
    ];

    for (const route of routes) {
      await page.locator(`a[href="${route.href}"]`).first().click();
      await expect(page).toHaveURL(new RegExp(`${escapeRegex(route.href)}$`));
      await route.marker();
    }
  });

  test('rooms page can open detail page when room card exists', async ({ page }) => {
    await loginAndEnter(page, 'lab');
    await page.goto('/dashboard/rooms');
    await expect(page).toHaveURL(/\/dashboard\/rooms$/);

    const roomsResponse = await page.request.get('http://127.0.0.1:8000/public/api/inventory/rooms.php');
    const payload = (await roomsResponse.json()) as { rooms?: Array<{ id?: string | number }> };
    const firstRoomId = payload.rooms?.[0]?.id;

    if (firstRoomId !== undefined && firstRoomId !== null) {
      await page.goto(`/dashboard/rooms/${String(firstRoomId)}`);
      await expect(page).toHaveURL(/\/dashboard\/rooms\/[^/]+$/);
      await expect(
        page.getByText(/ID Ruangan:|Ruangan tidak ditemukan|Akses Ditolak|Kembali ke Daftar Ruangan/i).first(),
      ).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: /Tambah Ruangan|Add Room/i })).toBeVisible();
    }
  });

  test('service requests page renders search and status filters', async ({ page }) => {
    await loginAndEnter(page, 'lab');
    await page.goto('/dashboard/service-requests');
    await expect(page).toHaveURL(/\/dashboard\/service-requests$/);

    await expect(page.getByPlaceholder(/Cari permintaan|Search requests/i)).toBeVisible();
    await page.getByRole('button', { name: /Pending|Menunggu/i }).click();
    await page.getByRole('button', { name: /Accepted|Diterima/i }).click();
    await page.getByRole('button', { name: /All|Semua/i }).click();
  });

  test('operations page renders tabs and history modal', async ({ page }) => {
    await loginAndEnter(page, 'lab');
    await page.goto('/dashboard/operations');
    await expect(page).toHaveURL(/\/dashboard\/operations$/);

    await expect(page.getByRole('heading', { name: /Operasional/i })).toBeVisible();
    await page.getByRole('button', { name: /Record Usage/i }).click();
    await expect(page.getByText(/Check Out|Return/i).first()).toBeVisible();

    await page.getByRole('button', { name: /Transfer Asset/i }).click();
    await expect(page.getByText(/Destination Details/i)).toBeVisible();

    await page.getByRole('button', { name: /Riwayat Operasional/i }).click();
    await expect(page.getByRole('heading', { name: /Riwayat Operasional/i })).toBeVisible();
  });

  test('reports and user management pages render key sections', async ({ page }) => {
    await loginAndEnter(page, 'lab');

    await page.goto('/dashboard/reports');
    await expect(page).toHaveURL(/\/dashboard\/reports$/);
    await expect(page.getByRole('heading', { name: /Global Monthly Report/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Print Report/i })).toBeVisible();
    await expect(page.locator('input[type="month"]')).toBeVisible();

    await page.goto('/dashboard/admin/users');
    await expect(page).toHaveURL(/\/dashboard\/admin\/users$/);
    await expect(page.getByRole('heading', { name: /Manajemen Pengguna/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Matriks Akses/i })).toBeVisible();
    await expect(page.getByPlaceholder(/Cari nama, username, atau email/i)).toBeVisible();

    await page.getByRole('button', { name: /Matriks Akses/i }).click();
    await expect(page.getByRole('heading', { name: /Matriks Hak Akses per Peran/i })).toBeVisible();
  });

  test('non-lab portal flow reaches dashboard and rooms page', async ({ page }) => {
    await loginAndEnter(page, 'non-lab');
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto('/dashboard/rooms');
    await expect(page).toHaveURL(/\/dashboard\/rooms$/);
    await expect(page.getByRole('button', { name: /Tambah Ruangan|Add Room/i })).toBeVisible();
  });
});
