import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { API_BASE_URL } from "../apiBase.js";
import PublicProfileCard from "./PublicProfileCard.jsx";
import { shouldRecordLocationVisit } from "../utils/locationVisitGuard.js";

function PublicProfile() {
  const { publicId } = useParams();
  const location = useLocation();
  const lastTrackedLocation = useRef(null);

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function fetchProfile() {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/profiles/${encodeURIComponent(publicId)}`,
        );

        const data = await response.json();

        if (!active) return;

        if (!response.ok) {
          throw new Error(data.message || "Profile not found");
        }

        setProfile(data.profile);
        if (shouldRecordLocationVisit(lastTrackedLocation.current, location.key)) {
          lastTrackedLocation.current = location.key;
          fetch(`${API_BASE_URL}/api/profiles/${encodeURIComponent(publicId)}/visits`, {
            method: "POST",
          }).catch(() => {});
        }
      } catch (error) {
        if (active) setError(error.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchProfile();
    return () => {
      active = false;
    };
  }, [publicId, location.key]);

  if (loading) return <p>Loading profile...</p>;

  if (error) return <p>{error}</p>;

  if (!profile) return <p>Profile not found.</p>;

  return <PublicProfileCard profile={profile} />;
}

export default PublicProfile;
