import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiUrl } from "../api";

const Profile = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [friendCount, setFriendCount] = useState(0);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");

  const authHeaders = token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };

  useEffect(() => {
    const load = async () => {
      setMsg("");

      if (!token) {
        navigate("/login");
        return;
      }

      try {
        const res = await fetch(apiUrl("/api/profile"), { headers: authHeaders });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setMsg(data?.message || "Failed to load profile.");
          setLoading(false);
          return;
        }

        setEmail(data.user.email || "");
        setUsername(data.user.username || "");
        setDisplayName(data.user.displayName || "");
        setBio(data.user.bio || "");
        setFriendCount(data.friendCount || 0);
      } catch (err) {
        setMsg("Network error.");
      } finally {
        setLoading(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSave = async (e) => {
    e.preventDefault();
    setMsg("");

    try {
      const res = await fetch(apiUrl("/api/profile"), {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ displayName, bio }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data?.message || "Could not update profile.");
        return;
      }

      // Optional: keep localStorage user in sync (username/email unchanged)
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      localStorage.setItem(
        "user",
        JSON.stringify({ ...stored, displayName, bio })
      );

      setMsg("Profile saved.");
    } catch (err) {
      setMsg("Network error.");
    }
  };

  if (loading) return <div className="page"><p>Loading...</p></div>;

  return (
    <div className="page">
      <section className="section_1">
        <h1>Profile</h1>
      </section>

      <section className="section_2">
        <div style={{ marginBottom: 16 }}>
          <p><strong>Username:</strong> {username}</p>
          <p><strong>Email:</strong> {email}</p>
          <p><strong>Friends:</strong> {friendCount}</p>
        </div>

        <form onSubmit={onSave}>
          <input
            type="text"
            placeholder="Display name (optional)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />

          <textarea
            placeholder="Bio (optional)"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
            style={{ width: "100%", marginTop: 10 }}
          />

          <button type="submit" style={{ marginTop: 10 }}>
            Save Profile
          </button>
        </form>

        {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
      </section>
    </div>
  );
};

export default Profile;