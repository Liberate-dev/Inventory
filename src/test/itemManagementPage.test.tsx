import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import ItemManagementPage from '../pages/admin/ItemManagementPage';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: '1',
      name: 'Admin',
      role: 'admin',
      labScope: 'all',
    },
  }),
}));

vi.mock('../context/AccessMatrixContext', () => ({
  useAccessMatrix: () => ({
    canEditFeature: () => true,
    canSee: () => true,
    loading: false,
  }),
}));

vi.mock('../utils/api', () => ({
  getAuthHeaders: () => ({}),
}));

vi.mock('../context/AccessMatrixContext', () => ({
  useAccessMatrix: () => ({
    canEditFeature: () => true,
  }),
}));

describe('ItemManagementPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            status: 'success',
            items: [
              {
                id: '48',
                name: 'Kaca Preparat',
                sku: 'INV-04-0048',
                room_name: 'Lab Biologi',
                container_name: 'Lemari Alat Utama',
                condition: 'good',
                deleted_at: '2026-03-10T00:00:00.000Z',
                created_at: '2026-01-15T00:00:00.000Z',
                logs: [
                  {
                    id: '1',
                    action: 'CREATED',
                    date: '2026-01-15T00:00:00.000Z',
                    details: '{}',
                  },
                  {
                    id: '2',
                    action: 'DELETE',
                    date: '2026-03-10T00:00:00.000Z',
                    details: '{}',
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
  });

  it('shows procurement date for deleted items in a column before status', async () => {
    render(<ItemManagementPage />);

    expect(await screen.findByText('Tanggal Pengadaan')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('15/1/2026')).toBeInTheDocument();
    });

    const deletedBadge = screen.getByText('Dihapus (3/10/2026)');
    expect(deletedBadge).toBeInTheDocument();
    expect(deletedBadge).toHaveClass('whitespace-nowrap');
  });
});
