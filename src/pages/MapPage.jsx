import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { apiUrl } from "../api";
import "../styles/MapPage.css";

const userIcon = new L.Icon({
  iconUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function LocationUpdater({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.setView(position, 15);
    }
  }, [map, position]);
  return null;
}

const MapPage = () => {
  const token = localStorage.getItem("token");
  const [position, setPosition] = useState(null);
  const [status, setStatus] = useState("Click the button below to allow location access.");
  const [loading, setLoading] = useState(false);
  const [friends, setFriends] = useState([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState([]);
  const [meetupTitle, setMeetupTitle] = useState("");
  const [meetupMessage, setMeetupMessage] = useState("");
  const [savingMeetup, setSavingMeetup] = useState(false);

  const authHeaders = token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };

  useEffect(() => {
    const loadFriends = async () => {
      setMeetupMessage("");
      if (!token) {
        setFriends([]);
        return;
      }

      const res = await fetch(apiUrl("/api/friends"), { headers: authHeaders });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMeetupMessage(data?.message || "Failed to load friends.");
        return;
      }

      setFriends(data.friends || []);
    };

    loadFriends();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    setSelectedFriendIds((ids) => ids.filter((id) => friends.some((friend) => friend.id === id)));
  }, [friends]);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setStatus("Geolocation is not supported by your browser.");
      return;
    }

    setLoading(true);
    setStatus("Requesting location access...");

    const success = (pos) => {
      const { latitude, longitude } = pos.coords;
      setPosition([latitude, longitude]);
      setStatus("You are here.");
      setLoading(false);
    };

    const error = (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        setStatus("Location permission denied. Please allow location access.");
      } else {
        setStatus("Unable to retrieve your location.");
      }
      setLoading(false);
    };

    navigator.geolocation.getCurrentPosition(success, error, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  };

  const toggleMeetupFriend = (friendId) => {
    setMeetupMessage("");
    setSelectedFriendIds((ids) =>
      ids.includes(friendId)
        ? ids.filter((id) => id !== friendId)
        : [...ids, friendId]
    );
  };

  const saveMeetup = async () => {
    setMeetupMessage("");

    if (!token) {
      setMeetupMessage("Please login to create a meetup.");
      return;
    }

    if (selectedFriendIds.length === 0) {
      setMeetupMessage("Choose at least one friend for the meetup.");
      return;
    }

    setSavingMeetup(true);

    const res = await fetch(apiUrl("/api/meetups"), {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        title: meetupTitle,
        friendIds: selectedFriendIds,
      }),
    });
    const data = await res.json().catch(() => ({}));

    setSavingMeetup(false);

    if (!res.ok) {
      setMeetupMessage(data?.message || "Could not save meetup.");
      return;
    }

    setMeetupMessage(`Meetup saved. ID: ${data.meetupSaveId || data.meetupId}`);
    setMeetupTitle("");
    setSelectedFriendIds([]);
  };

  return (
    <div className="map-page-container">
      <div className="map-page-header">
        <h2>Your Location Map</h2>
        <p>{status}</p>
      </div>

      <div className="location-request-card">
        <div>
          <h3>Allow Location Access</h3>
          <p>Press the button below so the app can show your current location on the map.</p>
        </div>
        <button
          className="location-button"
          onClick={requestLocation}
          disabled={loading || Boolean(position)}
        >
          {position ? "Location enabled" : loading ? "Allowing location..." : "Allow access"}
        </button>
      </div>

      <div className="meetup-card">
        <div className="meetup-card-header">
          <div>
            <h3>Create Meetup</h3>
            <p>Choose the friend you want to add to this meetup.</p>
          </div>
          <span className="meetup-count">{selectedFriendIds.length} selected</span>
        </div>

        <label className="meetup-title-field" htmlFor="meetup-title">
          Meetup title
          <input
            id="meetup-title"
            type="text"
            value={meetupTitle}
            onChange={(e) => setMeetupTitle(e.target.value)}
            placeholder="Coffee, study session, match day..."
          />
        </label>

        <div className="friend-picker">
          {friends.length === 0 ? (
            <p className="friend-picker-empty">No friends yet. Add friends first, then come back to create a meetup.</p>
          ) : (
            friends.map((friend) => {
              const isSelected = selectedFriendIds.includes(friend.id);
              return (
                <button
                  key={friend.id}
                  type="button"
                  className={`friend-choice${isSelected ? " selected" : ""}`}
                  onClick={() => toggleMeetupFriend(friend.id)}
                >
                  <span>
                    <strong>{friend.username}</strong>
                    <small>{friend.email}</small>
                  </span>
                  <span className="friend-choice-status">{isSelected ? "Added" : "Add"}</span>
                </button>
              );
            })
          )}
        </div>

        <div className="meetup-actions">
          <button
            type="button"
            className="save-meetup-button"
            onClick={saveMeetup}
            disabled={savingMeetup || selectedFriendIds.length === 0}
          >
            {savingMeetup ? "Saving..." : "Save meetup"}
          </button>
          <button
            type="button"
            className="clear-meetup-button"
            onClick={() => setSelectedFriendIds([])}
            disabled={selectedFriendIds.length === 0}
          >
            Clear
          </button>
        </div>

        {meetupMessage && <p className="meetup-message">{meetupMessage}</p>}
      </div>

      <div className="map-wrapper">
        {position ? (
          <MapContainer center={position} zoom={15} scrollWheelZoom={true} className="map-container">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={position} icon={userIcon}>
              <Popup>You are here.</Popup>
            </Marker>
            <LocationUpdater position={position} />
          </MapContainer>
        ) : (
          <div className="map-loading">
            <p>{status}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MapPage;
