import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, onUnauthorized } from '../lib/api';
import type { IdentifyResult, Permission, SessionUser } from '../lib/types';
import { einmalig, ME_TIMEOUT_MS, pruefeSitzung, pruefFehlerText, type SessionResponse } from './sitzungPruefen';

/** Anmeldeschritte warten nicht ewig (hängende Verbindung) – der Knopf zeigt dann eine Meldung. */
const LOGIN_TIMEOUT_MS = 20000;

interface AuthState {
  user: SessionUser | null;
  /** true, solange die Sitzung beim Start geprüft wird (auch während der Wiederholungen). */
  loading: boolean;
  /** Prüfung beim Start endgültig gescheitert (Server nicht erreichbar) – nicht dasselbe wie abgemeldet. */
  checkError?: string;
  /** Zweiter oder dritter Versuch der Prüfung läuft. */
  retrying: boolean;
  /** Prüfung erneut starten (Knopf „Erneut versuchen“). */
  retry: () => void;
  can: (permission: Permission) => boolean;
  /** Schritt 1: E-Mail prüfen. Bei „signed-in“ (bekannte Lehrkraft) ist die Anmeldung schon erfolgt. */
  identify: (email: string) => Promise<IdentifyResult>;
  /** Schritt 2: Passwort für Admin und Druck-Team. */
  login: (email: string, password: string) => Promise<void>;
  /** Unbekannte E-Mail als Lehrkraft anlegen und direkt anmelden. */
  register: (email: string) => Promise<void>;
  /** Passwort über den Link aus der Mail festlegen – danach angemeldet. */
  setPasswordWithLink: (token: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  sessionExpired: boolean;
  /** Direkt nach dem Anmelden wieder abgemeldet: Der Browser hat das Sitzungs-Cookie nicht gespeichert. */
  cookiesBlocked: boolean;
  /** true nach bewusstem Abmelden – dann wird die letzte Seite nicht gemerkt. */
  loggedOut: boolean;
}

const AuthContext = createContext<AuthState | null>(null);
/** So kurz nach dem Anmelden gilt „nicht angemeldet“ als blockiertes Cookie, nicht als abgelaufene Sitzung. */
const COOKIE_CHECK_MS = 60_000;
const SIGNED_OUT: SessionResponse = { user: null, permissions: [] };
const fetchMe = () => api<SessionResponse>('/auth/me', { silent401: true, timeoutMs: ME_TIMEOUT_MS });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionResponse>(SIGNED_OUT);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [checkError, setCheckError] = useState<string>();
  const [sessionExpired, setSessionExpired] = useState(false);
  const [cookiesBlocked, setCookiesBlocked] = useState(false);
  const [loggedOut, setLoggedOut] = useState(false);
  // Zählt An- und Abmeldungen: eine Antwort, die vorher losgeschickt wurde, darf den neuen Stand nicht überschreiben
  // (z. B. die Startprüfung, die erst nach dem Login zurückkommt).
  const generation = useRef(0);
  const userRef = useRef<SessionUser | null>(null);
  userRef.current = session.user;
  const signedInAt = useRef(0);

  const check = useCallback(() => {
    const gen = generation.current;
    setLoading(true);
    setCheckError(undefined);
    pruefeSitzung(fetchMe, { onRetry: () => setRetrying(true) })
      .then((s) => {
        if (gen === generation.current) setSession(s);
      })
      .catch((err) => {
        if (gen === generation.current) setCheckError(pruefFehlerText(err));
      })
      .finally(() => {
        setRetrying(false);
        setLoading(false);
      });
  }, []);

  useEffect(check, [check]);

  // Eine 401 (z. B. von einer Hintergrundabfrage) meldet nicht sofort ab: erst /auth/me fragen.
  // Nur wenn der Server bestätigt „nicht angemeldet“, gilt die Sitzung als abgelaufen. Netzfehler → Sitzung bleibt.
  useEffect(() => {
    const confirm = einmalig(async () => {
      if (!userRef.current) return;
      const gen = generation.current;
      try {
        const s = await pruefeSitzung(fetchMe);
        if (gen !== generation.current) return;
        if (!s.user) {
          generation.current++;
          // Gerade erst angemeldet und schon „nicht angemeldet“: Der Browser hat das Sitzungs-Cookie nicht gespeichert
          // (z. B. Edge mit blockierten Cookies für diese Adresse) – das sagen statt „Sitzung abgelaufen“.
          if (Date.now() - signedInAt.current < COOKIE_CHECK_MS) setCookiesBlocked(true);
          else setSessionExpired(true);
        }
        setSession(s);
      } catch {
        /* Server nicht erreichbar: angemeldet bleiben, die Seite zeigt ihren eigenen Fehler. */
      }
    });
    onUnauthorized(() => void confirm());
  }, []);

  const signedIn = useCallback((result: SessionResponse) => {
    generation.current++;
    signedInAt.current = Date.now();
    setLoading(false);
    setSessionExpired(false);
    setCookiesBlocked(false);
    setLoggedOut(false);
    setCheckError(undefined);
    setSession({ user: result.user, permissions: result.permissions });
  }, []);

  const identify = useCallback(
    async (email: string) => {
      const result = await api<{ result: IdentifyResult } & Partial<SessionResponse>>('/auth/identify', {
        method: 'POST',
        body: { email },
        silent401: true,
        timeoutMs: LOGIN_TIMEOUT_MS,
      });
      if (result.result === 'signed-in' && result.user) signedIn({ user: result.user, permissions: result.permissions ?? [] });
      return result.result;
    },
    [signedIn],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api<SessionResponse>('/auth/login', {
        method: 'POST',
        body: { email, password },
        silent401: true,
        timeoutMs: LOGIN_TIMEOUT_MS,
      });
      signedIn(result);
    },
    [signedIn],
  );

  const register = useCallback(
    async (email: string) => {
      const result = await api<SessionResponse>('/auth/register', { method: 'POST', body: { email }, silent401: true, timeoutMs: LOGIN_TIMEOUT_MS });
      signedIn(result);
    },
    [signedIn],
  );

  const setPasswordWithLink = useCallback(
    async (token: string, password: string) => {
      const result = await api<SessionResponse>('/auth/passwort-setzen', { method: 'POST', body: { token, password }, silent401: true, timeoutMs: LOGIN_TIMEOUT_MS });
      signedIn(result);
    },
    [signedIn],
  );

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST', silent401: true, timeoutMs: LOGIN_TIMEOUT_MS });
    } catch (err) {
      // 401 = Sitzung war schon weg, also abgemeldet. Sonst angemeldet bleiben, damit erneut versucht werden kann.
      if (!(err instanceof ApiError && err.status === 401)) throw err;
    }
    generation.current++;
    setLoading(false);
    setLoggedOut(true);
    setSessionExpired(false);
    setSession(SIGNED_OUT);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user: session.user,
      loading,
      checkError,
      retrying,
      retry: check,
      can: (p) => session.permissions.includes(p),
      identify,
      login,
      register,
      setPasswordWithLink,
      logout,
      sessionExpired,
      cookiesBlocked,
      loggedOut,
    }),
    [session, loading, checkError, retrying, check, identify, login, register, setPasswordWithLink, logout, sessionExpired, cookiesBlocked, loggedOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth muss innerhalb von AuthProvider verwendet werden.');
  return ctx;
}
