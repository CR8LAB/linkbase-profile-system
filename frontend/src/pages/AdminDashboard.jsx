function AdminDashboard() {
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <h2>LinkBase</h2>

        <nav>
          <a href="/admin">Dashboard</a>
          <a href="/admin/profiles">Profiles</a>
          <a href="/admin/companies">Companies</a>
          <a href="/admin/customers">Customers</a>
          <a href="/admin/analytics">Analytics</a>
        </nav>
      </aside>

      <main className="admin-content">
        <header className="admin-header">
          <h2>Dashboard</h2>
          <span>Administrator</span>
        </header>

        <section className="dashboard-welcome">
          <h1>Welcome to LinkBase</h1>
          <p>Manage your digital profiles and business connections.</p>
        </section>

        <section className="dashboard-stats">
          <div className="stat-card">
            <h3>Total Profiles</h3>
            <p>7</p>
          </div>

          <div className="stat-card">
            <h3>Companies</h3>
            <p>1</p>
          </div>

          <div className="stat-card">
            <h3>Customers</h3>
            <p>0</p>
          </div>

          <div className="stat-card">
            <h3>Total Scans</h3>
            <p>0</p>
          </div>
        </section>
      </main>
    </div>
  );
}

export default AdminDashboard;
