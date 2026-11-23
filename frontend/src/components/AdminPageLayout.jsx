import WorkspaceNavigation from "./WorkspaceNavigation.jsx";

function AdminPageLayout({ children, role = "ADMIN" }) {
  return (
    <div className="admin-workspace">
      <WorkspaceNavigation role={role} />
      <main className="admin-content">{children}</main>
    </div>
  );
}

export default AdminPageLayout;
