import { useEffect, useState } from "react";
import { API_BASE_URL } from "../apiBase.js";

const fonts = ["Raleway", "Arial", "Roboto", "Montserrat"];

function CompanyManagement() {
  const [companies, setCompanies] = useState([]);
  const [name, setName] = useState("");
  const [fontFamily, setFontFamily] = useState("Raleway");
  const [editingCompanyId, setEditingCompanyId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [editingFont, setEditingFont] = useState("Raleway");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;

    async function fetchCompanies() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/companies`, {
          headers: {
            Authorization: `Bearer ${sessionStorage.getItem("token")}`,
          },
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || "Could not load companies");
        }
        if (active) setCompanies(data.companies || []);
      } catch (loadError) {
        if (active) setError(loadError.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchCompanies();
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/companies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionStorage.getItem("token")}`,
        },
        body: JSON.stringify({ name, fontFamily }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "Could not create company");
      setCompanies((previous) => [...previous, data.company]);
      setName("");
      setFontFamily("Raleway");
      setSuccess("Company created.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveCompany(companyId) {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/companies/${encodeURIComponent(companyId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionStorage.getItem("token")}`,
          },
          body: JSON.stringify({ name: editingName, fontFamily: editingFont }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "Could not update company");
      setCompanies((previous) =>
        previous.map((company) =>
          company.id === companyId ? data.company : company,
        ),
      );
      setEditingCompanyId("");
      setSuccess("Company updated.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-content">
      <header className="admin-header">
        <h2>Companies</h2>
        <span>Company Management</span>
      </header>

      <form
        className="edit-profile-form admin-form-narrow"
        onSubmit={handleSubmit}
      >
        <h3>Add Company</h3>
        <div className="edit-form-group">
          <label htmlFor="company-name">Company name</label>
          <input
            id="company-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            required
          />
        </div>
        <div className="edit-form-group">
          <label htmlFor="company-font">Default font family</label>
          <select
            id="company-font"
            value={fontFamily}
            onChange={(event) => setFontFamily(event.target.value)}
          >
            {fonts.map((font) => (
              <option key={font}>{font}</option>
            ))}
          </select>
        </div>
        {error && <p className="error-message">{error}</p>}
        {success && <p className="success-message">{success}</p>}
        <button type="submit" disabled={saving}>
          {saving ? "Creating..." : "Create Company"}
        </button>
      </form>

      <section className="admin-data-section">
        <h3>Existing Companies</h3>
        {loading ? <p>Loading companies...</p> : null}
        {!loading && companies.length === 0 ? <p>No companies yet.</p> : null}
        <div className="admin-data-list">
          {companies.map((company) => (
            <div className="admin-data-row" key={company.id}>
              {editingCompanyId === company.id ? (
                <div className="company-edit-controls">
                  <input
                    aria-label="Company name"
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    maxLength={120}
                  />
                  <select
                    aria-label="Default font family"
                    value={editingFont}
                    onChange={(event) => setEditingFont(event.target.value)}
                  >
                    {fonts.map((font) => (
                      <option key={font}>{font}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => saveCompany(company.id)}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setEditingCompanyId("")}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <strong>{company.name}</strong>
                  <span>{company.fontFamily || "Raleway"}</span>
                  <button
                    type="button"
                    className="company-edit-button"
                    onClick={() => {
                      setEditingCompanyId(company.id);
                      setEditingName(company.name);
                      setEditingFont(company.fontFamily || "Raleway");
                    }}
                  >
                    Edit
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default CompanyManagement;
