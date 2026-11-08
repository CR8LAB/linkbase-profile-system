import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import WorkspaceNavigation from "../components/WorkspaceNavigation.jsx";
import { API_BASE_URL } from "../apiBase.js";

function CustomerDashboard() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchMyProfile() {
      try {
        const token = sessionStorage.getItem("token");

        const response = await fetch(
          `${API_BASE_URL}/api/profiles/my-profile`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Failed to load profile");
        }

        setProfile(data.profile);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchMyProfile();
  }, []);

  if (loading) {
    return (
      <div className="customer-dashboard">
        <WorkspaceNavigation role="CUSTOMER" />
        <div className="customer-loading">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="customer-dashboard">
        <WorkspaceNavigation role="CUSTOMER" />
        <div className="customer-loading">{error}</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="customer-dashboard">
        <WorkspaceNavigation role="CUSTOMER" />
        <div className="customer-loading">No profile assigned.</div>
      </div>
    );
  }

  const initials = profile.fullName
    .split(" ")
    .map((name) => name[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="customer-dashboard">
      <WorkspaceNavigation role="CUSTOMER" />

      <main className="customer-main">
        <header className="customer-header">
          <div>
            <h1>My Dashboard</h1>
            <p>Manage your digital business card.</p>
          </div>

          <div className="customer-account" id="account">
            <div className="customer-account-avatar">{initials}</div>
            <span>{profile.fullName}</span>
          </div>
        </header>

        <section className="customer-welcome">
          <div>
            <p className="customer-eyebrow">WELCOME TO LINKBASE</p>
            <h2>Hello, {profile.fullName.split(" ")[0]}!</h2>
            <p>
              Your digital business card is ready. Keep your contact information
              up to date.
            </p>
          </div>

          <div className="customer-welcome-icon">LB</div>
        </section>

        <section className="customer-content-grid">
          <div className="customer-info-card">
            <div className="customer-section-heading">
              <div>
                <h3>My Profile</h3>
                <p>Your current business card details.</p>
              </div>

              <span className="customer-status">Active</span>
            </div>

            <div className="customer-profile-summary">
              {profile.photoUrl ? (
                <img
                  src={profile.photoUrl}
                  alt={profile.fullName}
                  className="customer-profile-photo"
                />
              ) : (
                <div className="customer-profile-placeholder">{initials}</div>
              )}

              <div>
                <h2>{profile.fullName}</h2>
                <p>{profile.jobTitle || "No job title added"}</p>
              </div>
            </div>

            <div className="customer-details">
              <div>
                <span>Email address</span>
                <strong>{profile.email || "Not provided"}</strong>
              </div>

              <div>
                <span>Phone number</span>
                <strong>{profile.phone || "Not provided"}</strong>
              </div>

              <div>
                <span>Website</span>
                <strong>{profile.websiteUrl || "Not provided"}</strong>
              </div>

              <div>
                <span>Profile ID</span>
                <strong>{profile.publicId}</strong>
              </div>
            </div>

            <button
              className="customer-primary-button"
              onClick={() => navigate("/dashboard/edit")}
            >
              Edit My Details
            </button>
          </div>

          <div className="customer-side-cards">
            <div className="customer-action-card">
              <div className="customer-action-icon">↗</div>
              <h3>Public Profile</h3>
              <p>See how customers view your digital business card.</p>

              <a
                href={`/profile/${profile.publicId}`}
                target="_blank"
                rel="noreferrer"
              >
                View My Profile →
              </a>
            </div>

            <div className="customer-action-card">
              <div className="customer-action-icon">✦</div>
              <h3>Keep Your Details Updated</h3>
              <p>
                Make sure customers always have your latest contact information.
              </p>

              <button onClick={() => navigate("/dashboard/edit")}>
                Update Details →
              </button>
            </div>
          </div>
        </section>

        <footer className="customer-footer">
          © {new Date().getFullYear()} LinkBase. All rights reserved.
        </footer>
      </main>
    </div>
  );
}

export default CustomerDashboard;
