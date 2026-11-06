import PublicProfileCard from "./PublicProfileCard.jsx";

const fontFamilies = ["Raleway", "Arial", "Roboto", "Montserrat"];

function ProfileCustomizationFields({
  profile,
  onChange,
  onImageSelect,
  uploadingImage,
  imageError,
  imageSuccess,
  customerMode = false,
}) {
  return (
    <div className="profile-editor-layout">
      <div className="profile-editor-fields">
        <h3>Contact Information</h3>
        <div className="edit-form-group">
          <label htmlFor="fullName">Full Name</label>
          <input
            id="fullName"
            name="fullName"
            value={profile.fullName || ""}
            onChange={onChange}
            maxLength={120}
            required
          />
        </div>
        <div className="edit-form-group">
          <label htmlFor="jobTitle">Job Title</label>
          <input
            id="jobTitle"
            name="jobTitle"
            value={profile.jobTitle || ""}
            onChange={onChange}
            maxLength={500}
          />
        </div>
        <div className="edit-form-group">
          <label htmlFor="email">Email Address</label>
          <input
            id="email"
            type="email"
            name="email"
            value={profile.email || ""}
            onChange={onChange}
            maxLength={254}
          />
        </div>
        <div className="edit-form-group">
          <label htmlFor="phone">Phone Number</label>
          <input
            id="phone"
            name="phone"
            value={profile.phone || ""}
            onChange={onChange}
            maxLength={500}
          />
        </div>
        <div className="edit-form-group">
          <label htmlFor="websiteUrl">Website</label>
          <input
            id="websiteUrl"
            type="url"
            name="websiteUrl"
            value={profile.websiteUrl || ""}
            onChange={onChange}
            maxLength={500}
          />
        </div>

        <h3>Profile Images</h3>
        <div className="profile-image-controls">
          <div>
            <label htmlFor="profile-image-file">Add Profile Image</label>
            <input
              id="profile-image-file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => onImageSelect(event, "photo")}
              disabled={Boolean(uploadingImage)}
            />
          </div>
          {!customerMode && (
            <div>
              <label htmlFor="company-logo-file">Add Company Logo</label>
              <input
                id="company-logo-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => onImageSelect(event, "logo")}
                disabled={Boolean(uploadingImage)}
              />
            </div>
          )}
        </div>
        <p className="profile-upload-note">JPG, PNG or WebP. Maximum 5 MB.</p>
        {uploadingImage && <p role="status">Uploading {uploadingImage}...</p>}
        {imageError && <p className="error-message">{imageError}</p>}
        {imageSuccess && <p className="success-message">{imageSuccess}</p>}

        {!customerMode && (
          <>
            <h3>Appearance</h3>
            <div className="profile-color-grid">
              <div className="edit-form-group">
                <label htmlFor="bodyTextColor">Body text color</label>
                <input
                  id="bodyTextColor"
                  type="color"
                  name="bodyTextColor"
                  value={profile.bodyTextColor || "#101d3b"}
                  onChange={onChange}
                />
              </div>
              <div className="edit-form-group">
                <label htmlFor="backgroundColor">Background color</label>
                <input
                  id="backgroundColor"
                  type="color"
                  name="backgroundColor"
                  value={profile.backgroundColor || "#ffffff"}
                  onChange={onChange}
                />
              </div>
              <div className="edit-form-group">
                <label htmlFor="fontFamily">Font family</label>
                <select
                  id="fontFamily"
                  name="fontFamily"
                  value={profile.fontFamily || "Raleway"}
                  onChange={onChange}
                >
                  {fontFamilies.map((font) => (
                    <option key={font}>{font}</option>
                  ))}
                </select>
              </div>
              <div className="edit-form-group">
                <label htmlFor="buttonColor">Button background</label>
                <input
                  id="buttonColor"
                  type="color"
                  name="buttonColor"
                  value={profile.buttonColor || "#101d3b"}
                  onChange={onChange}
                />
              </div>
              <div className="edit-form-group">
                <label htmlFor="buttonTextColor">Button text color</label>
                <input
                  id="buttonTextColor"
                  type="color"
                  name="buttonTextColor"
                  value={profile.buttonTextColor || "#ffffff"}
                  onChange={onChange}
                />
              </div>
            </div>
          </>
        )}
      </div>

      <aside
        className="profile-editor-preview"
        aria-label="Live profile preview"
      >
        <h3>Live Preview</h3>
        <PublicProfileCard profile={profile} preview />
      </aside>
    </div>
  );
}

export default ProfileCustomizationFields;
