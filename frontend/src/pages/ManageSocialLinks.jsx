import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import WorkspaceNavigation from "../components/WorkspaceNavigation.jsx";
import SocialLinksEditor from "../components/SocialLinksEditor.jsx";
import { API_BASE_URL } from "../apiBase.js";

function ManageSocialLinks() {
  const navigate = useNavigate();
  const [profileId, setProfileId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/profiles/my-profile`, {
          headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Could not load profile");
        if (active) setProfileId(data.profile.id);
      } catch (loadError) {
        if (active) setError(loadError.message);
      }
    }
    loadProfile();
    return () => { active = false; };
  }, []);

  return (
    <div className="customer-edit-page">
      <WorkspaceNavigation role="CUSTOMER" />
      <div className="customer-edit-card social-manager-card">
        <h1>My Social Links</h1>
        {error ? <p className="error-message">{error}</p> : profileId && (
          <SocialLinksEditor profileId={profileId} title="Manage social links" description="Manage the links displayed on your public profile." />
        )}
        <button type="button" className="social-back-button" onClick={() => navigate("/dashboard")}>Back to Dashboard</button>
      </div>
    </div>
  );
}

export default ManageSocialLinks;
