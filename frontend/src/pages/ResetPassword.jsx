import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { API_BASE_URL } from "../apiBase.js";
import PasswordField from "./PasswordField.jsx";
import "../App.css";

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/auth/password-reset/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password }),
        },
      );
      const data = await response.json();

      if (!response.ok)
        throw new Error(data.message || "Could not reset password");
      setMessage(data.message);
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
          <h2>Choose a New Password</h2>
          <p>
            Use at least 12 characters. Reset links expire after 30 minutes.
          </p>
        </div>
        {!token ? (
          <p className="error-message">
            This reset link is invalid or expired.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <PasswordField
              id="new-password"
              label="New password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />
            <PasswordField
              id="confirm-new-password"
              label="Confirm password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
            />
            {error && <p className="error-message">{error}</p>}
            {message && <p className="success-message">{message}</p>}
            {!message && (
              <button type="submit" disabled={loading}>
                {loading ? "Updating..." : "Update Password"}
              </button>
            )}
          </form>
        )}
        <p className="auth-secondary-link">
          <Link to="/">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}

export default ResetPassword;
