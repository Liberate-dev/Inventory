export const getAuthToken = (): string | null => {
    if (typeof window === 'undefined') return null;
    const token = localStorage.getItem('auth_token');
    return typeof token === 'string' && token.trim() !== '' ? token : null;
};

export const getAuthHeaders = (headers?: HeadersInit): HeadersInit => {
    const token = getAuthToken();
    const baseHeaders = new Headers(headers);

    if (token) {
        baseHeaders.set('Authorization', `Bearer ${token}`);
        baseHeaders.set('X-Auth-Token', token);
    }

    return baseHeaders;
};

export const isUnauthorizedResponse = (status: number): boolean => status === 401 || status === 403;
