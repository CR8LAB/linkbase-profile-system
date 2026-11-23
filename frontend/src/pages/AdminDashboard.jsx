import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { API_BASE_URL } from "../apiBase.js";
import AdminPageLayout from "../components/AdminPageLayout.jsx";

function AdminDashboard() {
  const { role } = useOutletContext();
  const companyAdmin = role === "COMPANY_ADMIN";
  const [summary, setSummary] = useState(null);
  const [profiles, setProfiles] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function fetchSummary() {
      try {
        const endpoint = companyAdmin ? "/api/profiles/managed/list" : "/api/admin/summary";
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
          headers: {
            Authorization: `Bearer ${sessionStorage.getItem("token")}`,
          },
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.message || "Could not load dashboard");
        if (active) {
          if (companyAdmin) setProfiles(data.profiles);
          else setSummary(data.summary);
        }
      } catch (loadError) {
        if (active) setError(loadError.message);
      }
    }

    fetchSummary();
    return () => {
      active = false;
    };
  }, [companyAdmin]);

  return (
    <AdminPageLayout role={role}>
      <header className="admin-header">
        <h2>Dashboard</h2>
        <span>{companyAdmin ? "Company administrator" : "Administrator"}</span>
      </header>

      <section className="dashboard-welcome">
        <h1>Welcome to LinkBase</h1>
        <p>Manage your digital profiles and business connections.</p>
      </section>

      {error && <p className="error-message">{error}</p>}
      {companyAdmin ? (
        <section aria-labelledby="company-profiles-title">
          <h3 id="company-profiles-title">Company profiles</h3>
          {profiles?.length > 0 ? (
            <ul>
              {profiles.map(({ publicId, fullName, jobTitle }) => (
                <li key={publicId}>
                  <Link to={`/admin/profiles/${encodeURIComponent(publicId)}/edit`}>{fullName}</Link>
                  {jobTitle && ` · ${jobTitle}`}
                </li>
              ))}
            </ul>
          ) : profiles ? <p>No company profiles available.</p> : !error && <p>Loading profiles...</p>}
        </section>
      ) : summary ? (
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
    </AdminPageLayout>
  );
}

export default AdminDashboard;
