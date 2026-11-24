import { useEffect, useState } from "react";
import { API_BASE_URL } from "../apiBase.js";
import AdminPageLayout from "../components/AdminPageLayout.jsx";
import CompanyAdministrationControls from "../components/CompanyAdministrationControls.jsx";

const fonts = ["Raleway", "Arial", "Roboto", "Montserrat"];

async function fetchCompanyAdministration(signal) {
  const response = await fetch(`${API_BASE_URL}/api/companies/administration`, {
    headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` },
    signal,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Could not load companies");
  return data.companies;
}

function CompanyManagement() {
  const [companies, setCompanies] = useState([]);
  const [name, setName] = useState("");
  const [fontFamily, setFontFamily] = useState("Raleway");
  const [editingCompanyId, setEditingCompanyId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [editingFont, setEditingFont] = useState("Raleway");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingCompanyId, setDeletingCompanyId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetchCompanyAdministration(controller.signal)
      .then((data) => { if (!controller.signal.aborted) setCompanies(data); })
      .catch((loadError) => { if (!controller.signal.aborted) setError(loadError.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  async function refreshCompanies() {
    setCompanies(await fetchCompanyAdministration());
  }

  function updateCompanyInList(updated) {
    setCompanies((previous) => previous.map((company) =>
      company.id === updated.id ? { ...company, ...updated } : company,
    ));
  }

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
      setCompanies((previous) => [...previous, { ...data.company, profileCount: 0, administrator: null, invitation: null }]);
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
      updateCompanyInList(data.company);
      setEditingCompanyId("");
      setSuccess("Company updated.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteCompany(company) {
    if (!window.confirm(`Delete the company "${company.name}"?`)) return;

    setDeletingCompanyId(company.id);
    setError("");
    setSuccess("");
    let deleted = false;

    try {
      const token = sessionStorage.getItem("token");
      const response = await fetch(
        `${API_BASE_URL}/api/companies/${encodeURIComponent(company.id)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not delete company");
      deleted = true;

      await refreshCompanies();
      setSuccess(`${company.name} was deleted.`);

      if (editingCompanyId === company.id) setEditingCompanyId("");
    } catch (deleteError) {
      if (deleted) {
        setSuccess("Company deleted, but the company list could not be refreshed.");
      } else {
        setError(deleteError.message);
      }
    } finally {
      setDeletingCompanyId("");
    }
  }

  return (
    <AdminPageLayout>
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
        {error && <p role="alert" className="error-message">{error}</p>}
        {success && <p className="success-message">{success}</p>}
        <button type="submit" disabled={saving}>
          {saving ? "Creating..." : "Create Company"}
        </button>
      </form>

      <section className="admin-data-section">
        <h3>Existing Companies</h3>
        {loading ? <p role="status">Loading companies...</p> : null}
        {!loading && companies.length === 0 ? <p>No companies yet.</p> : null}
        <div className="admin-data-list">
          {companies.map((company) => (
            <div key={company.id}>
              <div className="admin-data-row">
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
                      disabled={saving || Boolean(deletingCompanyId)}
                      onClick={() => saveCompany(company.id)}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      disabled={saving || Boolean(deletingCompanyId)}
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
                      disabled={Boolean(deletingCompanyId)}
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
                <span className="company-profile-count">
                  {company.profileCount} {company.profileCount === 1 ? "profile" : "profiles"}
                </span>
                <button
                  type="button"
                  className="company-edit-button"
                  disabled={saving || Boolean(deletingCompanyId)}
                  onClick={() => deleteCompany(company)}
                >
                  {deletingCompanyId === company.id ? "Deleting..." : "Delete"}
                </button>
              </div>
              {editingCompanyId === company.id && (
                <CompanyAdministrationControls
                  company={company}
                  onCompanyUpdated={updateCompanyInList}
                  refreshCompanies={refreshCompanies}
                />
              )}
            </div>
          ))}
        </div>
      </section>
    </AdminPageLayout>
  );
}

export default CompanyManagement;
