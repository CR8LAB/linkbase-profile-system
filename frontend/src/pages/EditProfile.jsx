import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

function EditProfile() {
  const { publicId } = useParams();
  const navigate = useNavigate();

  const [profile, setProfile] = useState({
    fullName: "",
    jobTitle: "",
    email: "",
    phone: "",
    websiteUrl: "",
    photoUrl: "",
    logoUrl: "",
    fontFamily: "Raleway",
    buttonColor: "#101d3b",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Load existing profile
  useEffect(() => {
    async function fetchProfile() {
      try {
        const token = sessionStorage.getItem("token");

        const response = await fetch(
          `http://localhost:5000/api/profiles/${publicId}`,
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

        setProfile((previous) => ({
          ...previous,
          ...data.profile,
        }));
      } catch (error) {
        setError(error.message);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [publicId]);

  // Update form fields
  function handleChange(e) {
    const { name, value } = e.target;

    setProfile((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  // Save profile
  async function handleSubmit(e) {
    e.preventDefault();

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const token = sessionStorage.getItem("token");

      const response = await fetch(
        `http://localhost:5000/api/profiles/${publicId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(profile),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to update profile");
      }

      setSuccess("Profile updated successfully.");
    } catch (error) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="admin-content">Loading profile...</div>;
  }

  return (
    <div className="admin-content">
      <header className="admin-header">
        <h2>Edit Profile</h2>
        <span>{publicId}</span>
      </header>

      <section className="dashboard-welcome">
        <h1>{profile.fullName}</h1>
        <p>Update this digital business card.</p>
      </section>

      <form className="edit-profile-form" onSubmit={handleSubmit}>
        <h3>Personal Information</h3>

        <div className="edit-form-group">
          <label>Full Name</label>
          <input
            name="fullName"
            value={profile.fullName}
            onChange={handleChange}
            required
          />
        </div>

        <div className="edit-form-group">
          <label>Job Title</label>
          <input
            name="jobTitle"
            value={profile.jobTitle}
            onChange={handleChange}
          />
        </div>

        <div className="edit-form-group">
          <label>Email Address</label>
          <input
            type="email"
            name="email"
            value={profile.email}
            onChange={handleChange}
          />
        </div>

        <div className="edit-form-group">
          <label>Phone Number</label>
          <input name="phone" value={profile.phone} onChange={handleChange} />
        </div>

        <div className="edit-form-group">
          <label>Website</label>
          <input
            name="websiteUrl"
            value={profile.websiteUrl}
            onChange={handleChange}
          />
        </div>

        <h3>Branding</h3>

        <div className="edit-form-group">
          <label>Profile Photo URL</label>
          <input
            name="photoUrl"
            value={profile.photoUrl}
            onChange={handleChange}
          />
        </div>

        <div className="edit-form-group">
          <label>Company Logo URL</label>
          <input
            name="logoUrl"
            value={profile.logoUrl}
            onChange={handleChange}
          />
        </div>

        <div className="edit-form-group">
          <label>Font Family</label>
          <select
            name="fontFamily"
            value={profile.fontFamily}
            onChange={handleChange}
          >
            <option value="Raleway">Raleway</option>
            <option value="Arial">Arial</option>
            <option value="Roboto">Roboto</option>
            <option value="Montserrat">Montserrat</option>
          </select>
        </div>

        <div className="edit-form-group">
          <label>Button Color</label>
          <input
            type="color"
            name="buttonColor"
            value={profile.buttonColor}
            onChange={handleChange}
          />
        </div>

        {error && <p className="error-message">{error}</p>}
        {success && <p className="success-message">{success}</p>}

        <div className="edit-form-actions">
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>

          <button
            type="button"
            className="cancel-button"
            onClick={() => navigate("/admin/profiles")}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default EditProfile;
