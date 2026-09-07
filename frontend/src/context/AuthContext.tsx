import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authService } from '../services/authService';
import type { User, Role } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, role?: Role) => Promise<User>;
  logout: () => void;
  getMe: () => Promise<User | null>;
  refreshProfile: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => authService.current());
  const [loading, setLoading] = useState<boolean>(true);

  const getMe = useCallback(async (): Promise<User | null> => {
    const token = localStorage.getItem('token') || localStorage.getItem('cs-token');
    if (!token) {
      setUser(null);
      setLoading(false);
      return null;
    }

    try {
      const verified = await authService.getMe();
      setUser(verified);
      return verified;
    } catch (err) {
      console.warn('Auth check failed:', err);
      const cached = authService.current();
      setUser(cached);
      return cached;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getMe();
  }, [getMe]);

  const login = async (email: string, password: string, role?: Role): Promise<User> => {
    setLoading(true);
    try {
      const authenticatedUser = await authService.login(email, password, role);
      setUser(authenticatedUser);
      return authenticatedUser;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    authService.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isLoading: loading,
        isAuthenticated: !!user,
        login,
        logout,
        getMe,
        refreshProfile: getMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

