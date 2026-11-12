import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../apiBase.js";
import ProfileCustomizationFields from "./ProfileCustomizationFields.jsx";
import WorkspaceNavigation from "../components/WorkspaceNavigation.jsx";
import {
  DEFAULT_PDF_DISPLAY_NAME_INPUT,
  toPdfDisplayNameInput,
  validatePdfDisplayNameInput,
} from "../utils/pdfDisplayName.js";

function EditMyProfile() {
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

  useEffect(() => {
    async function fetchProfile() {
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
          throw new Error(data.message || "Could not load profile");
        }

        setProfile(data.profile);
        setPdfDisplayNameInput(toPdfDisplayNameInput(data.profile.pdfDisplayName));
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

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      setImageError("Please select a JPG, PNG or WebP image.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setImageError("Image must be smaller than 5 MB.");
      event.target.value = "";
      return;
    }

    try {
      setUploadingImage(
        imageType === "photo" ? "profile image" : "company logo",
      );

      const token = sessionStorage.getItem("token");
      const uploadData = new FormData();

      uploadData.append(imageType === "photo" ? "photo" : "logo", file);

      const response = await fetch(
        `${API_BASE_URL}/api/profiles/${encodeURIComponent(profile.publicId)}/${imageType}`,
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
        throw new Error(data.message || "Image upload failed");
      }

      const field = imageType === "photo" ? "photoUrl" : "logoUrl";
      setProfile((previous) => ({
        ...previous,
        [field]: data.profile[field],
      }));

      setImageSuccess("Image uploaded successfully.");
    } catch (err) {
      setImageError(err.message);
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
      const response = await fetch(`${API_BASE_URL}/api/profiles/${encodeURIComponent(profile.publicId)}/pdf`, {
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
        `${API_BASE_URL}/api/profiles/${encodeURIComponent(profile.publicId)}/pdf/display-name`,
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
      const response = await fetch(`${API_BASE_URL}/api/profiles/${encodeURIComponent(profile.publicId)}/pdf`, {
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

  async function handleSubmit(event) {
    event.preventDefault();

    if (!profile) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const token = sessionStorage.getItem("token");

      const response = await fetch(
        `${API_BASE_URL}/api/profiles/${encodeURIComponent(profile.publicId)}/my-details`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            fullName: profile.fullName,
            jobTitle: profile.jobTitle,
            email: profile.email,
            phone: profile.phone,
            websiteUrl: profile.websiteUrl,
            fontFamily: profile.fontFamily,
            bodyTextColor: profile.bodyTextColor,
            backgroundColor: profile.backgroundColor,
            buttonColor: profile.buttonColor,
            buttonTextColor: profile.buttonTextColor,
            saveContactButtonColor: profile.saveContactButtonColor,
            saveContactButtonTextColor: profile.saveContactButtonTextColor,
            socialLinkBackgroundColor: profile.socialLinkBackgroundColor,
            socialLinkIconColor: profile.socialLinkIconColor,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not save changes");
      }

      setSuccess("Your profile has been updated successfully.");
      setProfile((previous) => ({ ...previous, ...data.profile }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="customer-edit-page">
        <WorkspaceNavigation role="CUSTOMER" />
        <p>Loading your profile...</p>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="customer-edit-page">
        <WorkspaceNavigation role="CUSTOMER" />
        <p>{error}</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="customer-edit-page">
        <WorkspaceNavigation role="CUSTOMER" />
        <p>No profile assigned.</p>
      </div>
    );
  }

  return (
    <div className="customer-edit-page">
      <WorkspaceNavigation role="CUSTOMER" />
      <div className="customer-edit-card profile-editor-container">
        <h1>Edit My Profile</h1>
        <p>Update your personal contact information.</p>

        {error && <p className="error-message">{error}</p>}

        {success && <p className="success-message">{success}</p>}

        <form onSubmit={handleSubmit}>
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
