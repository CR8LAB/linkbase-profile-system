import { Link, NavLink, useNavigate } from "react-router-dom";

const navigationByRole = {
  ADMIN: [
    { label: "Dashboard", to: "/admin", end: true },
    { label: "Companies", to: "/admin/companies" },
    { label: "Customers", to: "/admin/customers" },
    { label: "Profiles", to: "/admin/profiles" },
  ],
  CUSTOMER: [
    { label: "My Profile", to: "/dashboard", end: true },
    { label: "Edit Profile", to: "/dashboard/edit" },
    { label: "Social Links", to: "/dashboard/social-links" },
    { label: "Account", to: "/dashboard#account", end: true },
  ],
};

function WorkspaceNavigation({ role }) {
  const navigate = useNavigate();

  function logout() {
    sessionStorage.removeItem("token");
    navigate("/", { replace: true });
  }

  return (
    <header className="workspace-navigation">
      <Link
        className="workspace-navigation-brand"
        to={role === "ADMIN" ? "/admin" : "/dashboard"}
      >
        LinkBase
      </Link>
      <nav
        aria-label={`${role === "ADMIN" ? "Administrator" : "Customer"} navigation`}
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
      >
        Log Out
      </button>
    </header>
  );
}

export default WorkspaceNavigation;
