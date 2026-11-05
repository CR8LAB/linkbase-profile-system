import { Navigate, Outlet, useLocation } from "react-router-dom";

function getTokenRole(token) {
  try {
    const encodedPayload = token.split(".")[1];
    const base64 = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(
      atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")),
    );

    if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) {
      return null;
    }

    return payload.role;
  } catch {
    return null;
  }
}

function RequireRole({ role }) {
  const location = useLocation();
  const token = sessionStorage.getItem("token");
  const tokenRole = token ? getTokenRole(token) : null;

  if (!tokenRole) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  if (tokenRole !== role) {
    return (
      <Navigate to={tokenRole === "ADMIN" ? "/admin" : "/dashboard"} replace />
    );
  }

  return <Outlet />;
}

export default RequireRole;
