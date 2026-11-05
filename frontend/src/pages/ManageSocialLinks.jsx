import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import WorkspaceNavigation from "../components/WorkspaceNavigation.jsx";

const platforms = [
  "LinkedIn",
  "Facebook",
  "Instagram",
  "TikTok",
  "YouTube",
  "X",
  "WhatsApp",
  "Website",
];

function ManageSocialLinks() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [links, setLinks] = useState([]);
  const [platform, setPlatform] = useState("LinkedIn");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const token = sessionStorage.getItem("token");

  useEffect(() => {
    async function loadData() {
      try {
        const profileResponse = await fetch(
          "http://localhost:5000/api/profiles/my-profile",
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const profileData = await profileResponse.json();

        if (!profileResponse.ok) {
          throw new Error(profileData.message);
        }

        setProfile(profileData.profile);

        const linksResponse = await fetch(
          `http://localhost:5000/api/social-links/${profileData.profile.id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const linksData = await linksResponse.json();

        if (!linksResponse.ok) {
          throw new Error(linksData.message || "Could not load links");
        }

        setLinks(linksData.socialLinks || []);
      } catch (err) {
        setError(err.message || "Could not load social links");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  async function addLink(event) {
    event.preventDefault();

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("http://localhost:5000/api/social-links", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          profileId: profile.id,
          platform,
          url,
          sortOrder: links.length,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not add link");
      }

      setLinks((previous) => [...previous, data.socialLink]);
      setUrl("");
      setSuccess("Social link added successfully.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteLink(id) {
    if (!window.confirm("Are you sure you want to delete this link?")) {
      return;
    }

    try {
      const response = await fetch(
        `http://localhost:5000/api/social-links/${id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not delete link");
      }

      setLinks((previous) => previous.filter((link) => link.id !== id));

      setSuccess("Social link deleted successfully.");
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) {
    return (
      <div className="customer-edit-page">
        <WorkspaceNavigation role="CUSTOMER" />
        <p>Loading social links...</p>
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="customer-edit-page">
        <WorkspaceNavigation role="CUSTOMER" />
        <p>{error || "Profile not found."}</p>
      </div>
    );
  }

  return (
    <div className="customer-edit-page">
      <WorkspaceNavigation role="CUSTOMER" />
      <div className="customer-edit-card social-manager-card">
        <h1>My Social Links</h1>
        <p>Manage the social media links displayed on your public profile.</p>

        {error && <p className="error-message">{error}</p>}
        {success && <p className="success-message">{success}</p>}

        <form onSubmit={addLink}>
          <div className="edit-form-group">
            <label htmlFor="platform">Platform</label>

            <select
              id="platform"
              value={platform}
              onChange={(event) => setPlatform(event.target.value)}
            >
              {platforms.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="edit-form-group">
            <label htmlFor="socialUrl">Profile URL</label>

            <input
              id="socialUrl"
              type="url"
              placeholder="https://..."
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="customer-primary-button"
            disabled={saving}
          >
            {saving ? "Adding..." : "+ Add Social Link"}
          </button>
        </form>

        <hr />

        <h3>My Current Links ({links.length})</h3>

        {links.length === 0 ? (
          <p>You haven't added any social links yet.</p>
        ) : (
          <div className="social-links-list">
            {links.map((link) => (
              <div className="social-link-item" key={link.id}>
                <div>
                  <strong>{link.platform}</strong>
                  <a href={link.url} target="_blank" rel="noreferrer">
                    {link.url}
                  </a>
                </div>

                <button
                  type="button"
                  onClick={() => deleteLink(link.id)}
                  aria-label={`Delete ${link.platform} link`}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          className="social-back-button"
          onClick={() => navigate("/dashboard")}
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}

export default ManageSocialLinks;
