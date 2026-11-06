import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { API_BASE_URL } from "../apiBase.js";

const SHORT_CODE_PATTERN = /^[a-f0-9]{12}$/i;

function ShortUrlRedirect() {
  const { shortCode } = useParams();
  const [path, setPath] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function resolve() {
      if (!SHORT_CODE_PATTERN.test(shortCode || "")) {
        setError("This short link is invalid.");
        return;
      }

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/short-links/${encodeURIComponent(shortCode)}`,
        );
        const data = await response.json();

        if (!response.ok)
          throw new Error(data.message || "Short link not found");
        if (
          typeof data.path !== "string" ||
          !data.path.startsWith("/profile/")
        ) {
          throw new Error("Short link destination is invalid");
        }

        if (active) setPath(data.path);
      } catch (resolveError) {
        if (active) setError(resolveError.message);
      }
    }

    resolve();
    return () => {
      active = false;
    };
  }, [shortCode]);

  if (path) return <Navigate to={path} replace />;
  if (error) return <p role="alert">{error}</p>;
  return <p>Opening LinkBase profile...</p>;
}

export default ShortUrlRedirect;
