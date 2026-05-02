import { useEffect, useState } from "react";
import { apiUrl } from "../api";

const Friends = () => {
  const token = localStorage.getItem("token");
  const [friends, setFriends] = useState([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [msg, setMsg] = useState("");
  const authHeaders = token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };

  const loadFriends = async () => {
    setMsg("");
    if (!token) {
      setFriends([]);
      return;
    }
    const res = await fetch(apiUrl("/api/friends"), { headers: authHeaders });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data?.message || "Failed to load friends.");
      return;
    }
    setFriends(data.friends || []);
  };

  useEffect(() => {
    loadFriends();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const searchUsers = async (e) => {
    e.preventDefault();
    setMsg("");
    setResults([]);

    if (!token) {
      setMsg("Please login to search for friends.");
      return;
    }
    const query = q.trim();
    if (!query) return;

    const res = await fetch(apiUrl(`/api/users/search?q=${encodeURIComponent(query)}`), {
      headers: authHeaders,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data?.message || "Search failed.");
      return;
    }
    setResults(data.results || []);
  };

  const addFriend = async (friendId) => {
    setMsg("");
    const res = await fetch(apiUrl("/api/friends/add"), {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ friendId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data?.message || "Could not add friend.");
      return;
    }
    setQ("");
    setResults([]);
    await loadFriends();
  };

  const removeFriend = async (friendId) => {
    setMsg("");
    const res = await fetch(apiUrl("/api/friends/remove"), {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ friendId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data?.message || "Could not remove friend.");
      return;
    }
    await loadFriends();
  };

  return (
    <div className="app-page">
      <section className="app-card app-card-wide">
        <div className="app-section-header">
          <div>
            <h1>Friends</h1>
            <p>Search for users and manage your saved friend list.</p>
          </div>
        </div>

        {!token ? (
          <p>You must be logged in to manage friends.</p>
        ) : (
          <>
            <form className="app-form app-search-form" onSubmit={searchUsers}>
              <input
                type="text"
                placeholder="Search by username or email"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button className="app-button app-button-primary" type="submit">Search</button>
            </form>

            {results.length > 0 && (
              <div className="app-section">
                <h3>Results</h3>
                <div className="app-list">
                  {results.map((u) => (
                    <div className="app-list-row" key={u.id}>
                      <div className="app-list-content">
                        <strong>{u.username}</strong>
                        <span>{u.email}</span>
                      </div>
                      <button className="app-button app-button-primary" type="button" onClick={() => addFriend(u.id)}>
                        Add
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="app-section">
              <h3>Your Friends</h3>
              {friends.length === 0 ? (
                <p>No friends yet.</p>
              ) : (
                <div className="app-list">
                  {friends.map((f) => (
                    <div className="app-list-row" key={f.id}>
                      <div className="app-list-content">
                        <strong>{f.username}</strong>
                        <span>{f.email}</span>
                      </div>
                      <button
                        className="app-button app-button-muted"
                        type="button"
                        onClick={() => removeFriend(f.id)}
                      >
                        Remove friend
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {msg && <p className="app-message">{msg}</p>}
      </section>
    </div>
  );
};

export default Friends;
