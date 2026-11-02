import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function CreateProfile() {
  const navigate = useNavigate();

  const [companies, setCompanies] = useState([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [formData, setFormData] = useState({
    publicId: "",
    fullName: "",
    companyId: "",
    jobTitle: "",
    email: "",
    phone: "",
    websiteUrl: "",
    photoUrl: "",
    logoUrl: "",
    fontFamily: "Raleway",
    buttonColor: "#101d3b",
  });

  // Fetch companies
  useEffect(() => {
    async function fetchCompanies() {
      try {
        const token = sessionStorage.getItem("token");

        const response = await fetch("http://localhost:5000/api/companies", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Failed to load companies");
        }

        setCompanies(data.companies);
      } catch (error) {
        setError(error.message);
      } finally {
        setLoadingCompanies(false);
      }
    }

    fetchCompanies();
  }, []);

  // Handle form changes
  function handleChange(e) {
    const { name, value } = e.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  // Create profile
  async function handleSubmit(e) {
    e.preventDefault();

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const token = sessionStorage.getItem("token");

      const response = await fetch("http://localhost:5000/api/profiles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to create profile");
      }

      setSuccess("Profile created successfully!");

      setTimeout(() => {
        navigate("/admin/profiles");
      }, 1200);
    } catch (error) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-content">
      <header className="admin-header">
        <h2>Create Profile</h2>
        <span>New Digital Business Card</span>
      </header>

      <section className="dashboard-welcome">
        <h1>Create a New Profile</h1>
        <p>Enter the details for your new LinkBase profile.</p>
      </section>

      <form className="edit-profile-form" onSubmit={handleSubmit}>
        <h3>Profile Information</h3>

        <div className="edit-form-group">
          <label>Public ID *</label>
          <input
            name="publicId"
            value={formData.publicId}
            onChange={handleChange}
            placeholder="Example: LB0012"
            required
          />
        </div>

        <div className="edit-form-group">
          <label>Full Name *</label>
          <input
            name="fullName"
            value={formData.fullName}
            onChange={handleChange}
            placeholder="Enter full name"
            required
          />
        </div>

        <div className="edit-form-group">
          <label>Company *</label>
          <select
            name="companyId"
            value={formData.companyId}
            onChange={handleChange}
            required
            disabled={loadingCompanies}
          >
            <option value="">
              {loadingCompanies ? "Loading companies..." : "Select company"}
            </option>

            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>

        <div className="edit-form-group">
          <label>Job Title</label>
          <input
            name="jobTitle"
            value={formData.jobTitle}
            onChange={handleChange}
            placeholder="Enter job title"
          />
        </div>

        <div className="edit-form-group">
          <label>Email Address</label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="Enter email address"
          />
        </div>

        <div className="edit-form-group">
          <label>Phone Number</label>
          <input
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            placeholder="Enter phone number"
          />
        </div>

        <div className="edit-form-group">
          <label>Website</label>
          <input
            name="websiteUrl"
            value={formData.websiteUrl}
            onChange={handleChange}
            placeholder="https://example.com"
          />
        </div>

        <h3>Profile Branding</h3>

        <div className="edit-form-group">
          <label>Profile Photo URL</label>
          <input
            name="photoUrl"
            value={formData.photoUrl}
            onChange={handleChange}
            placeholder="Photo URL"
          />
        </div>

        <div className="edit-form-group">
          <label>Company Logo URL</label>
          <input
            name="logoUrl"
            value={formData.logoUrl}
            onChange={handleChange}
            placeholder="Logo URL"
          />
        </div>

        <div className="edit-form-group">
          <label>Font Family</label>
          <select
            name="fontFamily"
            value={formData.fontFamily}
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
            value={formData.buttonColor}
            onChange={handleChange}
          />
        </div>

        {error && <p className="error-message">{error}</p>}
        {success && <p className="success-message">{success}</p>}

        <div className="edit-form-actions">
          <button type="submit" disabled={saving || loadingCompanies}>
            {saving ? "Creating..." : "Create Profile"}
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

export default CreateProfile;
