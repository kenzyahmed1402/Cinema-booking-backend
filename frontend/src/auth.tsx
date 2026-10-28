import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "./api";
import type { User } from "./types";
import { AuthDialog } from "./components/AuthDialog";

type Auth = {
  // undefined while the first check is running, null for a visitor
  user: User | null | undefined;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  continueAsGuest: () => Promise<void>;
  // Turns the guest account into a normal one, keeping its bookings
  upgrade: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  // For actions that need an account (book, confirm, pay, cancel): resolves
  // with the user, asking a visitor to log in, register or continue as a
  // guest first; null if they close the dialog
  requireUser: (reason?: string) => Promise<User | null>;
};

const AuthContext = createContext<Auth | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [dialogReason, setDialogReason] = useState<string | null>(null);
  const waiting = useRef<((user: User | null) => void) | null>(null);

  // Is the browser's session cookie still valid?
  useEffect(() => {
    api<{ user: User }>("GET", "/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => setUser(null));
  }, []);

  const finish = useCallback((next: User | null) => {
    setDialogReason(null);
    waiting.current?.(next);
    waiting.current = null;
  }, []);

  const loggedIn = useCallback(
    (next: User) => {
      setUser(next);
      finish(next);
    },
    [finish]
  );

  const login = useCallback(
    async (email: string, password: string) => {
      loggedIn((await api<{ user: User }>("POST", "/auth/login", { email, password })).user);
    },
    [loggedIn]
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      loggedIn((await api<{ user: User }>("POST", "/auth/register", { name, email, password })).user);
    },
    [loggedIn]
  );

  const continueAsGuest = useCallback(async () => {
    loggedIn((await api<{ user: User }>("POST", "/auth/guest")).user);
  }, [loggedIn]);

  const upgrade = useCallback(async (name: string, email: string, password: string) => {
    setUser((await api<{ user: User }>("POST", "/auth/upgrade", { name, email, password })).user);
  }, []);

  const logout = useCallback(async () => {
    await api("POST", "/auth/logout");
    setUser(null);
  }, []);

  const requireUser = useCallback(
    (reason = "Log in to continue") => {
      if (user) return Promise.resolve(user);
      waiting.current?.(null);
      setDialogReason(reason);
      return new Promise<User | null>((resolve) => {
        waiting.current = resolve;
      });
    },
    [user]
  );

  return (
    <AuthContext.Provider value={{ user, login, register, continueAsGuest, upgrade, logout, requireUser }}>
      {children}
      {dialogReason !== null && <AuthDialog reason={dialogReason} onClose={() => finish(null)} />}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside AuthProvider");
  return auth;
};
