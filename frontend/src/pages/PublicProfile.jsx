import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";

function PublicProfile() {
  const { publicId } = useParams();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchProfile() {
      try {
        const response = await fetch(
          `http://localhost:5000/api/profiles/${publicId}`,
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Profile not found");
        }

        setProfile(data.profile);
      } catch (error) {
        setError(error.message);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [publicId]);

  if (loading) return <p>Loading profile...</p>;

  if (error) return <p>{error}</p>;

  if (!profile) return <p>Profile not found.</p>;

  const saveContact = () => {
    const escapeVCard = (value = "") =>
      String(value)
        .replace(/\\/g, "\\\\")
        .replace(/\n/g, "\\n")
        .replace(/,/g, "\\,")
        .replace(/;/g, "\\;");

    const vCard = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${escapeVCard(profile.fullName)}`,
      `TITLE:${escapeVCard(profile.jobTitle)}`,
      `TEL;TYPE=CELL:${escapeVCard(profile.phone)}`,
      `EMAIL;TYPE=WORK:${escapeVCard(profile.email)}`,
      `URL:${escapeVCard(profile.websiteUrl)}`,
      "END:VCARD",
    ].join("\r\n");

    const blob = new Blob([vCard], {
      type: "text/vcard;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${profile.fullName.replace(/\s+/g, "_")}.vcf`;
    link.click();

    URL.revokeObjectURL(url);
  };

  return (
    <div className="public-profile-page">
      <div className="public-profile-card">
        {profile.logoUrl && (
          <img
            src={profile.logoUrl}
            alt="Company logo"
            className="public-company-logo"
          />
        )}

        {profile.photoUrl ? (
          <img
            src={profile.photoUrl}
            alt={profile.fullName}
            className="public-profile-photo"
          />
        ) : (
          <div className="public-profile-placeholder">
            {profile.fullName?.charAt(0).toUpperCase()}
          </div>
        )}

        <h1>{profile.fullName}</h1>

        <p className="public-job-title">{profile.jobTitle}</p>

        <div className="public-qr-code">
          <QRCodeSVG value={window.location.href} size={150} level="H" />
          <p>Scan to view my digital profile</p>
        </div>

        {profile.email && (
          <a href={`mailto:${profile.email}`} className="public-profile-button">
            Email Me
          </a>
        )}

        {profile.phone && (
          <a href={`tel:${profile.phone}`} className="public-profile-button">
            Call Me
          </a>
        )}

        {profile.websiteUrl && (
          <a
            href={profile.websiteUrl}
            target="_blank"
            rel="noreferrer"
            className="public-profile-button"
          >
            Visit Website
          </a>
        )}

        <button
          className="public-profile-button save-contact-button"
          onClick={saveContact}
        >
          Save Contact
        </button>

        <p className="public-profile-id">{profile.publicId}</p>
      </div>
    </div>
  );
}

export default PublicProfile;
