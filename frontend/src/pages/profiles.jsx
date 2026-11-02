import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function Profiles() {
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [profiles, setProfiles] = useState([]);

  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  // Load companies when the page opens
  useEffect(() => {
    async function fetchCompanies() {
      try {
        const token = sessionStorage.getItem("token");

        const response = await fetch("http://localhost:5000/api/companies", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Failed to load companies");
        }

        setCompanies(data.companies);

        if (data.companies.length > 0) {
          setSelectedCompany(data.companies[0].id);
        }
      } catch (error) {
        setError(error.message);
      } finally {
        setLoadingCompanies(false);
      }
    }

    fetchCompanies();
  }, []);

  // Load profiles whenever the selected company changes
  useEffect(() => {
    if (!selectedCompany) {
      setProfiles([]);
      return;
    }

    async function fetchProfiles() {
      try {
        setLoadingProfiles(true);
        setError("");

        const token = sessionStorage.getItem("token");

        const response = await fetch(
          `http://localhost:5000/api/companies/${selectedCompany}/profiles`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Failed to load profiles");
        }

        setProfiles(data.profiles);
      } catch (error) {
        setError(error.message);
        setProfiles([]);
      } finally {
        setLoadingProfiles(false);
      }
    }

    fetchProfiles();
  }, [selectedCompany]);

  return (
    <div className="admin-content">
      <header className="admin-header">
        <h2>Profiles</h2>
        <span>Profile Management</span>
      </header>

      <section className="dashboard-welcome">
        <h1>Manage Profiles</h1>
        <p>Manage digital business cards across your companies.</p>
        <button
          className="profile-edit-button"
          onClick={() => navigate("/admin/profiles/create")}
        >
          + Create Profile
        </button>
      </section>

      <div className="company-selector">
        <label htmlFor="company">Select Company</label>

        <select
          id="company"
          value={selectedCompany}
          onChange={(e) => setSelectedCompany(e.target.value)}
          disabled={loadingCompanies}
        >
          <option value="">
            {loadingCompanies ? "Loading companies..." : "Select a company"}
          </option>

          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="error-message">{error}</p>}

      {loadingProfiles && <p>Loading profiles...</p>}

      {!loadingCompanies && !selectedCompany && (
        <p>No companies found. Create a company first.</p>
      )}

      {!loadingProfiles && selectedCompany && !error && (
        <div className="profiles-list">
          <h3>Total Profiles: {profiles.length}</h3>

          <div className="profiles-grid">
            {profiles.map((profile) => (
              <div className="profile-card" key={profile.publicId}>
                <div className="profile-card-header">
                  {profile.photoUrl ? (
                    <img
                      src={profile.photoUrl}
                      alt={profile.fullName}
                      className="profile-avatar"
                    />
                  ) : (
                    <div className="profile-avatar-placeholder">
                      {profile.fullName?.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div>
                    <h3>{profile.fullName}</h3>
                    <p>{profile.jobTitle || "No job title added"}</p>
                  </div>
                </div>

                <div className="profile-card-details">
                  <small>{profile.publicId}</small>

                  <span
                    className={
                      profile.user ? "status-assigned" : "status-unassigned"
                    }
                  >
                    {profile.user ? "Assigned" : "Unassigned"}
                  </span>
                </div>

                {profile.user && (
                  <p className="assigned-email">{profile.user.email}</p>
                )}

                <button
                  className="profile-edit-button"
                  onClick={() => {
                    window.location.href = `/admin/profiles/${profile.publicId}/edit`;
                  }}
                >
                  Edit Profile
                </button>
              </div>
            ))}
          </div>

          {profiles.length === 0 && <p>No profiles found for this company.</p>}
        </div>
      )}
    </div>
  );
}

export default Profiles;
