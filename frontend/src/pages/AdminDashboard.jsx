import { useEffect, useState } from "react";
import { API_BASE_URL } from "../apiBase.js";

function AdminDashboard() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function fetchSummary() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/admin/summary`, {
          headers: {
            Authorization: `Bearer ${sessionStorage.getItem("token")}`,
          },
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.message || "Could not load dashboard");
        if (active) setSummary(data.summary);
      } catch (loadError) {
        if (active) setError(loadError.message);
      }
    }

    fetchSummary();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <h2>LinkBase</h2>

        <nav>
          <a href="/admin">Dashboard</a>
          <a href="/admin/profiles">Profiles</a>
          <a href="/admin/companies">Companies</a>
          <a href="/admin/customers">Customers</a>
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

        {error && <p className="error-message">{error}</p>}
        {summary ? (
          <section className="dashboard-stats">
            <div className="stat-card">
              <h3>Total Profiles</h3>
              <p>{summary.totalProfiles}</p>
            </div>
            <div className="stat-card">
              <h3>Companies</h3>
              <p>{summary.companies}</p>
            </div>
            <div className="stat-card">
              <h3>Customers</h3>
              <p>{summary.customers}</p>
            </div>
            <div className="stat-card">
              <h3>Unassigned Profiles</h3>
              <p>{summary.unassignedProfiles}</p>
            </div>
          </section>
        ) : !error ? (
          <p>Loading dashboard...</p>
        ) : null}
      </main>
    </div>
  );
}

export default AdminDashboard;
