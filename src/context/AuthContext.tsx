import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  kycStatus: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = 'http://localhost:5000/api';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize auth from localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem('finflow_token');
    const storedUser = localStorage.getItem('finflow_user');

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
      axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const res = await axios.post(`${API_URL}/auth/login`, { email, password });
      const { token: returnedToken, user: returnedUser } = res.data;

      setToken(returnedToken);
      setUser(returnedUser);
      localStorage.setItem('finflow_token', returnedToken);
      localStorage.setItem('finflow_user', JSON.stringify(returnedUser));
      axios.defaults.headers.common['Authorization'] = `Bearer ${returnedToken}`;
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Failed to login');
    }
  };

  const register = async (name: string, email: string, password: string) => {
    try {
      await axios.post(`${API_URL}/auth/register`, { name, email, password });

      // Automatically log them in after registration
      // (Or let them log in manually. The backend register endpoint returns user and wallet, let's auto-login if token is returned or let them login)
      // Since our backend returns message, user, wallet (not token), we log them in by calling login inside frontend or let them log in manually.
      // Let's call login internally to auto-loginCarol/user for speed.
      await login(email, password);
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Failed to register');
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('finflow_token');
    localStorage.removeItem('finflow_user');
    delete axios.defaults.headers.common['Authorization'];
  };

  const refreshProfile = async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API_URL}/auth/profile`);
      setUser(res.data);
      localStorage.setItem('finflow_user', JSON.stringify(res.data));
    } catch (err) {
      console.error('Failed to refresh profile:', err);
      // If unauthorized, log out
      logout();
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
