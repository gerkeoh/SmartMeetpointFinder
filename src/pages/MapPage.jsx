import { useCallback, useEffect, useMemo, useState } from "react";
import Map from "../components/Map";
import { apiUrl } from "../api";
import "../styles/Map.css";

const MapPage = () => {
  const token = localStorage.getItem("token");

  const [friends, setFriends] = useState([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState([]);
  const [meetupId, setMeetupId] = useState("");
  const [meetups, setMeetups] = useState([]);
  const [activeMeetup, setActiveMeetup] = useState(null);
  const [myLocation, setMyLocation] = useState(null);
  const [friendLocations, setFriendLocations] = useState([]);
  const [meetingPoint, setMeetingPoint] = useState(null);
  const [status, setStatus] = useState("");
  const [title, setTitle] = useState("");
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

  const loadMeetups = useCallback(async () => {
    if (!token) return;

    try {
      const res = await fetch(apiUrl("/api/meetups"), {
        headers: authHeaders,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus(data.message || "Failed to load meetup invitations.");
        return;
      }

      setMeetups(data.meetups || []);
    } catch {
      setStatus("Could not load meetup invitations.");
    }
  }, [token, authHeaders]);

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

  useEffect(() => {
    loadMeetups();
  }, [loadMeetups]);

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
      setMeetupId("");
      setActiveMeetup(null);
      setParticipants([]);
      setFriendLocations([]);
      setMeetingPoint(null);
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
      setActiveMeetup(data.meetup || null);
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

    if (!title.trim()) {
      setStatus("Name the meetup first.");
      return;
    }

    if (selectedFriendIds.length === 0) {
      setStatus("Select at least one friend.");
      return;
    }

    try {
      setStatus("Creating meetup and sending invitations...");

      const res = await fetch(apiUrl("/api/meetups"), {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          title,
          invitedFriendIds: selectedFriendIds,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus(data.message || "Failed to create meetup.");
        return;
      }

      setMeetupId(data.meetupId);
      await loadMeetups();
      await loadMeetup(data.meetupId);
      setStatus("Meetup created. Invitations sent.");
    } catch (error) {
      console.error(error);
      setStatus("Something went wrong while creating the meetup.");
    }
  };

  const respondToMeetup = async (response) => {
    if (!meetupId) {
      setStatus("Select a meetup first.");
      return;
    }

    try {
      const res = await fetch(apiUrl(`/api/meetups/${meetupId}/respond`), {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ response }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus(data.message || "Could not respond to invitation.");
        return;
      }

      await loadMeetups();

      if (response === "accepted") {
        await loadMeetup(meetupId);
        setStatus("Invitation accepted. You can now share your location.");
      } else {
        setMeetupId("");
        setActiveMeetup(null);
        setParticipants([]);
        setFriendLocations([]);
        setMeetingPoint(null);
        setStatus("Invitation rejected.");
      }
    } catch {
      setStatus("Something went wrong while responding.");
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

  const currentParticipant = participants.find((p) => p.isCurrentUser);
  const canShareLocation = currentParticipant?.responseStatus === "accepted";
  const participantsWithLocation = participants.filter((p) => p.location).length;

  return (
  <div className="whole-container">
    <div className="meetup-container">
      <div className="header">
        <div className="text">Map Meetup</div>
        <div className="underline"></div>
      </div>

      <div className="inputs">
        <div className="input">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Meetup title"
          />
        </div>

        <div className="input">
          <select value={meetupId} onChange={(e) => loadMeetup(e.target.value)}>
            <option value="">Select meetup invitation</option>
            {meetups.map((meetup) => (
              <option key={meetup.id} value={meetup.id}>
                {meetup.title} - {meetup.responseStatus}
              </option>
            ))}
          </select>
        </div>

        <div className="submit-container">
          <button className="submit" onClick={getMyLocation}>
            Use My Location
          </button>


          <button
            className="submit"
            onClick={shareMyLocationToMeetup}
            disabled={!meetupId || !canShareLocation}
          >
            Share Location
          </button>

          <button className="submit" onClick={createMeetup}>
            Create Meetup
          </button>

          <button
            className="submit"
            onClick={() => loadMeetup(meetupId)}
            disabled={!meetupId}
          >
            Refresh
          </button>

          {activeMeetup?.isCreator && (
            <button
              className="submit"
              onClick={calculateMeetup}
              disabled={!meetupId || participantsWithLocation < 2}
            >
              Calculate Meetup
            </button>
          )}
        </div>

        {activeMeetup &&
          !activeMeetup.isCreator &&
          currentParticipant?.responseStatus === "pending" && (
          <div className="submit-container">
            <button
              className="submit"
              onClick={() => respondToMeetup("accepted")}
            >
              Accept Invitation
            </button>

            <button
              className="submit"
              onClick={() => respondToMeetup("rejected")}
            >
              Reject Invitation
            </button>
          </div>
        )}

        <div className="text-container">
        <p>{status}</p>

        <div className="text">
          <p>Participants with locations:</p>
          {participantsWithLocation}
        </div>

        <div className="text">
          <p>Select Friends</p>
          {friends.length === 0 ? (
            <p>No friends available.</p>
          ) : (
            friends.map((friend) => (
              <label key={friend.id}>
                <input
                  type="checkbox"
                  checked={selectedFriendIds.includes(friend.id)}
                  onChange={() => toggleFriend(friend.id)}
                />
                {friend.username} ({friend.email})
              </label>
            ))
          )}
        </div>

        <div className="text">
          <p>Meetup Participants</p>
          {participants.length === 0 ? (
            <p>No meetup loaded.</p>
          ) : (
            participants.map((participant) => (
              <div key={participant.userId}>
                <strong>
                  {participant.isCurrentUser
                    ? `${participant.username || "You"} (You)`
                    : participant.username || "Friend"}
                </strong>
                {" - "}
                {participant.responseStatus === "pending"
                  ? "Invitation pending"
                  : participant.responseStatus === "rejected"
                  ? "Rejected"
                  : participant.location
                  ? `${participant.location.lat}, ${participant.location.lng}`
                  : "Accepted - no location shared yet"}
              </div>
            ))
          )}
        </div>
        </div>
      </div>
      <div className="map-container">
      <div className="header">
        <div className="text">Meeting Map</div>
        <div className="underline"></div>
      </div>

      <Map
        myLocation={myLocation}
        friendLocations={friendLocations}
        meetingPoint={meetingPoint}
      />
    </div>
    </div>
  </div>
);
};

export default MapPage;
