import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import type { User } from '../types';
import { DEFAULT_MATRIX } from '../context/AccessMatrixContext';
import { LanguageProvider } from '../context/LanguageContext';

const cloneMatrix = () => JSON.parse(JSON.stringify(DEFAULT_MATRIX)) as typeof DEFAULT_MATRIX;

let matrixResponse = cloneMatrix();

const users: User[] = [
  {
    id: '1',
    username: 'admin',
    name: 'Super Admin',
    email: 'admin@example.test',
    role: 'admin',
    labScope: 'all',
  },
  {
    id: '2',
    username: 'kepsek_e2e',
    name: 'Kepsek E2E',
    email: 'kepsek@example.test',
    role: 'kepala_sekolah',
    labScope: 'computer',
  },
  {
    id: '3',
    username: 'guru_e2e',
    name: 'Guru E2E',
    email: 'guru@example.test',
    role: 'guru',
    labScope: 'computer',
  },
  {
    id: '4',
    username: 'kepala_lab_e2e',
    name: 'Kepala Lab E2E',
    email: 'kepalalab@example.test',
    role: 'kepala_lab',
    labScope: 'computer',
  },
  {
    id: '5',
    username: 'sarpras_e2e',
    name: 'Sarpras E2E',
    email: 'sarpras@example.test',
    role: 'sarpras',
    labScope: 'computer',
  },
];

const rooms = [
  {
    id: 'room-1',
    name: 'Lab Komputer 1',
    category: 'lab',
    type: 'computer',
    capacity: 30,
    containers: [
      {
        id: 'container-1',
        name: 'Meja 1',
        type: 'table',
        status: 'good',
        position: { x: 0, y: 0 },
        items: [
          {
            id: 'item-1',
            name: 'PC Siswa 01',
            type: 'PC Unit',
            category: 'Hardware',
            condition: 'good',
            status: 'available',
            sku: 'INV-2026-KOM-0001',
            specs: 'CPU: i5',
            logs: [
              {
                id: 'log-1',
                date: '2026-03-01T08:00:00.000Z',
                action: 'CREATED',
                details: 'Item dibuat',
              },
            ],
            parameters: [{ label: 'Brand', value: 'Dell' }],
            quantity: 1,
            unit: 'Pcs',
            minStock: 0,
            isConsumable: false,
          },
        ],
      },
    ],
  },
];

const requests = [
  {
    id: 'request-1',
    componentId: 'item-1',
    componentName: 'PC Siswa 01',
    stationId: 'container-1',
    stationName: 'Meja 1',
    roomId: 'room-1',
    roomName: 'Lab Komputer 1',
    description: 'Tidak bisa menyala',
    requesterName: 'Guru E2E',
    status: 'pending',
    requestDate: '2026-03-06T08:00:00.000Z',
  },
];

const managedItems = [
  {
    id: 'item-1',
    name: 'PC Siswa 01',
    sku: 'INV-2026-KOM-0001',
    room_name: 'Lab Komputer 1',
    container_name: 'Meja 1',
    condition: 'good',
    deleted_at: null,
    created_at: '2026-03-01T08:00:00.000Z',
    logs: [
      {
        id: 'log-1',
        date: '2026-03-01T08:00:00.000Z',
        action: 'CREATED',
        details: {},
      },
    ],
  },
];

const systemLogs = [
  {
    id: 'sys-1',
    actorUserId: '1',
    actorUsername: 'admin',
    actorName: 'Super Admin',
    actorRole: 'admin',
    actionKey: 'auth.login_success',
    targetType: 'user',
    targetId: '1',
    details: { username: 'admin', role: 'admin' },
    createdAt: '2026-03-06T08:00:00.000Z',
  },
];

function tokenFor(username: string): string {
  return `mock-token:${username}`;
}

function findUserByUsername(username: string | null | undefined): User | undefined {
  return users.find((entry) => entry.username === username);
}

function userFromHeaders(input: RequestInfo | URL, init?: RequestInit): User | undefined {
  const request = input instanceof Request ? input : null;
  const headers = new Headers(init?.headers ?? request?.headers);
  const bearer = headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? headers.get('X-Auth-Token');
  if (!bearer) return undefined;
  const username = bearer.replace(/^mock-token:/, '');
  return findUserByUsername(username);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installFetchMock() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const currentUser = userFromHeaders(input, init);

    if (url.endsWith('/auth/login.php') && method === 'POST') {
      const rawBody = typeof init?.body === 'string' ? init.body : '{}';
      const body = JSON.parse(rawBody) as { username?: string; password?: string };
      const matchedUser = findUserByUsername(body.username);

      if (matchedUser && body.password === 'password') {
        return json({
          success: true,
          message: 'Login successful.',
          token: tokenFor(matchedUser.username),
          user: matchedUser,
        });
      }

      return json({
        success: false,
        message: 'Username atau password salah.',
      }, 401);
    }

    if (url.includes('/users/users.php')) {
      if (currentUser?.role !== 'admin') {
        return json({ status: 'error', message: 'Access denied.' }, 403);
      }

      if (method === 'GET') {
        return json({ status: 'success', users });
      }

      return json({ status: 'success', message: 'ok' });
    }

    if (url.includes('/access_matrix/matrix.php')) {
      return json({ status: 'success', matrix: matrixResponse });
    }

    if (url.includes('/inventory/rooms.php')) {
      if (method === 'GET') {
        return json(rooms);
      }

      return json({ status: 'success', message: 'ok' });
    }

    if (url.includes('/service_requests/requests.php')) {
      if (method === 'GET') {
        return json({ status: 'success', requests });
      }

      return json({ status: 'success', message: 'ok' });
    }

    if (url.includes('/inventory/items_management.php')) {
      if (method === 'GET') {
        return json({ status: 'success', items: managedItems });
      }

      return json({ status: 'success', message: 'ok' });
    }

    if (url.includes('/preferences/preferences.php')) {
      if (method === 'GET') {
        return json({
          status: 'success',
          preferences: {
            userId: currentUser?.id ?? '1',
            language: 'id',
            portalType: 'lab',
          },
        });
      }

      return json({ status: 'success', message: 'ok' });
    }

    if (url.includes('/system_logs/logs.php')) {
      if (currentUser?.role !== 'admin') {
        return json({ status: 'error', message: 'Access denied.' }, 403);
      }

      return json({ status: 'success', logs: systemLogs });
    }

    if (url.includes('/inventory/inventory_codes.php')) {
      return json({
        status: 'success',
        settings: {
          prefix: 'INV',
          separator: '-',
          yearFormat: '4',
          includeRoomCode: true,
          sequencePadding: 4,
          nextNumber: 1,
        },
      });
    }

    return json({ status: 'success' });
  }));
}

function bootstrapSession(user: User, path: string): void {
  localStorage.setItem('auth_user', JSON.stringify(user));
  localStorage.setItem('auth_token', tokenFor(user.username));
  localStorage.setItem('portal_type', 'lab');
  window.history.pushState({}, '', path);
}

function renderApp() {
  return render(
    <LanguageProvider>
      <App />
    </LanguageProvider>,
  );
}

describe('access matrix integration', () => {
  beforeEach(() => {
    matrixResponse = cloneMatrix();
    installFetchMock();
  });

  it('redirects super admin directly into the dedicated admin panel after login', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/login');

    renderApp();

    await user.type(screen.getByLabelText(/Username \/ Email/i), 'admin');
    await user.type(screen.getByLabelText(/^Password$/i), 'password');
    await user.click(screen.getByRole('button', { name: /Masuk ke Sistem/i }));

    await waitFor(() => {
      expect(window.location.pathname).toBe('/admin');
    });
    expect(await screen.findByText(/Super Admin Panel/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Log Sistem/i })).toBeInTheDocument();
  });

  it('keeps super admin out of inventory routes', async () => {
    bootstrapSession(users[0], '/dashboard/rooms');

    renderApp();

    await waitFor(() => {
      expect(window.location.pathname).toBe('/admin');
    });
    expect(await screen.findByText(/Super Admin Panel/i)).toBeInTheDocument();
    expect(screen.queryByText(/PORTAL INVENTORY LAB/i)).not.toBeInTheDocument();
  });

  it('allows kepala sekolah to view room detail but not edit it', async () => {
    bootstrapSession(users[1], '/dashboard/rooms/room-1');

    const user = userEvent.setup();
    renderApp();

    await waitFor(() => {
      expect(window.location.pathname).toBe('/dashboard/rooms/room-1');
    });
    await user.click(await screen.findByText('Meja 1'));
    expect(await screen.findByText('PC Siswa 01')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tambah Wadah/i })).not.toBeInTheDocument();
  });

  it('blocks kepala sekolah from operations route and redirects to dashboard', async () => {
    bootstrapSession(users[1], '/dashboard/operations');

    renderApp();

    await waitFor(() => {
      expect(window.location.pathname).toBe('/dashboard');
    });
    expect(await screen.findByText(/PORTAL INVENTORY LAB/i)).toBeInTheDocument();
  });

  it('allows guru into operations but blocks guru from admin-only screens', async () => {
    bootstrapSession(users[2], '/dashboard/operations');

    const { unmount } = renderApp();

    await waitFor(() => {
      expect(window.location.pathname).toBe('/dashboard/operations');
    });
    expect(await screen.findByRole('heading', { name: /Operasional/i })).toBeInTheDocument();

    unmount();
    bootstrapSession(users[2], '/admin/system-logs');
    renderApp();

    await waitFor(() => {
      expect(window.location.pathname).toBe('/');
    });
    expect(await screen.findByRole('heading', { name: /Portal Inventory Panderman/i })).toBeInTheDocument();
  });

  it('shows item management as a dedicated row in the access matrix panel', async () => {
    bootstrapSession(users[0], '/admin/users');

    const user = userEvent.setup();
    renderApp();

    await waitFor(() => {
      expect(window.location.pathname).toBe('/admin/users');
    });

    await user.click(await screen.findByRole('button', { name: /Matriks Akses/i }));

    expect(await screen.findByText('Manajemen Barang')).toBeInTheDocument();
  });

  it('uses item management permission instead of room permission for the items route', async () => {
    matrixResponse.rooms.guru = 'full';
    matrixResponse.item_management.guru = 'none';
    bootstrapSession(users[2], '/dashboard/items');

    renderApp();

    await waitFor(() => {
      expect(window.location.pathname).toBe('/dashboard');
    });
    expect(await screen.findByText(/PORTAL INVENTORY LAB/i)).toBeInTheDocument();
  });

  it('allows sarpras into service requests but blocks operations', async () => {
    bootstrapSession(users[4], '/dashboard/service-requests');

    const { unmount } = renderApp();

    await waitFor(() => {
      expect(window.location.pathname).toBe('/dashboard/service-requests');
    });
    expect(await screen.findByText('PC Siswa 01')).toBeInTheDocument();

    unmount();
    bootstrapSession(users[4], '/dashboard/operations');
    renderApp();

    await waitFor(() => {
      expect(window.location.pathname).toBe('/dashboard');
    });
  });

  it('keeps item management actions visible for sarpras even when stored matrix still says view', async () => {
    matrixResponse.item_management.sarpras = 'view';
    bootstrapSession(users[4], '/dashboard/items');

    renderApp();

    await waitFor(() => {
      expect(window.location.pathname).toBe('/dashboard/items');
    });
    expect(await screen.findByText('PC Siswa 01')).toBeInTheDocument();
    expect(screen.getByTitle('Nonaktifkan (Soft Delete)')).toBeInTheDocument();
  });

  it('keeps kepala lab in view-only mode on service requests', async () => {
    bootstrapSession(users[3], '/dashboard/service-requests');

    renderApp();

    await waitFor(() => {
      expect(window.location.pathname).toBe('/dashboard/service-requests');
    });
    expect(await screen.findByText('PC Siswa 01')).toBeInTheDocument();
    expect(screen.queryByTitle('Accept')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Deny')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Mark Complete')).not.toBeInTheDocument();
  });

  it('rejects invalid password on login', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/login');

    renderApp();

    await user.type(screen.getByLabelText(/Username \/ Email/i), 'admin');
    await user.type(screen.getByLabelText(/^Password$/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /Masuk ke Sistem/i }));

    expect(await screen.findByText(/Username atau password salah|Login gagal/i)).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });
});
