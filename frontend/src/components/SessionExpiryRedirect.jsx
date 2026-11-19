import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  SESSION_EXPIRED_EVENT,
  SESSION_EXPIRED_MESSAGE,
  redirectToLoginAfterExpiry,
} from "../utils/sessionExpiry.js";
import { getTokenSession } from "../utils/tokenSession.js";

function SessionExpiryRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    let timeoutId;
    function handleSessionExpired() {
      redirectToLoginAfterExpiry(navigate);
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    const token = window.sessionStorage.getItem("token");
    if (token) {
      const tokenSession = getTokenSession(token);
      if (tokenSession.expired || tokenSession.invalid || !tokenSession.expiresAt) {
        window.sessionStorage.removeItem("token");
        navigate("/", {
          replace: true,
          state: { message: SESSION_EXPIRED_MESSAGE, sessionExpired: true },
        });
      } else {
        timeoutId = window.setTimeout(() => {
          if (!window.sessionStorage.getItem("token")) return;
          window.sessionStorage.removeItem("token");
          navigate("/", {
            replace: true,
            state: { message: SESSION_EXPIRED_MESSAGE, sessionExpired: true },
          });
        }, Math.max(0, tokenSession.expiresAt - Date.now()));
      }
    }

    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [navigate]);

  return null;
}

export default SessionExpiryRedirect;
