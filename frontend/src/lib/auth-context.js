import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authAPI } from "./api";

const AuthContext = createContext(null);

const BACKEND_URL = "https://replyzen-ai01-production.up.railway.app";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem("replyzen_token");
    const savedUser = localStorage.getItem("replyzen_user");
    if (savedToken && savedUser) {
      setToken(savedToken);
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem("replyzen_user");
      }
      // Auto refresh user from backend to get latest plan
      authAPI.getMe()
        .then(res => {
          setUser(res.data);
          localStorage.setItem("replyzen_user", JSON.stringify(res.data));
        })
        .catch(() => {});
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await authAPI.login({ email, password });
    const { token: newToken, user: userData } = res.data;
    localStorage.setItem("replyzen_token", newToken);
    localStorage.setItem("replyzen_user", JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
    return userData;
  }, []);

  const register = useCallback(async (email, password, fullName) => {
    const res = await authAPI.register({ email, password, full_name: fullName });
    const { token: newToken, user: userData } = res.data;
    localStorage.setItem("replyzen_token", newToken);
    localStorage.setItem("replyzen_user", JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
    return userData;
  }, []);

  const loginWithGoogle = useCallback(async (code, redirectUri) => {
    const res = await authAPI.googleCallback(code, redirectUri);
    const { token: newToken, user: userData } = res.data;
    localStorage.setItem("replyzen_token", newToken);
    localStorage.setItem("replyzen_user", JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
    return { user: userData, isNewUser: res.data.is_new_user };
  }, []);

  const getGoogleAuthUrl = useCallback(async (redirectUri) => {
    const url = `${BACKEND_URL}/api/auth/google/url?redirect_uri=${encodeURIComponent(redirectUri)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to get Google auth URL: ${res.status}`);
    const data = await res.json();
    return data.url || data.auth_url;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("replyzen_token");
    localStorage.removeItem("replyzen_user");
    setToken(null);
    setUser(null);
  }, []);

  // Full re-fetch from backend — use when you want to sync all user fields
  const refreshUser = useCallback(async () => {
    try {
      const res = await authAPI.getMe();
      setUser(res.data);
      localStorage.setItem("replyzen_user", JSON.stringify(res.data));
    } catch (err) {
      // Log so it's visible in devtools instead of disappearing silently
      console.warn("[refreshUser] failed:", err?.response?.status, err?.message);
    }
  }, []);

  // ✅ NEW: patchUser — directly merges a partial update into the current user
  // state WITHOUT needing a backend round-trip. Use this when you already know
  // the new value (e.g. admin just successfully saved plan = "pro" to DB) and
  // want the sidebar / billing page to reflect it immediately.
  //
  // Unlike refreshUser() which can silently fail if the network blips, this is
  // a pure synchronous React state update — it ALWAYS works.
  const patchUser = useCallback((updates) => {
    setUser(prev => {
      if (!prev) return prev;
      const merged = { ...prev, ...updates };
      // Keep localStorage in sync so the next page load also shows the right plan
      localStorage.setItem("replyzen_user", JSON.stringify(merged));
      return merged;
    });
  }, []);

  return (
    <AuthContext.Provider value={{
      user, token, loading,
      login, register, logout,
      refreshUser,
      patchUser,        // ← now available to any component via useAuth()
      loginWithGoogle, getGoogleAuthUrl,
      isAuthenticated: !!token
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
