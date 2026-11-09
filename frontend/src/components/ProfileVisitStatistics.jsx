import { useEffect, useState } from "react";
import { API_BASE_URL } from "../apiBase.js";

const statisticItems = [
  ["today", "Today"],
  ["thisWeek", "This Week"],
  ["thisMonth", "This Month"],
  ["thisYear", "This Year"],
  ["total", "Total Visits"],
];

export default function ProfileVisitStatistics({ publicId }) {
  const [statistics, setStatistics] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadStatistics() {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/profiles/${encodeURIComponent(publicId)}/statistics`,
          { headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` } },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Could not load profile statistics");
        if (active) setStatistics(data);
      } catch (loadError) {
        if (active) setError(loadError.message);
      }
    }
    loadStatistics();
    return () => { active = false; };
  }, [publicId]);

  return (
    <section className="profile-visit-statistics" aria-labelledby="profile-visits-title">
      <h3 id="profile-visits-title">Profile Visit Statistics</h3>
      {error && <p className="error-message">{error}</p>}
      {!statistics && !error && <p role="status">Loading visit statistics...</p>}
      {statistics && (
        <div className="profile-visit-stat-grid">
          {statisticItems.map(([key, label]) => (
            <article className="profile-visit-stat-card" key={key}>
              <h4>{label}</h4>
              <p>{Number(statistics[key] || 0).toLocaleString()}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
