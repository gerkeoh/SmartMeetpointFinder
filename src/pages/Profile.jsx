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

  if (loading) return <div className="app-page"><p className="app-message">Loading...</p></div>;

  return (
    <div className="app-page">
      <section className="app-card">
        <div className="app-section-header">
          <div>
            <h1>Profile</h1>
            <p>Update your public details and view your account summary.</p>
          </div>
        </div>

        <div className="profile-summary">
          <div>
            <span>Username</span>
            <strong>{username}</strong>
          </div>
          <div>
            <span>Email</span>
            <strong>{email}</strong>
          </div>
          <div>
            <span>Friends</span>
            <strong>{friendCount}</strong>
          </div>
        </div>

        <form className="app-form" onSubmit={onSave}>
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
          />

          <button className="app-button app-button-primary" type="submit">
            Save Profile
          </button>
        </form>

        {msg && <p className="app-message">{msg}</p>}
      </section>
    </div>
  );
};

export default Profile;
