import WorkspaceNavigation from "./WorkspaceNavigation.jsx";

function AdminPageLayout({ children }) {
  return (
    <div className="admin-workspace">
      <WorkspaceNavigation role="ADMIN" />
      <main className="admin-content">{children}</main>
    </div>
  );
}

export default AdminPageLayout;
