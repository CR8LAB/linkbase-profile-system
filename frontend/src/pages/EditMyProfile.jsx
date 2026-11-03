import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function EditMyProfile() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [formData, setFormData] = useState({
    fullName: "",
    jobTitle: "",
    email: "",
    phone: "",
    websiteUrl: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function fetchProfile() {
      try {
        const token = sessionStorage.getItem("token");

        const response = await fetch(
          "http://localhost:5000/api/profiles/my-profile",
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Could not load profile");
        }

        setProfile(data.profile);
        setFormData({
          fullName: data.profile.fullName || "",
          jobTitle: data.profile.jobTitle || "",
          email: data.profile.email || "",
          phone: data.profile.phone || "",
          websiteUrl: data.profile.websiteUrl || "",
        });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!profile) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const token = sessionStorage.getItem("token");

      const response = await fetch(
        `http://localhost:5000/api/profiles/${profile.publicId}/my-details`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(formData),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not save changes");
      }

      setSuccess("Your profile has been updated successfully.");
      setProfile(data.profile);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading your profile...</p>;
  if (error && !profile) return <p>{error}</p>;

  return (
    <div className="customer-edit-page">
      <div className="customer-edit-card">
        <h1>Edit My Profile</h1>
        <p>Update your personal contact information.</p>

        {error && <p className="error-message">{error}</p>}
        {success && <p className="success-message">{success}</p>}

        <form onSubmit={handleSubmit}>
          {[
            { name: "fullName", label: "Full Name" },
            { name: "jobTitle", label: "Job Title" },
            { name: "email", label: "Email Address", type: "email" },
            { name: "phone", label: "Phone Number" },
            { name: "websiteUrl", label: "Website" },
          ].map((field) => (
            <div className="edit-form-group" key={field.name}>
              <label htmlFor={field.name}>{field.label}</label>
              <input
                id={field.name}
                type={field.type || "text"}
                name={field.name}
                value={formData[field.name]}
                onChange={handleChange}
              />
            </div>
          ))}

          <div className="edit-form-actions">
            <button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>

            <button type="button" onClick={() => navigate("/dashboard")}>
              Cancel
            </button>
          </div>
        </form>

        <p className="profile-id-note">Profile ID: {profile.publicId}</p>
      </div>
    </div>
  );
}

export default EditMyProfile;
