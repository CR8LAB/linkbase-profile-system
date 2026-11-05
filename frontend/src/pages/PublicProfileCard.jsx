import { QRCodeSVG } from "qrcode.react";
import {
  FaFacebookF,
  FaInstagram,
  FaLinkedinIn,
  FaTiktok,
  FaYoutube,
  FaWhatsapp,
  FaTwitter,
} from "react-icons/fa";

const socialIcons = {
  facebook: FaFacebookF,
  instagram: FaInstagram,
  linkedin: FaLinkedinIn,
  tiktok: FaTiktok,
  youtube: FaYoutube,
  whatsapp: FaWhatsapp,
  x: FaTwitter,
  twitter: FaTwitter,
};

function escapeVCard(value = "") {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function PublicProfileCard({ profile, preview = false }) {
  function saveContact() {
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

    const blob = new Blob([vCard], { type: "text/vcard;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${profile.fullName.replace(/\s+/g, "_")}.vcf`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const profileUrl = `${window.location.origin}/profile/${encodeURIComponent(profile.publicId || "preview")}`;
  const cardStyle = {
    backgroundColor: profile.backgroundColor || "#ffffff",
    fontFamily: profile.fontFamily || "Raleway, sans-serif",
    color: profile.bodyTextColor || "#101d3b",
  };
  const bodyTextStyle = { color: profile.bodyTextColor || "#101d3b" };
  const buttonStyle = {
    backgroundColor: profile.buttonColor || "#101d3b",
    color: profile.buttonTextColor || "#ffffff",
  };

  return (
    <div
      className={`public-profile-page${preview ? " public-profile-preview" : ""}`}
      style={{ backgroundColor: profile.backgroundColor || "#f4f6fa" }}
    >
      <div className="public-profile-card" style={cardStyle}>
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
          <div className="public-profile-placeholder" style={bodyTextStyle}>
            {profile.fullName?.charAt(0).toUpperCase()}
          </div>
        )}

        <h1 style={bodyTextStyle}>{profile.fullName}</h1>
        <p className="public-job-title" style={bodyTextStyle}>
          {profile.jobTitle}
        </p>

        <div className="public-qr-code">
          <div className="public-qr-code-surface">
            <QRCodeSVG value={profileUrl} size={150} level="H" marginSize={4} />
          </div>
          <p style={bodyTextStyle}>Scan to view my digital profile</p>
        </div>

        {profile.email && (
          <a
            href={`mailto:${profile.email}`}
            className="public-profile-button"
            style={buttonStyle}
          >
            Email Me
          </a>
        )}

        {profile.phone && (
          <a
            href={`tel:${profile.phone}`}
            className="public-profile-button"
            style={buttonStyle}
          >
            Call Me
          </a>
        )}

        {profile.websiteUrl && (
          <a
            href={profile.websiteUrl}
            target="_blank"
            rel="noreferrer"
            className="public-profile-button"
            style={buttonStyle}
          >
            Visit Website
          </a>
        )}

        <button
          className="public-profile-button save-contact-button"
          style={buttonStyle}
          onClick={saveContact}
        >
          Save Contact
        </button>

        {profile.socialLinks?.length > 0 && (
          <div className="public-social-links">
            {profile.socialLinks.map((social) => {
              const Icon = socialIcons[social.platform.toLowerCase()];

              return (
                <a
                  key={social.id}
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`public-social-link ${social.platform.toLowerCase()}`}
                  aria-label={social.platform}
                  title={social.platform}
                  style={Icon ? undefined : bodyTextStyle}
                >
                  {Icon ? <Icon /> : social.platform.charAt(0).toUpperCase()}
                </a>
              );
            })}
          </div>
        )}

        <p className="public-profile-id" style={bodyTextStyle}>
          {profile.publicId || "Preview"}
        </p>
      </div>
    </div>
  );
}

export default PublicProfileCard;
