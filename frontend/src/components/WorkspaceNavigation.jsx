import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../apiBase.js";

const navigationByRole = {
  ADMIN: [
    { label: "Dashboard", to: "/admin", end: true },
    { label: "Companies", to: "/admin/companies" },
    { label: "Customers", to: "/admin/customers" },
    { label: "Profiles", to: "/admin/profiles" },
  ],
  COMPANY_ADMIN: [{ label: "Profiles", to: "/admin" }],
  CUSTOMER: [
    { label: "My Profile", to: "/dashboard", end: true },
    { label: "Edit Profile", to: "/dashboard/edit" },
    { label: "Social Links", to: "/dashboard/social-links" },
    { label: "Account", to: "/dashboard#account", end: true },
  ],
};

function WorkspaceNavigation({ role }) {
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);

    let logoutWarning = "";

    try {
      const token = sessionStorage.getItem("token");
      if (token) {
        const abortController = new AbortController();
        const timeoutId = window.setTimeout(() => abortController.abort(), 5000);

        try {
          const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            signal: abortController.signal,
          });

          if (!response.ok) {
            logoutWarning =
              "Local logout succeeded, but server-side session revocation could not be confirmed.";
          }
        } catch {
          logoutWarning =
            "Local logout succeeded, but server-side session revocation could not be confirmed.";
        } finally {
          window.clearTimeout(timeoutId);
        }
      }
    } catch {
      logoutWarning =
        "Local logout succeeded, but server-side session revocation could not be confirmed.";
    } finally {
      sessionStorage.removeItem("token");
      navigate(
        "/",
        {
          replace: true,
          state: {
            message: "You have been logged out.",
            logoutWarning,
          },
        },
      );
    }
  }

  return (
    <header className="workspace-navigation">
      <Link
        className="workspace-navigation-brand"
        to={role === "CUSTOMER" ? "/dashboard" : "/admin"}
      >
        LinkBase
      </Link>
      <nav
        aria-label={`${role === "CUSTOMER" ? "Customer" : "Administrator"} navigation`}
      >
        {navigationByRole[role].map((item) =>
          item.label === "Account" ? (
            <Link
              key={item.label}
              to={item.to}
              className="workspace-navigation-link"
            >
              {item.label}
            </Link>
          ) : (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `workspace-navigation-link${isActive ? " active" : ""}`
              }
            >
              {item.label}
            </NavLink>
          ),
        )}
      </nav>
      <button
        type="button"
        className="workspace-logout-button"
        onClick={logout}
        disabled={loggingOut}
      >
        {loggingOut ? "Logging out..." : "Log Out"}
      </button>
    </header>
  );
}

export default WorkspaceNavigation;
