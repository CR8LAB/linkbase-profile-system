import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import PublicProfileCard from "./PublicProfileCard.jsx";

function PublicProfile() {
  const { publicId } = useParams();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchProfile() {
      try {
        const response = await fetch(
          `http://localhost:5000/api/profiles/${publicId}`,
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Profile not found");
        }

        setProfile(data.profile);
      } catch (error) {
        setError(error.message);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [publicId]);

  if (loading) return <p>Loading profile...</p>;

  if (error) return <p>{error}</p>;

  if (!profile) return <p>Profile not found.</p>;

  return <PublicProfileCard profile={profile} />;
}

export default PublicProfile;
