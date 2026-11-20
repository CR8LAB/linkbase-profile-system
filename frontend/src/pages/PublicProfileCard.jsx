import ProfileQRCode from "../components/ProfileQRCode.jsx";
import { Link } from "react-router-dom";
import { API_BASE_URL } from "../apiBase.js";
import { buildVCard } from "../utils/vCard.js";
import { createGoogleMapsEmbedUrl, createWhatsAppUrl, getSafeGoogleReviewUrl } from "../utils/profileLinks.js";
import {
  FaFacebookF,
  FaInstagram,
  FaLinkedinIn,
  FaTiktok,
  FaYoutube,
  FaWhatsapp,
  FaTwitter,
  FaEnvelope,
  FaPhone,
  FaGlobe,
  FaAddressCard,
  FaFilePdf,
  FaMapMarkerAlt,
  FaStar,
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

function PublicProfileCard({ profile, preview = false }) {
  function saveContact() {
    const vCard = buildVCard(profile);

    const blob = new Blob([vCard], { type: "text/vcard;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${profile.fullName.replace(/\s+/g, "_")}.vcf`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const cardStyle = {
    backgroundColor: profile.backgroundColor || "#ffffff",
    backgroundImage: profile.backgroundImageUrl ? `url("${profile.backgroundImageUrl}")` : "none",
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    fontFamily: profile.fontFamily || "Raleway, sans-serif",
    color: profile.bodyTextColor || "#101d3b",
  };
  const bodyTextStyle = { color: profile.bodyTextColor || "#101d3b" };
  const buttonStyle = {
    backgroundColor: profile.buttonColor || "#101d3b",
    color: profile.buttonTextColor || "#ffffff",
  };
  const saveContactButtonStyle = {
    backgroundColor: profile.saveContactButtonColor || "#101d3b",
    color: profile.saveContactButtonTextColor || "#ffffff",
  };
  const mapsEmbedUrl = createGoogleMapsEmbedUrl(profile.businessAddress);
  const reviewUrl = getSafeGoogleReviewUrl(profile.googleReviewUrl);
  const whatsappUrl = createWhatsAppUrl(profile.whatsappNumber);

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
          <ProfileQRCode profile={profile} />
          <p style={bodyTextStyle}>Scan to view my digital profile</p>
        </div>

        {profile.email && (
          <a
            href={`mailto:${profile.email}`}
            className="public-profile-button"
            style={buttonStyle}
          >
            <FaEnvelope aria-hidden="true" />
            Email Me
          </a>
        )}

        {profile.phone && (
          <a
            href={`tel:${profile.phone}`}
            className="public-profile-button"
            style={buttonStyle}
          >
            <FaPhone aria-hidden="true" />
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
            <FaGlobe aria-hidden="true" />
            Visit Website
          </a>
        )}

        {reviewUrl && (
          <a href={reviewUrl} target="_blank" rel="noopener noreferrer" className="public-profile-button" style={buttonStyle}>
            <FaStar aria-hidden="true" />
            Leave a Review
          </a>
        )}

        {whatsappUrl && (
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="public-profile-button" style={buttonStyle}>
            <FaWhatsapp aria-hidden="true" />
            WhatsApp
          </a>
        )}

        {!preview && profile.pdfUrl && (
          <a
            href={`${API_BASE_URL}${profile.pdfUrl}`}
            className="public-profile-button"
            style={buttonStyle}
          >
            <FaFilePdf aria-hidden="true" />
            {profile.pdfDisplayName || "Download PDF"}
          </a>
        )}

        <button
          className="public-profile-button save-contact-button"
          style={saveContactButtonStyle}
          onClick={saveContact}
        >
          <FaAddressCard aria-hidden="true" />
          Save Contact
        </button>

        {!preview && (
          <Link
            to="/"
            className="public-profile-button public-profile-login-button"
          >
            Login
          </Link>
        )}

        {profile.socialLinks?.length > 0 && (
          <div className="public-social-links">
            <h3 className="public-social-label" style={bodyTextStyle}>
              Follow Us
            </h3>
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
                  style={{
                    color: profile.socialLinkIconColor || "#14213f",
                  }}
                >
                  {Icon ? <Icon /> : social.platform.charAt(0).toUpperCase()}
                </a>
              );
            })}
          </div>
        )}

        {mapsEmbedUrl && (
          <section className="public-profile-location" aria-label="Business location">
            <h2 style={bodyTextStyle}><FaMapMarkerAlt aria-hidden="true" /> Location</h2>
            <p style={bodyTextStyle}>{profile.businessAddress}</p>
            <div className="public-profile-map">
              <iframe
                src={mapsEmbedUrl}
                title={`Map showing ${profile.businessAddress}`}
                loading="lazy"
                referrerPolicy="no-referrer"
                allowFullScreen
              />
            </div>
          </section>
        )}

      </div>
    </div>
  );
}

export default PublicProfileCard;
