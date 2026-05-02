import { useEffect, useState } from "react";
import { apiUrl } from "../api";

const Friends = () => {
  const token = localStorage.getItem("token");
  const [friends, setFriends] = useState([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [msg, setMsg] = useState("");
  const [selectedFriendIds, setSelectedFriendIds] = useState(() => {
    try {
      const stored = localStorage.getItem("meetupFriendIds");
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

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

  useEffect(() => {
    localStorage.setItem("meetupFriendIds", JSON.stringify(selectedFriendIds));
  }, [selectedFriendIds]);

  useEffect(() => {
    setSelectedFriendIds((ids) => ids.filter((id) => friends.some((f) => f.id === id)));
  }, [friends]);

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
    setSelectedFriendIds((ids) => ids.filter((id) => id !== friendId));
    await loadFriends();
  };

  const toggleMeetupFriend = (friendId) => {
    setSelectedFriendIds((ids) =>
      ids.includes(friendId)
        ? ids.filter((id) => id !== friendId)
        : [...ids, friendId]
    );
  };

  return (
    <div className="page">
      <section className="section_1">
        <h1>Friends</h1>
        {!token ? (
          <p>You must be logged in to manage friends.</p>
        ) : (
          <>
            <form onSubmit={searchUsers}>
              <input
                type="text"
                placeholder="Search by username or email"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button type="submit">Search</button>
            </form>

            {results.length > 0 && (
              <div>
                <h3>Results</h3>
                {results.map((u) => (
                  <div
                    key={u.id}
                  >
                    <div>
                      <strong>{u.username}</strong>
                      <div>{u.email}</div>
                    </div>
                    <button type="button" onClick={() => addFriend(u.id)}>
                      Add
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div>
              <h3>Your Friends</h3>
              {friends.length === 0 ? (
                <p>No friends yet.</p>
              ) : (
                friends.map((f) => {
                  const isSelected = selectedFriendIds.includes(f.id);
                  return (
                    <div key={f.id}>
                      <div>
                        <strong>{f.username}</strong>
                        <div>{f.email}</div>
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={() => toggleMeetupFriend(f.id)}
                        >
                          {isSelected ? "Remove from meetup" : "Add to meetup"}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFriend(f.id)}
                        >
                          Remove friend
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div>
              <h3>Meetup Participants</h3>
              {selectedFriendIds.length === 0 ? (
                <p>Select friends from your list to add them to the meetup.</p>
              ) : (
                <ul>
                  {friends
                    .filter((f) => selectedFriendIds.includes(f.id))
                    .map((friend) => (
                      <li key={friend.id}>{friend.username}</li>
                    ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => setSelectedFriendIds([])}
                disabled={selectedFriendIds.length === 0}
              >
                Clear meetup selection
              </button>
            </div>
          </>
        )}

        {msg && <p>{msg}</p>}
      </section>
    </div>
  );
};

export default Friends;
