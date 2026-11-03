import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE_URL } from "../apiBase.js";
import PasswordField from "./PasswordField.jsx";
import "../App.css";

function ClaimProfile() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();

      if (!response.ok)
        throw new Error(data.message || "Could not claim profile");

      navigate("/", { state: { message: data.message } });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="brand">
          <h1>LinkBase</h1>
        </div>
        <div className="login-heading">
          <h2>Claim Your Profile</h2>
          <p>
            This invitation verifies the email address selected by your
            administrator.
          </p>
        </div>

        {!token ? (
          <p className="error-message">
            This invitation link is invalid or expired.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <PasswordField
              id="claim-password"
              label="Create password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />
            <PasswordField
              id="claim-confirm-password"
              label="Confirm password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
            />
            {error && <p className="error-message">{error}</p>}
            <button type="submit" disabled={loading}>
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>
        )}

        <p className="auth-secondary-link">
          <Link to="/">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}

export default ClaimProfile;
