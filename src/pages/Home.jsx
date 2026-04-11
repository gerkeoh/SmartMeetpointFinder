import { useEffect, useMemo, useState } from "react";
import Map from "../components/Map";
import { apiUrl } from "../api";

const Home = () => {
  const token = localStorage.getItem("token");

  const [friends, setFriends] = useState([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState([]);
  const [meetupId, setMeetupId] = useState("");
  const [meetupIdInput, setMeetupIdInput] = useState("");
  const [myLocation, setMyLocation] = useState(null);
  const [friendLocations, setFriendLocations] = useState([]);
  const [meetingPoint, setMeetingPoint] = useState(null);
  const [status, setStatus] = useState("");
  const [title, setTitle] = useState("New Meetup");
  const [participants, setParticipants] = useState([]);

  const authHeaders = useMemo(() => {
    return token
      ? {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        }
      : {
          "Content-Type": "application/json",
        };
  }, [token]);

  useEffect(() => {
    const loadFriends = async () => {
      if (!token) {
        setFriends([]);
        return;
      }

      try {
        const res = await fetch(apiUrl("/api/friends"), { headers: authHeaders });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setStatus(data.message || "Failed to load friends.");
          return;
        }

        setFriends(data.friends || []);
      } catch (error) {
        setStatus("Could not load friends.");
      }
    };

    loadFriends();
  }, [token, authHeaders]);

  const toggleFriend = (friendId) => {
    setSelectedFriendIds((prev) =>
      prev.includes(friendId)
        ? prev.filter((id) => id !== friendId)
        : [...prev, friendId]
    );
  };

  const getMyLocation = () => {
    if (!navigator.geolocation) {
      setStatus("Geolocation is not supported by your browser.");
      return;
    }

    setStatus("Getting your location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setMyLocation(coords);
        setStatus("Your location loaded.");
      },
      () => {
        setStatus("Unable to retrieve your location.");
      }
    );
  };

  const loadMeetup = async (id = meetupId) => {
    if (!token || !id) {
      return;
    }

    try {
      const res = await fetch(apiUrl(`/api/meetups/${id}`), {
        headers: authHeaders,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus(data.message || "Failed to load meetup.");
        return;
      }

      const meetupParticipants = data.participants || [];

      const others = meetupParticipants
        .filter((p) => p.location && !p.isCurrentUser)
        .map((p) => ({
          id: p.userId,
          name: p.username || "Friend",
          lat: p.location.lat,
          lng: p.location.lng,
        }));

      const me = meetupParticipants.find((p) => p.isCurrentUser && p.location);

      setMeetupId(id);
      setMeetupIdInput(id);
      setParticipants(meetupParticipants);
      setFriendLocations(others);
      setMeetingPoint(data.suggestedMeetingPoint || null);

      if (me?.location) {
        setMyLocation({
          lat: me.location.lat,
          lng: me.location.lng,
        });
      }

      setStatus("Meetup loaded.");
    } catch (error) {
      setStatus("Could not load meetup.");
    }
  };

  const createMeetup = async () => {
    if (!token) {
      setStatus("Please log in first.");
      return;
    }

    if (!myLocation) {
      setStatus("Load your location first.");
      return;
    }

    if (selectedFriendIds.length === 0) {
      setStatus("Select at least one friend.");
      return;
    }

    try {
      setStatus("Creating meetup...");

      const createRes = await fetch(apiUrl("/api/meetups"), {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          title,
          invitedFriendIds: selectedFriendIds,
        }),
      });

      const createData = await createRes.json().catch(() => ({}));

      if (!createRes.ok) {
        setStatus(createData.message || "Failed to create meetup.");
        return;
      }

      const newMeetupId = createData.meetupId;
      setMeetupId(newMeetupId);
      setMeetupIdInput(newMeetupId);

      const locationRes = await fetch(apiUrl(`/api/meetups/${newMeetupId}/location`), {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          lat: myLocation.lat,
          lng: myLocation.lng,
          source: "gps",
        }),
      }
    );

      const locationData = await locationRes.json().catch(() => ({}));

      if (!locationRes.ok) {
        setStatus(
          locationData.message || "Meetup created, but location was not saved."
        );
        return;
      }

      setStatus("Meetup created. Your location has been saved.");
      await loadMeetup(newMeetupId);
    } catch (error) {
      console.error(error);
      setStatus("Something went wrong while creating the meetup.");
    }
  };

  const shareMyLocationToMeetup = async () => {
    if (!token) {
      setStatus("Please log in first.");
      return;
    }

    if (!meetupId) {
      setStatus("Load or create a meetup first.");
      return;
    }

    if (!myLocation) {
      setStatus("Use My Location first.");
      return;
    }

    try {
      setStatus("Saving your location to this meetup...");

      const res = await fetch(apiUrl(`/api/meetups/${meetupId}/location`), {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          lat: myLocation.lat,
          lng: myLocation.lng,
          source: "gps",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus(data.message || "Failed to save your location.");
        return;
      }

      await loadMeetup(meetupId);
      setStatus("Your meetup location has been saved.");
    } catch (error) {
      console.error(error);
      setStatus("Something went wrong while saving your location.");
    }
  };

  const calculateMeetup = async () => {
    if (!token) {
      setStatus("Please log in first.");
      return;
    }

    if (!meetupId) {
      setStatus("Create or load a meetup first.");
      return;
    }

    try {
      setStatus("Calculating meeting point...");

      const res = await fetch(apiUrl(`/api/meetups/${meetupId}/calculate`), {
        method: "POST",
        headers: authHeaders,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus(data.message || "Failed to calculate meeting point.");
        return;
      }

      setMeetingPoint(data.meetingPoint || null);
      await loadMeetup(meetupId);
      setStatus("Meeting point calculated.");
    } catch (error) {
      console.error(error);
      setStatus("Something went wrong while calculating.");
    }
  };

  const participantsWithLocation = participants.filter((p) => p.location).length;

  return (
    <div className="page">
      <section className="section_1">
        <h1>Welcome to Smart Meet Point Finder</h1>
        <p>Pick friends, share locations, find a fair place to meet.</p>

        {!token && <p>Please log in to use meetups.</p>}

        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Meetup title"
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            value={meetupIdInput}
            onChange={(e) => setMeetupIdInput(e.target.value)}
            placeholder="Paste meetup ID to open a meetup"
            style={{ minWidth: 320 }}
          />
          <button
            onClick={() => loadMeetup(meetupIdInput.trim())}
            style={{ marginLeft: 8 }}
          >
            Open Meetup
          </button>
        </div>

        <button onClick={getMyLocation}>Use My Location</button>

        <button onClick={shareMyLocationToMeetup} style={{ marginLeft: 8 }}>
          Share My Location To This Meetup
        </button>

        <button onClick={createMeetup} style={{ marginLeft: 8 }}>
          Create Meetup
        </button>

        <button
          onClick={() => loadMeetup(meetupId)}
          disabled={!meetupId}
          style={{ marginLeft: 8 }}
        >
          Refresh Meetup
        </button>

        <button
          onClick={calculateMeetup}
          disabled={!meetupId || participantsWithLocation < 2}
          style={{ marginLeft: 8 }}
        >
          Calculate Meeting Point
        </button>

        {meetupId && (
          <p style={{ marginTop: 12 }}>
            <strong>Meetup ID:</strong> {meetupId}
          </p>
        )}

        <p>{status}</p>

        <div style={{ marginTop: 12 }}>
          <strong>Participants with locations:</strong> {participantsWithLocation}
        </div>

        <div style={{ marginTop: 20 }}>
          <h2>Select Friends</h2>
          {friends.length === 0 ? (
            <p>No friends available.</p>
          ) : (
            friends.map((friend) => (
              <label
                key={friend.id}
                style={{
                  display: "block",
                  marginBottom: 8,
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedFriendIds.includes(friend.id)}
                  onChange={() => toggleFriend(friend.id)}
                />
                <span style={{ marginLeft: 8 }}>
                  {friend.username} ({friend.email})
                </span>
              </label>
            ))
          )}
        </div>

        <div style={{ marginTop: 20 }}>
          <h2>Meetup Participants</h2>
          {participants.length === 0 ? (
            <p>No meetup loaded.</p>
          ) : (
            participants.map((participant) => (
              <div key={participant.userId} style={{ marginBottom: 8 }}>
                <strong>
                  {participant.isCurrentUser
                    ? `${participant.username || "You"} (You)`
                    : participant.username || "Friend"}
                </strong>
                {" - "}
                {participant.location
                  ? `${participant.location.lat}, ${participant.location.lng}`
                  : "No location shared yet"}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="section_2">
        <Map
          myLocation={myLocation}
          friendLocations={friendLocations}
          meetingPoint={meetingPoint}
        />
      </section>
    </div>
  );
};

export default Home;