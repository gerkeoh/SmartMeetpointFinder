import { useEffect, useMemo, useState } from "react";
import Map from "../components/Map";
import { apiUrl } from "../api";
import "../styles/Map.css";

const MapPage = () => {
  const token = localStorage.getItem("token");

  const [friends, setFriends] = useState([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState([]);
  const [meetupId, setMeetupId] = useState("");
  const [meetupIdInput, setMeetupIdInput] = useState("");
  const [myLocation, setMyLocation] = useState(null);
  const [friendLocations, setFriendLocations] = useState([]);
  const [meetingPoint, setMeetingPoint] = useState(null);
  const [status, setStatus] = useState("");
  const [title, setTitle] = useState("");
  const [participants, setParticipants] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);


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
          <input
            type="text"
            value={meetupIdInput}
            onChange={(e) => setMeetupIdInput(e.target.value)}
            placeholder="Paste meetup ID to open a meetup"
          />
        </div>

        <div className="submit-container">
          <button
            className="submit"
            onClick={() => loadMeetup(meetupIdInput.trim())}
          >
            Open Meetup
          </button>

          <button className="submit" onClick={getMyLocation}>
            Use My Location
          </button>


          <button className="submit" onClick={shareMyLocationToMeetup}>
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

          <button
            className="submit"
            onClick={calculateMeetup}
            disabled={!meetupId || participantsWithLocation < 2}
          >
            Calculate
          </button>
        </div>
        
        <p>{status}</p>

        <div className="text-container">


        <div className="text">
          {friends.length === 0 ? (
            <p>No friends available.</p>
          ) : (
            <div className="friend-dropdown-container">
      
              <div className="friend-dropdown-header" onClick={() => setDropdownOpen(!dropdownOpen)}>
                {selectedFriendIds.length > 0
                  ? `${selectedFriendIds.length} selected`
                  : "Select friends"}
              </div>

              {dropdownOpen && (
                <div className="friend-dropdown-list">
                  {friends.map((friend) => (
                    <label key={friend.id} className="friend-option">
                      <input
                        type="checkbox"
                        checked={selectedFriendIds.includes(friend.id)}
                        onChange={() => toggleFriend(friend.id)}
                      />
                      {friend.username} ({friend.email})
                    </label>
                  ))}
                </div>
              )}
            </div>
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
                {participant.location
                  ? `${participant.location.lat}, ${participant.location.lng}`
                  : "No location shared yet"}
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