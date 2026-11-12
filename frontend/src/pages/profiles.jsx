import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../apiBase.js";
import AdminPageLayout from "../components/AdminPageLayout.jsx";

function Profiles() {
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [profiles, setProfiles] = useState([]);

  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [error, setError] = useState("");
  const [inviteEmails, setInviteEmails] = useState({});
  const [invitingProfileId, setInvitingProfileId] = useState("");
  const [inviteFeedback, setInviteFeedback] = useState({});
  const [deletingProfileId, setDeletingProfileId] = useState("");
  const [deleteFeedback, setDeleteFeedback] = useState("");
  const navigate = useNavigate();

  // Load companies when the page opens
  useEffect(() => {
    async function fetchCompanies() {
      try {
        const token = sessionStorage.getItem("token");

        const response = await fetch(`${API_BASE_URL}/api/companies`, {
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
      return;
    }

    async function fetchProfiles() {
      try {
        setLoadingProfiles(true);
        setError("");

        const token = sessionStorage.getItem("token");

        const response = await fetch(
          `${API_BASE_URL}/api/companies/${selectedCompany}/profiles`,
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

  async function sendClaimInvitation(event, profile) {
    event.preventDefault();
    setInvitingProfileId(profile.publicId);
    setInviteFeedback((previous) => ({ ...previous, [profile.publicId]: "" }));

    try {
      const token = sessionStorage.getItem("token");
      const response = await fetch(
        `${API_BASE_URL}/api/auth/profiles/${encodeURIComponent(profile.publicId)}/claim-invitations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ email: inviteEmails[profile.publicId] || "" }),
        },
      );
      const data = await response.json();

      if (!response.ok)
        throw new Error(data.message || "Could not send invitation");

      setInviteFeedback((previous) => ({
        ...previous,
        [profile.publicId]: "Invitation sent.",
      }));
    } catch (inviteError) {
      setInviteFeedback((previous) => ({
        ...previous,
        [profile.publicId]: inviteError.message,
      }));
    } finally {
      setInvitingProfileId("");
    }
  }

  async function deleteProfile(profile) {
    const assignedWarning = profile.user
      ? "\n\nThis profile is assigned to a customer. Deleting it will remove their public profile, but their login account will remain active."
      : "";
    const confirmed = window.confirm(
      `Delete ${profile.fullName} (${profile.publicId})?${assignedWarning}`,
    );
    if (!confirmed) return;

    setDeletingProfileId(profile.publicId);
    setError("");
    setDeleteFeedback("");

    try {
      const token = sessionStorage.getItem("token");
      const response = await fetch(
        `${API_BASE_URL}/api/admin/profiles/${encodeURIComponent(profile.publicId)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Could not delete profile");
      }

      const refreshResponse = await fetch(
        `${API_BASE_URL}/api/companies/${encodeURIComponent(selectedCompany)}/profiles`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const refreshedData = await refreshResponse.json();
      if (!refreshResponse.ok) {
        setDeleteFeedback("Profile deleted, but the list could not be refreshed.");
        throw new Error(refreshedData.message || "Failed to refresh profiles");
      }

      setProfiles(refreshedData.profiles);
      setDeleteFeedback(`${profile.fullName} (${profile.publicId}) was deleted.`);
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setDeletingProfileId("");
    }
  }

  return (
    <AdminPageLayout>
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
      {deleteFeedback && <p role="status">{deleteFeedback}</p>}

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

                {!profile.user && (
                  <form
                    className="profile-invite-form"
                    onSubmit={(event) => sendClaimInvitation(event, profile)}
                  >
                    <label htmlFor={`invite-${profile.publicId}`}>
                      Customer email
                    </label>
                    <input
                      id={`invite-${profile.publicId}`}
                      type="email"
                      autoComplete="email"
                      value={inviteEmails[profile.publicId] || ""}
                      onChange={(event) =>
                        setInviteEmails((previous) => ({
                          ...previous,
                          [profile.publicId]: event.target.value,
                        }))
                      }
                      required
                    />
                    <button
                      type="submit"
                      className="profile-edit-button"
                      disabled={invitingProfileId === profile.publicId}
                    >
                      {invitingProfileId === profile.publicId
                        ? "Sending..."
                        : "Send claim invitation"}
                    </button>
                    {inviteFeedback[profile.publicId] && (
                      <p className="invite-feedback" role="status">
                        {inviteFeedback[profile.publicId]}
                      </p>
                    )}
                  </form>
                )}

                <button
                  className="profile-edit-button"
                  disabled={Boolean(deletingProfileId)}
                  onClick={() => deleteProfile(profile)}
                >
                  {deletingProfileId === profile.publicId
                    ? "Deleting..."
                    : "Delete Profile"}
                </button>

                <button
                  className="profile-edit-button"
                  onClick={() =>
                    navigate(
                      `/admin/profiles/${encodeURIComponent(profile.publicId)}/edit`,
                    )
                  }
                >
                  Edit Profile
                </button>
              </div>
            ))}
          </div>

          {profiles.length === 0 && <p>No profiles found for this company.</p>}
        </div>
      )}
    </AdminPageLayout>
  );
}

export default Profiles;
