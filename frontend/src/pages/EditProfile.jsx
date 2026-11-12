import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../apiBase.js";
import ProfileCustomizationFields from "./ProfileCustomizationFields.jsx";
import AdminPageLayout from "../components/AdminPageLayout.jsx";
import ProfileQRCode from "../components/ProfileQRCode.jsx";
import ProfileVisitStatistics from "../components/ProfileVisitStatistics.jsx";
import {
  DEFAULT_PDF_DISPLAY_NAME_INPUT,
  toPdfDisplayNameInput,
  validatePdfDisplayNameInput,
} from "../utils/pdfDisplayName.js";

function EditProfile() {
  const { publicId } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [imageError, setImageError] = useState("");
  const [imageSuccess, setImageSuccess] = useState("");
  const [pdfBusy, setPdfBusy] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [pdfSuccess, setPdfSuccess] = useState("");
  const [pdfDisplayNameInput, setPdfDisplayNameInput] = useState(DEFAULT_PDF_DISPLAY_NAME_INPUT);

  // Load existing profile
  useEffect(() => {
    async function fetchProfile() {
      try {
        const token = sessionStorage.getItem("token");

        const response = await fetch(
          `${API_BASE_URL}/api/profiles/${encodeURIComponent(publicId)}`,
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
        setPdfDisplayNameInput(toPdfDisplayNameInput(data.profile.pdfDisplayName));
      } catch (error) {
        setError(error.message);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [publicId]);

  function handleChange(event) {
    const { name, value } = event.target;

    setProfile((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handleImageSelect(event, imageType) {
    const file = event.target.files?.[0];
    if (!file || !profile) return;

    setImageError("");
    setImageSuccess("");
    if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) {
      setImageError("Please select a JPG, PNG or WebP image.");
      event.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError("Image must be smaller than 5 MB.");
      event.target.value = "";
      return;
    }

    const formData = new FormData();
    formData.append(imageType === "photo" ? "photo" : "logo", file);

    try {
      setUploadingImage(
        imageType === "photo" ? "profile image" : "company logo",
      );
      const token = sessionStorage.getItem("token");
      const response = await fetch(
        `${API_BASE_URL}/api/profiles/${encodeURIComponent(publicId)}/${imageType}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Image upload failed");

      const field = imageType === "photo" ? "photoUrl" : "logoUrl";
      setProfile((previous) => ({ ...previous, [field]: data.profile[field] }));
      setImageSuccess("Image uploaded successfully.");
    } catch (uploadError) {
      setImageError(uploadError.message);
    } finally {
      setUploadingImage("");
      event.target.value = "";
    }
  }

  async function handlePdfSelect(event) {
    const file = event.target.files?.[0];
    if (!file || !profile) return;
    setPdfError("");
    setPdfSuccess("");
    if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
      setPdfError("Please select a PDF file.");
      event.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPdfError("PDF must be 5 MB or smaller.");
      event.target.value = "";
      return;
    }
    const formData = new FormData();
    formData.append("pdf", file);
    try {
      setPdfBusy("Uploading PDF...");
      const response = await fetch(`${API_BASE_URL}/api/profiles/${encodeURIComponent(publicId)}/pdf`, {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` },
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "PDF upload failed");
      setProfile((previous) => ({
        ...previous,
        pdfUrl: data.profile.pdfUrl,
        pdfDisplayName: data.profile.pdfDisplayName,
      }));
      setPdfDisplayNameInput(toPdfDisplayNameInput(data.profile.pdfDisplayName));
      setPdfSuccess("PDF uploaded successfully.");
    } catch (uploadError) {
      setPdfError(uploadError.message);
    } finally {
      setPdfBusy("");
      event.target.value = "";
    }
  }

  async function handlePdfDisplayNameSave() {
    setPdfError("");
    setPdfSuccess("");
    const result = validatePdfDisplayNameInput(pdfDisplayNameInput.trim());
    if (result.error) {
      setPdfError(result.error);
      return;
    }
    try {
      setPdfBusy("Saving PDF name...");
      const response = await fetch(
        `${API_BASE_URL}/api/profiles/${encodeURIComponent(publicId)}/pdf/display-name`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionStorage.getItem("token")}`,
          },
          body: JSON.stringify({ pdfDisplayName: result.value }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "PDF name update failed");
      }
      setProfile((previous) => ({
        ...previous,
        pdfDisplayName: data.profile.pdfDisplayName,
      }));
      setPdfDisplayNameInput(toPdfDisplayNameInput(data.profile.pdfDisplayName));
      setPdfSuccess("PDF name saved successfully.");
    } catch (saveError) {
      setPdfError(saveError.message);
    } finally {
      setPdfBusy("");
    }
  }

  async function handlePdfRemove() {
    setPdfError("");
    setPdfSuccess("");
    try {
      setPdfBusy("Removing PDF...");
      const response = await fetch(`${API_BASE_URL}/api/profiles/${encodeURIComponent(publicId)}/pdf`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "PDF removal failed");
      setProfile((previous) => ({
        ...previous,
        pdfUrl: null,
        pdfDisplayName: null,
      }));
      setPdfSuccess("PDF removed successfully.");
    } catch (removeError) {
      setPdfError(removeError.message);
    } finally {
      setPdfBusy("");
    }
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
        `${API_BASE_URL}/api/profiles/${encodeURIComponent(publicId)}`,
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

      setProfile((previous) => ({ ...previous, ...data.profile }));
      setSuccess("Profile updated successfully.");
    } catch (error) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <AdminPageLayout>Loading profile...</AdminPageLayout>;
  }

  if (!profile) {
    return <AdminPageLayout>{error || "Profile not found."}</AdminPageLayout>;
  }

  return (
    <AdminPageLayout>
      <header className="admin-header">
        <h2>Edit Profile</h2>
        <span>{publicId}</span>
      </header>

      <section className="dashboard-welcome">
        <h1>{profile.fullName}</h1>
        <p>Update this digital business card.</p>
      </section>

      <form
        className="edit-profile-form profile-editor-form"
        onSubmit={handleSubmit}
      >
        <ProfileCustomizationFields
          profile={profile}
          onChange={handleChange}
          onImageSelect={handleImageSelect}
          uploadingImage={uploadingImage}
          imageError={imageError}
          imageSuccess={imageSuccess}
          onPdfSelect={handlePdfSelect}
          onPdfRemove={handlePdfRemove}
          onPdfDisplayNameSave={handlePdfDisplayNameSave}
          pdfBusy={pdfBusy}
          pdfError={pdfError}
          pdfSuccess={pdfSuccess}
          pdfDisplayNameInput={pdfDisplayNameInput}
          onPdfDisplayNameChange={(event) => setPdfDisplayNameInput(event.target.value)}
        />

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

      <ProfileVisitStatistics publicId={publicId} />

      <section
        className="admin-qr-management"
        aria-labelledby="profile-qr-title"
      >
        <h3 id="profile-qr-title">Profile QR Codes</h3>
        <p>
          Download digital versions or configure a physical manufacturing SVG.
        </p>
        <ProfileQRCode profile={profile} showManagementControls />
      </section>
    </AdminPageLayout>
  );
}

export default EditProfile;
