import { create } from 'zustand';

export type Role = 'SURVEYOR' | 'ENGINEER';

interface AuthState {
  role: Role;
  setRole: (role: Role) => void;
  toggleRole: () => void;
}

const savedRole = (typeof window !== 'undefined' ? localStorage.getItem('midc_user_role') : null) as Role;
const initialRole: Role = (savedRole === 'ENGINEER' || savedRole === 'SURVEYOR') ? savedRole : 'ENGINEER';

export const useAuthStore = create<AuthState>((set) => ({
  role: initialRole,
  setRole: (role) => {
    if (typeof window !== 'undefined') localStorage.setItem('midc_user_role', role);
    set({ role });
  },
  toggleRole: () => set((state) => {
    const nextRole: Role = state.role === 'SURVEYOR' ? 'ENGINEER' : 'SURVEYOR';
    if (typeof window !== 'undefined') localStorage.setItem('midc_user_role', nextRole);
    return { role: nextRole };
  }),
}));
