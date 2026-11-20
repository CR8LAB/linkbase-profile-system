import { useEffect, useState } from "react";
import { API_BASE_URL } from "../apiBase.js";

const platforms = ["LinkedIn", "Facebook", "Instagram", "TikTok", "YouTube", "X", "WhatsApp", "Website"];

function SocialLinksEditor({ profileId, title = "Social Links", description = "Manage the links displayed on this public profile.", onLinksChange }) {
  const [links, setLinks] = useState([]);
  const [platform, setPlatform] = useState("LinkedIn");
  const [url, setUrl] = useState("");
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    async function loadLinks() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`${API_BASE_URL}/api/social-links/${encodeURIComponent(profileId)}`, {
          headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Could not load social links");
        if (active) {
          const loadedLinks = data.socialLinks || [];
          setLinks(loadedLinks);
          onLinksChange?.(loadedLinks);
        }
      } catch (loadError) {
        if (active) setError(loadError.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    if (profileId) loadLinks();
    else {
      setError("Profile ID is unavailable.");
      setLoading(false);
    }
    return () => { active = false; };
  }, [profileId, onLinksChange]);

  function updateLinks(nextLinks) {
    setLinks(nextLinks);
    onLinksChange?.(nextLinks);
  }

  async function request(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${sessionStorage.getItem("token")}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Could not update social links");
    return data;
  }

  async function addLink() {
    setSaving(true); setError(""); setSuccess("");
    try {
      const data = await request("/api/social-links", {
        method: "POST",
        body: JSON.stringify({
          profileId,
          platform,
          url: url.trim(),
          sortOrder: Math.max(-1, ...links.map((link) => link.sortOrder ?? -1)) + 1,
        }),
      });
      updateLinks([...links, data.socialLink]);
      setUrl(""); setSuccess("Social link added.");
    } catch (saveError) { setError(saveError.message); }
    finally { setSaving(false); }
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const data = await request(`/api/social-links/${encodeURIComponent(editing.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ platform: editing.platform, url: editing.url.trim() }),
      });
      updateLinks(links.map((link) => link.id === editing.id ? data.socialLink : link));
      setEditing(null); setSuccess("Social link updated.");
    } catch (saveError) { setError(saveError.message); }
    finally { setSaving(false); }
  }

  async function deleteLink(link) {
    if (!window.confirm(`Delete the ${link.platform} link?`)) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      await request(`/api/social-links/${encodeURIComponent(link.id)}`, { method: "DELETE" });
      updateLinks(links.filter((item) => item.id !== link.id));
      if (editing?.id === link.id) setEditing(null);
      setSuccess("Social link deleted.");
    } catch (deleteError) { setError(deleteError.message); }
    finally { setSaving(false); }
  }

  async function moveLink(index, offset) {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= links.length || saving) return;
    const reordered = [...links];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    setSaving(true); setError(""); setSuccess("");
    try {
      await request("/api/social-links/reorder", {
        method: "PATCH",
        body: JSON.stringify({ profileId, orderedIds: reordered.map((link) => link.id) }),
      });
      updateLinks(reordered.map((link, sortOrder) => ({ ...link, sortOrder })));
      setSuccess("Social links reordered.");
    } catch (reorderError) { setError(reorderError.message); }
    finally { setSaving(false); }
  }

  return (
    <section className="social-links-editor">
      <h3>{title}</h3>
      <p>{description}</p>
      {error && <p className="error-message" role="alert">{error}</p>}
      {success && <p className="success-message" role="status">{success}</p>}
      {loading ? <p>Loading social links...</p> : (
        <>
          <div className="social-link-create-row">
            <label>Platform<select value={platform} onChange={(event) => setPlatform(event.target.value)}>
              {platforms.map((item) => <option key={item} value={item}>{item}</option>)}
            </select></label>
            <label>Profile URL<input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." /></label>
            <button type="button" onClick={addLink} disabled={saving || !url.trim()}>Add link</button>
          </div>
          {links.length === 0 ? <p>No social links added yet.</p> : (
            <div className="social-links-list">
              {links.map((link, index) => (
                <div className="social-link-item" key={link.id}>
                  {editing?.id === link.id ? (
                    <div className="social-link-edit-fields">
                      <select aria-label="Edit platform" value={editing.platform} onChange={(event) => setEditing({ ...editing, platform: event.target.value })}>
                        {[...new Set([editing.platform, ...platforms])].map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                      <input aria-label="Edit profile URL" type="url" value={editing.url} onChange={(event) => setEditing({ ...editing, url: event.target.value })} />
                    </div>
                  ) : (
                    <div><strong>{link.platform}</strong><a href={link.url} target="_blank" rel="noopener noreferrer">{link.url}</a></div>
                  )}
                  <div className="social-link-actions">
                    <button type="button" onClick={() => moveLink(index, -1)} disabled={saving || index === 0} aria-label={`Move ${link.platform} up`}>↑</button>
                    <button type="button" onClick={() => moveLink(index, 1)} disabled={saving || index === links.length - 1} aria-label={`Move ${link.platform} down`}>↓</button>
                    {editing?.id === link.id ? (
                      <><button type="button" onClick={saveEdit} disabled={saving || !editing.url.trim()}>Save</button><button type="button" onClick={() => setEditing(null)} disabled={saving}>Cancel</button></>
                    ) : <button type="button" onClick={() => setEditing({ id: link.id, platform: link.platform, url: link.url })} disabled={saving}>Edit</button>}
                    <button type="button" onClick={() => deleteLink(link)} disabled={saving}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default SocialLinksEditor;
