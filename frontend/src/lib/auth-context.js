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

  // ✅ KEY FIX: Use plain fetch instead of axios
  // axios has withCredentials:true which triggers a CORS preflight on this
  // public endpoint — plain fetch avoids this entirely
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

  const refreshUser = useCallback(async () => {
    try {
      const res = await authAPI.getMe();
      setUser(res.data);
      localStorage.setItem("replyzen_user", JSON.stringify(res.data));
    } catch {
      // silently fail
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user, token, loading,
      login, register, logout, refreshUser,
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
