import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type User } from "./api";

type Auth = {
  // undefined while the first check is running, null when logged out
  user: User | null | undefined;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  // Is the browser's session cookie still valid?
  useEffect(() => {
    api<{ user: User }>("GET", "/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => setUser(null));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<{ user: User }>("POST", "/auth/login", { email, password });
    setUser(data.user);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const data = await api<{ user: User }>("POST", "/auth/register", { name, email, password });
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    await api("POST", "/auth/logout");
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, login, register, logout }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside AuthProvider");
  return auth;
};
