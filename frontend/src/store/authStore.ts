import { create } from 'zustand';

export type Role = 'SURVEYOR' | 'ENGINEER';

const STORAGE_KEY = 'midc_user_role';

interface AuthState {
  role: Role;
  setRole: (role: Role) => void;
  toggleRole: () => void;
}

const readSavedRole = (): Role => {
  if (typeof window === 'undefined') return 'ENGINEER';
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === 'ENGINEER' || saved === 'SURVEYOR' ? saved : 'ENGINEER';
};

const persist = (role: Role) => {
  if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, role);
};

export const useAuthStore = create<AuthState>((set) => ({
  role: readSavedRole(),
  setRole: (role) => {
    persist(role);
    set({ role });
  },
  toggleRole: () =>
    set((state) => {
      const nextRole: Role = state.role === 'SURVEYOR' ? 'ENGINEER' : 'SURVEYOR';
      persist(nextRole);
      return { role: nextRole };
    }),
}));

/**
 * fetch() with the caller's current role attached.
 *
 * The backend authorises on the X-Role header, so every call that hits a
 * role-gated endpoint must carry it. This used to be hand-written at each call
 * site, which is how the admin screen ended up hardcoding 'ENGINEER' regardless
 * of who was actually signed in. Route requests through here instead.
 *
 * Readable outside React (the store is not a hook here), so it works in
 * loaders and event handlers as well as components.
 */
export const authFetch = (url: string, options: RequestInit = {}): Promise<Response> => {
  const headers = new Headers(options.headers || {});
  headers.set('X-Role', useAuthStore.getState().role);
  return fetch(url, { ...options, headers });
};
