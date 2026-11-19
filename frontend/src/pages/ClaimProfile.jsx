import { useLayoutEffect, useReducer, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../apiBase.js";
import {
  actionTokenReducer,
  readActionToken,
  removeActionTokenFromUrl,
  submitActionToken,
} from "../utils/actionToken.js";
import PasswordField from "./PasswordField.jsx";
import "../App.css";

function ClaimProfile() {
  const navigate = useNavigate();
  const [token, dispatchToken] = useReducer(
    actionTokenReducer,
    window.location,
    readActionToken,
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useLayoutEffect(() => {
    removeActionTokenFromUrl(window.location, window.history);
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await submitActionToken({
        endpoint: `${API_BASE_URL}/api/auth/claim`,
        token,
        password,
        errorMessage: "Could not claim profile",
        clearToken: () => dispatchToken({ type: "clear" }),
        onSuccess: (data) =>
          navigate("/", { replace: true, state: { message: data.message } }),
      });
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
