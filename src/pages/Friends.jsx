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
    <div className="page">
      <section className="section_1">
        <h1>Friends</h1>
      </section>

      <section className="section_2">
        {!token ? (
          <p>You must be logged in to manage friends.</p>
        ) : (
          <>
            <form onSubmit={searchUsers} style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                placeholder="Search by username or email"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button type="submit">Search</button>
            </form>

            {results.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h3>Results</h3>
                {results.map((u) => (
                  <div
                    key={u.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 0",
                      borderBottom: "1px solid #ddd",
                    }}
                  >
                    <div>
                      <strong>{u.username}</strong>
                      <div style={{ fontSize: 12 }}>{u.email}</div>
                    </div>
                    <button type="button" onClick={() => addFriend(u.id)}>
                      Add
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 20 }}>
              <h3>Your Friends</h3>
              {friends.length === 0 ? (
                <p>No friends yet.</p>
              ) : (
                friends.map((f) => (
                  <div
                    key={f.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 0",
                      borderBottom: "1px solid #ddd",
                    }}
                  >
                    <div>
                      <strong>{f.username}</strong>
                      <div style={{ fontSize: 12 }}>{f.email}</div>
                    </div>
                    <button type="button" onClick={() => removeFriend(f.id)}>
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
      </section>
    </div>
  );
};

export default Friends;
