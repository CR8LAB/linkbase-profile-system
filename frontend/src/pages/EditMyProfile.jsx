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
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [photoSuccess, setPhotoSuccess] = useState("");

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

  async function handlePhotoUpload(event) {
    const file = event.target.files?.[0];

    if (!file || !profile) return;

    setPhotoError("");
    setPhotoSuccess("");

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      setPhotoError("Please select a JPG, PNG or WebP image.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setPhotoError("Image must be smaller than 5 MB.");
      event.target.value = "";
      return;
    }

    try {
      setUploadingPhoto(true);

      const token = sessionStorage.getItem("token");
      const uploadData = new FormData();

      uploadData.append("photo", file);

      const response = await fetch(
        `http://localhost:5000/api/profiles/${profile.publicId}/photo`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: uploadData,
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Photo upload failed");
      }

      setProfile((previous) => ({
        ...previous,
        photoUrl: data.profile.photoUrl,
      }));

      setPhotoSuccess("Profile photo uploaded successfully!");
    } catch (err) {
      setPhotoError(err.message);
    } finally {
      setUploadingPhoto(false);
      event.target.value = "";
    }
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
      setProfile((previous) => ({
        ...previous,
        ...data.profile,
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading your profile...</p>;

  if (error && !profile) return <p>{error}</p>;

  if (!profile) return <p>No profile assigned.</p>;

  const initials = profile.fullName
    .split(" ")
    .map((name) => name[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="customer-edit-page">
      <div className="customer-edit-card">
        <h1>Edit My Profile</h1>
        <p>Update your personal contact information.</p>

        {/* PROFILE PHOTO UPLOAD */}

        <div className="customer-photo-upload">
          <div className="customer-photo-preview">
            {profile.photoUrl ? (
              <img src={profile.photoUrl} alt={profile.fullName} />
            ) : (
              <span>{initials}</span>
            )}
          </div>

          <div className="customer-photo-controls">
            <h3>Profile Photo</h3>
            <p>JPG, PNG or WebP. Maximum 5 MB.</p>

            <label
              className={`customer-photo-button ${
                uploadingPhoto ? "uploading" : ""
              }`}
            >
              {uploadingPhoto ? "Uploading..." : "Choose Photo"}

              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoUpload}
                disabled={uploadingPhoto}
                hidden
              />
            </label>
          </div>
        </div>

        {photoError && <p className="error-message">{photoError}</p>}

        {photoSuccess && <p className="success-message">{photoSuccess}</p>}

        <hr />

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
