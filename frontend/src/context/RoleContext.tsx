import React, { createContext, useContext, useState, useEffect } from 'react';

export type UserRole = 'SURVEYOR' | 'ENGINEER';

interface RoleContextType {
  role: UserRole;
  setRole: (role: UserRole) => void;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export const RoleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [role, setRoleState] = useState<UserRole>(() => {
    const saved = localStorage.getItem('midc_user_role');
    return (saved === 'ENGINEER' || saved === 'SURVEYOR') ? saved : 'ENGINEER';
  });

  const setRole = (newRole: UserRole) => {
    setRoleState(newRole);
    localStorage.setItem('midc_user_role', newRole);
  };

  const authFetch = (url: string, options: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(options.headers || {});
    headers.set('X-Role', role);
    return fetch(url, {
      ...options,
      headers
    });
  };

  return (
    <RoleContext.Provider value={{ role, setRole, authFetch }}>
      {children}
    </RoleContext.Provider>
  );
};

export const useRole = (): RoleContextType => {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
};
