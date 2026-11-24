import { useRef, useState } from "react";
import { API_BASE_URL } from "../apiBase.js";

const invitationLabels = {
  pending: "Pending",
  accepted: "Accepted",
  expired: "Expired",
  inactive: "Inactive",
};

function CompanyAdministrationControls({ company, onCompanyUpdated, refreshCompanies }) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState("");
  const [feedback, setFeedback] = useState({ success: "", error: "" });
  const confirmation = useRef(null);
  const enabled = company.centralisedManagement === true;
  const policyAction = enabled ? "Disable Centralised Management" : "Enable Centralised Management";
  const invitation = company.invitation;
  const companyId = encodeURIComponent(company.id);
  const headingId = `company-administration-${companyId}`;
  const confirmationId = `confirm-${headingId}`;

  async function submit(path, method, body) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionStorage.getItem("token")}`,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Company administration request failed");
    return data;
  }

  async function changePolicy() {
    confirmation.current.close();
    setPending("policy");
    setFeedback({ success: "", error: "" });
    try {
      const data = await submit(`/api/companies/${companyId}/centralised-management`, "PATCH", { enabled: !enabled });
      onCompanyUpdated(data.company);
      setFeedback({ success: enabled ? "Centralised management disabled." : "Centralised management enabled.", error: "" });
    } catch (error) {
      setFeedback({ success: "", error: error.message });
    } finally {
      setPending("");
    }
  }

  async function sendInvitation(event) {
    event.preventDefault();
    setPending("invitation");
    setFeedback({ success: "", error: "" });
    let success = "";
    let error = "";
    try {
      const data = await submit(`/api/auth/companies/${companyId}/admin-invitations`, "POST", { email });
      success = data.message || "Company administrator invitation sent";
      setEmail("");
    } catch (sendError) {
      error = sendError.message;
    }
    try {
      await refreshCompanies();
    } catch {
      error ||= "Could not refresh the invitation status. Reload Companies to check its current status.";
    } finally {
      setFeedback({ success, error });
      setPending("");
    }
  }

  return (
    <section className="company-administration" aria-labelledby={headingId}>
      <h4 id={headingId}>Company administration for {company.name}</h4>
      <div className="company-administration-policy">
        <p>Centralised Management: <strong>{enabled ? "Enabled" : "Disabled"}</strong></p>
        <button
          type="button"
          className="company-edit-button"
          disabled={Boolean(pending)}
          onClick={() => confirmation.current.showModal()}
        >
          {pending === "policy" ? "Updating Centralised Management…" : policyAction}
        </button>
      </div>

      <h5>Company Administrator</h5>
      <p>{company.administrator?.email || "No administrator assigned."}</p>
      <p>
        Invitation: {invitation ? <><strong>{invitationLabels[invitation.status]}</strong> · {invitation.email}</> : "None sent"}
      </p>
      {invitation?.status === "pending" && (
        <p>Expires <time dateTime={invitation.expiresAt}>{new Date(invitation.expiresAt).toLocaleString()}</time></p>
      )}
      {!company.administrator && (
        <form className="company-administration-invite" onSubmit={sendInvitation}>
          <div className="edit-form-group">
            <label htmlFor={`admin-email-${companyId}`}>Administrator email</label>
            <input
              id={`admin-email-${companyId}`}
              type="email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={254}
              disabled={!enabled || Boolean(pending)}
              required
            />
          </div>
          <button className="company-edit-button" type="submit" disabled={!enabled || Boolean(pending)}>
            {pending === "invitation" ? "Sending Invitation…" : "Send Administrator Invitation"}
          </button>
        </form>
      )}
      {!enabled && !company.administrator && <p>Enable centralised management to send an invitation.</p>}
      {feedback.success && <p role="status" className="success-message">{feedback.success}</p>}
      {feedback.error && <p role="alert" className="error-message">{feedback.error}</p>}

      <dialog className="company-administration-dialog" ref={confirmation} aria-labelledby={confirmationId}>
        <h4 id={confirmationId}>{policyAction}</h4>
        {enabled ? (
          <p>
            The company administrator will lose access to manage these profiles and pending company administrator
            invitations will be cancelled. Existing customer owners can manage their profiles again.
          </p>
        ) : (
          <p>
            Existing customer owners will lose access to manage these profiles and view their private analytics.
            Individual profile claims will be blocked. Existing accounts, ownership links and public profiles stay in place.
          </p>
        )}
        <form method="dialog">
          <button className="company-edit-button" autoFocus>Cancel</button>
          <button className="company-edit-button" type="button" onClick={changePolicy}>{policyAction}</button>
        </form>
      </dialog>
    </section>
  );
}

export default CompanyAdministrationControls;
