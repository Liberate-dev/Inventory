import { expect, test } from '@playwright/test';

test.describe('Authentication', () => {
  test('admin can login and access dashboard', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: /Portal Inventory/i })).toBeVisible();

    await page.locator('#identifier').fill('admin');
    await page.locator('#password').fill('password');

    await Promise.all([
      page.waitForURL((url) => url.pathname === '/'),
      page.getByRole('button', { name: /Masuk ke Sistem/i }).click(),
    ]);

    await expect(page.getByRole('heading', { name: /Portal Inventory Panderman/i })).toBeVisible();
    const labPortalButton = page
      .locator('button')
      .filter({ has: page.getByRole('heading', { name: 'Lab Portal', exact: true }) });
    await labPortalButton.click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: /PORTAL INVENTORY/i })).toBeVisible();
    await expect(page.getByText(/SMPK SANTA MARIA 2 MALANG/i)).toBeVisible();
  });

  test('invalid password shows an error message', async ({ page }) => {
    await page.goto('/login');

    await page.locator('#identifier').fill('admin');
    await page.locator('#password').fill('wrong-password');
    await page.getByRole('button', { name: /Masuk ke Sistem/i }).click();

    await expect(page.getByText(/Invalid password|Login gagal|Login failed/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});
