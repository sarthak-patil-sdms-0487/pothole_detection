import { create } from 'zustand';
import { API_BASE_URL } from '../config';

export type Role = 'SURVEYOR' | 'ENGINEER' | 'CITIZEN';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  organization?: string | null;
}

const TOKEN_KEY = 'midc_token';
const USER_KEY = 'midc_user';

const read = <T,>(key: string): T | null => {
  if (typeof window === 'undefined') return null;
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
};

const write = (key: string, val: unknown) => {
  if (typeof window === 'undefined') return;
  try {
    if (val === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* private mode / storage disabled — stay in memory only */
  }
};

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  role: Role;                     // convenience mirror of user?.role for existing screens
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const savedUser = read<AuthUser>(USER_KEY);
const savedTokenRaw = typeof window !== 'undefined' ? (localStorage.getItem(TOKEN_KEY) || null) : null;

export const useAuthStore = create<AuthState>((set) => ({
  token: savedTokenRaw,
  user: savedUser,
  role: savedUser?.role ?? 'CITIZEN',
  isAuthenticated: !!savedTokenRaw,

  login: async (email, password) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Login failed' }));
      throw new Error(err.detail || 'Login failed');
    }
    const data = await res.json();
    const token: string = data.access_token;
    const user: AuthUser = data.user;
    if (typeof window !== 'undefined') {
      try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
    }
    write(USER_KEY, user);
    set({ token, user, role: user.role, isAuthenticated: true });
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    }
    write(USER_KEY, null);
    set({ token: null, user: null, role: 'CITIZEN', isAuthenticated: false });
  },
}));

/**
 * fetch() with the signed JWT attached as a Bearer token.
 *
 * Authorisation is now proven by this token, not by a client-set role header —
 * a forged 'X-Role: ENGINEER' no longer grants anything. On a 401 (expired or
 * missing session) the local session is cleared so the app falls back to login.
 */
export const authFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const headers = new Headers(options.headers || {});
  const token = useAuthStore.getState().token;
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    useAuthStore.getState().logout();
  }
  return res;
};
