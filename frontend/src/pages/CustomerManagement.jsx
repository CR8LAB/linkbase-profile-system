import { useEffect, useState } from "react";
import { API_BASE_URL } from "../apiBase.js";

function CustomerManagement() {
  const [customers, setCustomers] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [invitePublicId, setInvitePublicId] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [assignmentIds, setAssignmentIds] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;

    async function fetchAdminData() {
      const headers = {
        Authorization: `Bearer ${sessionStorage.getItem("token")}`,
      };

      try {
        const [customerResponse, profileResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/api/admin/customers`, { headers }),
          fetch(`${API_BASE_URL}/api/admin/profiles`, { headers }),
        ]);
        const [customerData, profileData] = await Promise.all([
          customerResponse.json(),
          profileResponse.json(),
        ]);
        if (!customerResponse.ok) {
          throw new Error(customerData.message || "Could not load customers");
        }
        if (!profileResponse.ok) {
          throw new Error(profileData.message || "Could not load profiles");
        }
        if (active) {
          setCustomers(customerData.customers || []);
          setProfiles(profileData.profiles || []);
        }
      } catch (loadError) {
        if (active) setError(loadError.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchAdminData();
    return () => {
      active = false;
    };
  }, []);

  const unassignedProfiles = profiles.filter((profile) => !profile.user);

  async function inviteCustomer(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/auth/profiles/${encodeURIComponent(invitePublicId)}/claim-invitations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionStorage.getItem("token")}`,
          },
          body: JSON.stringify({ email: inviteEmail }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "Could not send invitation");
      setSuccess(
        "Invitation sent. The customer will be added after claiming the profile.",
      );
      setInviteEmail("");
    } catch (inviteError) {
      setError(inviteError.message);
    } finally {
      setBusy(false);
    }
  }

  async function assignProfile(customer) {
    const publicId = assignmentIds[customer.id];
    if (!publicId) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/profiles/${encodeURIComponent(publicId)}/assign`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionStorage.getItem("token")}`,
          },
          body: JSON.stringify({ userId: customer.id }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "Could not assign profile");
      setSuccess(`${customer.email} assigned to ${publicId}.`);
      setProfiles((previous) =>
        previous.map((profile) =>
          profile.publicId === publicId
            ? { ...profile, user: { id: customer.id, email: customer.email } }
            : profile,
        ),
      );
      setCustomers((previous) =>
        previous.map((item) =>
          item.id === customer.id
            ? {
                ...item,
                profiles: [
                  ...item.profiles,
                  { publicId, fullName: data.fullName },
                ],
              }
            : item,
        ),
      );
    } catch (assignError) {
      setError(assignError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-content">
      <header className="admin-header">
        <h2>Customers</h2>
        <span>Accounts and profile assignments</span>
      </header>

      <form
        className="edit-profile-form admin-form-narrow"
        onSubmit={inviteCustomer}
      >
        <h3>Invite Customer</h3>
        <p>
          Customers create their account and verify their email through the
          secure claim link.
        </p>
        <div className="edit-form-group">
          <label htmlFor="invite-profile">Unassigned profile</label>
          <select
            id="invite-profile"
            value={invitePublicId}
            onChange={(event) => setInvitePublicId(event.target.value)}
            required
          >
            <option value="">Select profile</option>
            {unassignedProfiles.map((profile) => (
              <option key={profile.publicId} value={profile.publicId}>
                {profile.fullName} ({profile.publicId})
              </option>
            ))}
          </select>
        </div>
        <div className="edit-form-group">
          <label htmlFor="invite-customer-email">Customer email</label>
          <input
            id="invite-customer-email"
            type="email"
            autoComplete="email"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            required
          />
        </div>
        <button
          type="submit"
          disabled={busy || unassignedProfiles.length === 0}
        >
          {busy ? "Sending..." : "Send claim invitation"}
        </button>
      </form>

      {error && <p className="error-message">{error}</p>}
      {success && <p className="success-message">{success}</p>}

      <section className="admin-data-section">
        <h3>Customer Accounts</h3>
        {loading ? <p>Loading customers...</p> : null}
        {!loading && customers.length === 0 ? (
          <p>No customer accounts yet.</p>
        ) : null}
        <div className="admin-data-list">
          {customers.map((customer) => (
            <div
              className="admin-data-row customer-management-row"
              key={customer.id}
            >
              <div>
                <strong>{customer.email}</strong>
                <div className="customer-assignment-summary">
                  {customer.profiles.length
                    ? customer.profiles
                        .map(
                          (profile) =>
                            `${profile.fullName} (${profile.publicId})`,
                        )
                        .join(", ")
                    : "No profile assigned"}
                </div>
              </div>
              {customer.profiles.length === 0 && (
                <div className="customer-assignment-controls">
                  <select
                    aria-label={`Profile for ${customer.email}`}
                    value={assignmentIds[customer.id] || ""}
                    onChange={(event) =>
                      setAssignmentIds((previous) => ({
                        ...previous,
                        [customer.id]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Assign profile</option>
                    {unassignedProfiles.map((profile) => (
                      <option key={profile.publicId} value={profile.publicId}>
                        {profile.fullName} ({profile.publicId})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy || !assignmentIds[customer.id]}
                    onClick={() => assignProfile(customer)}
                  >
                    Assign
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default CustomerManagement;
