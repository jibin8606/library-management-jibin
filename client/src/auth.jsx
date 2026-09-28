import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!getToken()) return;
    api
      .get('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, [logout]);

  const finish = ({ token, user: u }) => {
    setToken(token);
    setUser(u);
    return u;
  };
  const login = async (email, password) => finish(await api.post('/auth/login', { email, password }));
  const register = async (name, email, password) => finish(await api.post('/auth/register', { name, email, password }));

  return <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>;
}
