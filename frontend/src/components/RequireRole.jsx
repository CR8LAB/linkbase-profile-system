import { Navigate, Outlet, useLocation } from "react-router-dom";
import { getTokenSession } from "../utils/tokenSession.js";

function RequireRole({ role }) {
  const location = useLocation();
  const token = sessionStorage.getItem("token");
  const tokenSession = token
    ? getTokenSession(token)
    : { role: null, expired: false, invalid: false, expiresAt: null };
  const tokenRole = tokenSession.role;

  if (!tokenRole) {
    if (token) sessionStorage.removeItem("token");
    return (
      <Navigate
        to="/"
        replace
        state={{
          from: location,
          ...(tokenSession.expired
            ? {
                message: "Your session has expired. Please sign in again.",
                sessionExpired: true,
              }
            : {}),
        }}
      />
    );
  }

  if (![role].flat().includes(tokenRole)) {
    return (
      <Navigate to={["ADMIN", "COMPANY_ADMIN"].includes(tokenRole) ? "/admin" : "/dashboard"} replace />
    );
  }

  return <Outlet context={{ role: tokenRole }} />;
}

export default RequireRole;
