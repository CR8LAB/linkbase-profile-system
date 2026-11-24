import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../apiBase.js";
import {
  SESSION_CHANGED_EVENT,
  SESSION_EXPIRED_EVENT,
  redirectToLoginAfterExpiry,
} from "../utils/sessionExpiry.js";
import { getTokenSession } from "../utils/tokenSession.js";

const warningLead = 2 * 60 * 1000;
const renewalInterval = 15 * 1000;
const activityEvents = ["pointerdown", "keydown", "wheel", "input"];

function SessionExpiryRedirect() {
  const navigate = useNavigate();
  const currentNavigate = useRef(navigate);
  const staySignedIn = useRef(null);
  const [warning, setWarning] = useState(null);

  useEffect(() => {
    currentNavigate.current = navigate;
  }, [navigate]);

  useEffect(() => {
    let active = true;
    let lastRenewal = 0;
    let renewing = false;
    let activityTimer;
    let warningTimer;
    let expiryTimer;
    const currentToken = () => window.sessionStorage.getItem("token");

    function clearDeadlines() {
      window.clearTimeout(warningTimer);
      window.clearTimeout(expiryTimer);
    }

    function handleExpired() {
      clearDeadlines();
      window.clearTimeout(activityTimer);
      activityTimer = undefined;
      setWarning(null);
      redirectToLoginAfterExpiry(currentNavigate.current);
    }

    function expire(token) {
      if (currentToken() !== token) return;
      window.sessionStorage.removeItem("token");
      handleExpired();
    }

    function synchronizeSession() {
      clearDeadlines();
      setWarning(null);
      const token = currentToken();
      if (!token) return;
      const session = getTokenSession(token);
      if (session.expired || session.invalid) {
        expire(token);
        return;
      }
      const remaining = session.expiresAt - Date.now();
      warningTimer = window.setTimeout(() => {
        if (currentToken() === token) {
          setWarning({ absolute: session.expiresAt === session.absoluteExpiresAt });
        }
      }, Math.max(0, remaining - warningLead));
      expiryTimer = window.setTimeout(() => expire(token), Math.max(0, remaining));
    }

    async function renewForActivity() {
      activityTimer = undefined;
      const token = currentToken();
      if (!token || renewing || document.visibilityState !== "visible") return;
      const session = getTokenSession(token);
      if (session.expired || session.invalid) {
        expire(token);
        return;
      }
      if (session.expiresAt === session.absoluteExpiresAt) return;

      renewing = true;
      lastRenewal = Date.now();
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/session/renew`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const data = await response.json();
        if (active && currentToken() === token && typeof data.token === "string") {
          window.sessionStorage.setItem("token", data.token);
          synchronizeSession();
        }
      } catch {
        // Keep the current deadline when renewal could not be confirmed.
      } finally {
        renewing = false;
      }
    }

    function recordActivity(event) {
      if (!event.isTrusted || event.repeat || document.visibilityState !== "visible" ||
          !currentToken() || activityTimer !== undefined) return;
      const delay = Math.max(0, lastRenewal + renewalInterval - Date.now());
      activityTimer = window.setTimeout(renewForActivity, delay);
    }

    staySignedIn.current = (event) => {
      if (!event.isTrusted) return;
      window.clearTimeout(activityTimer);
      void renewForActivity();
    };
    const initialSync = window.setTimeout(synchronizeSession, 0);
    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpired);
    window.addEventListener(SESSION_CHANGED_EVENT, synchronizeSession);
    document.addEventListener("visibilitychange", synchronizeSession);
    for (const event of activityEvents) window.addEventListener(event, recordActivity, { passive: true });

    return () => {
      active = false;
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpired);
      window.removeEventListener(SESSION_CHANGED_EVENT, synchronizeSession);
      document.removeEventListener("visibilitychange", synchronizeSession);
      for (const event of activityEvents) window.removeEventListener(event, recordActivity);
      window.clearTimeout(initialSync);
      window.clearTimeout(activityTimer);
      clearDeadlines();
    };
  }, []);

  if (!warning) return null;
  return (
    <div className="session-expiry-warning">
      <p role="status">
        {warning.absolute
          ? "Your eight-hour session ends in less than two minutes. Save your work before signing in again."
          : "Your session will expire in less than two minutes due to inactivity."}
      </p>
      {!warning.absolute && (
        <button type="button" onClick={(event) => staySignedIn.current?.(event)}>Stay signed in</button>
      )}
    </div>
  );
}

export default SessionExpiryRedirect;
