import { useEffect, useMemo, useState } from "react";
import Map from "../components/Map";
import { apiUrl } from "../api";
import "../styles/Map.css";

const MapPage = () => {
  const token = localStorage.getItem("token");

  const [friends, setFriends] = useState([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState([]);
  const [meetups, setMeetups] = useState([]);
  const [meetupId, setMeetupId] = useState("");
  const [meetupIdInput, setMeetupIdInput] = useState("");
  const [myLocation, setMyLocation] = useState(null);
  const [friendLocations, setFriendLocations] = useState([]);
  const [meetingPoint, setMeetingPoint] = useState(null);
  const [status, setStatus] = useState("");
  const [title, setTitle] = useState("");
  const [participants, setParticipants] = useState([]);
  const [currentMeetup, setCurrentMeetup] = useState(null);

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
    loadFriends();
    loadMyMeetups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const loadFriends = async () => {
    if (!token) {
      setFriends([]);
      return;
    }

    try {
      const res = await fetch(apiUrl("/api/friends"), {
        headers: authHeaders,
      });
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

  const loadMyMeetups = async () => {
    if (!token) {
      setMeetups([]);
      return;
    }

    try {
      const res = await fetch(apiUrl("/api/meetups"), {
        headers: authHeaders,
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus(data.message || "Failed to load meetups.");
        return;
      }

      setMeetups(data.meetups || []);
    } catch (error) {
      setStatus("Could not load meetups.");
    }
  };

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
        setStatus("Your location loaded. Now click Share Location.");
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
      setCurrentMeetup(data.meetup || null);
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
      await loadMyMeetups();
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
      setStatus("Enter a meetup name first.");
      return;
    }

    if (selectedFriendIds.length === 0) {
      setStatus("Select at least one friend.");
      return;
    }

    try {
      setStatus("Creating meetup and sending invitations...");

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
      setSelectedFriendIds([]);
      setTitle("");

      await loadMeetup(newMeetupId);
      setStatus(
        "Meetup created. Friends can now accept or reject the invitation."
      );
    } catch (error) {
      console.error(error);
      setStatus("Something went wrong while creating the meetup.");
    }
  };

  const respondToInvite = async (response) => {
    if (!token) {
      setStatus("Please log in first.");
      return;
    }

    if (!meetupId) {
      setStatus("Open a meetup first.");
      return;
    }

    try {
      setStatus(
        response === "accepted"
          ? "Accepting invitation..."
          : "Rejecting invitation..."
      );

      const res = await fetch(apiUrl(`/api/meetups/${meetupId}/respond`), {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ response }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus(data.message || "Failed to respond to invitation.");
        return;
      }

      await loadMeetup(meetupId);
      setStatus(data.message);
    } catch (error) {
      console.error(error);
      setStatus("Something went wrong while responding to the invitation.");
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
      setStatus("Your meetup location has been shared.");
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
  const acceptedParticipants = participants.filter(
    (p) => p.inviteStatus === "accepted"
  ).length;

  const currentUserParticipant = participants.find((p) => p.isCurrentUser);
  const canRespond =
    currentUserParticipant &&
    currentUserParticipant.role !== "creator" &&
    currentUserParticipant.inviteStatus === "pending";

  const canShareLocation =
    currentUserParticipant?.inviteStatus === "accepted" || currentMeetup?.isCreator;

  const canCalculate =
    currentMeetup?.isCreator &&
    acceptedParticipants >= 2 &&
    participantsWithLocation === acceptedParticipants;

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
              placeholder="Meetup name"
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

            <button
              className="submit"
              onClick={calculateMeetup}
              disabled={!canCalculate}
            >
              Calculate
            </button>
          </div>

          {canRespond && (
            <div className="submit-container">
              <button
                className="submit"
                onClick={() => respondToInvite("accepted")}
              >
                Accept Invitation
              </button>

              <button
                className="submit"
                onClick={() => respondToInvite("rejected")}
              >
                Reject Invitation
              </button>
            </div>
          )}

          <div className="text-container">
            {meetupId && (
              <p>
                <strong>Meetup ID:</strong> {meetupId}
              </p>
            )}

            {currentMeetup && (
              <p>
                <strong>Current meetup:</strong> {currentMeetup.title}
              </p>
            )}

            <p>{status}</p>

            <div className="text">
              <p>Accepted participants:</p>
              {acceptedParticipants}
            </div>

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
              <p>Your Meetups / Invitations</p>
              {meetups.length === 0 ? (
                <p>No meetups found.</p>
              ) : (
                meetups.map((meetup) => (
                  <button
                    key={meetup.id}
                    className="submit"
                    onClick={() => loadMeetup(meetup.id)}
                  >
                    {meetup.title} - {meetup.myInviteStatus}
                  </button>
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
                    {participant.inviteStatus}
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