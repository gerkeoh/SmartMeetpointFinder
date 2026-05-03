import React, { useEffect, useMemo, useState } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { apiUrl } from "../api";
import "../styles/MapPage.css";

const defaultCenter = [53.3498, -6.2603];
const metersInKilometer = 1000;
const earthRadiusMeters = 6371000;

const markerIcon = new L.Icon({
  iconUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const meetingIcon = L.divIcon({
  className: "custom-pin",
  html: '<div class="pin meeting-pin"><span class="pin-text">Meet</span></div>',
  iconSize: [58, 58],
  iconAnchor: [29, 58],
});

const coffeeIcon = L.divIcon({
  className: "custom-pin",
  html: '<div class="pin coffee-pin"><span class="pin-text">Place</span></div>',
  iconSize: [48, 48],
  iconAnchor: [24, 48],
});

function MapBounds({ points }) {
  const map = useMap();

  useEffect(() => {
    const validPoints = points.filter(Boolean);
    if (validPoints.length === 0) return;

    if (validPoints.length === 1) {
      map.setView(validPoints[0], 15);
      return;
    }

    map.fitBounds(validPoints, { padding: [40, 40], maxZoom: 15 });
  }, [map, points]);

  return null;
}

const toRadians = (degrees) => (degrees * Math.PI) / 180;

const getDistanceMeters = (start, end) => {
  const latDelta = toRadians(end.lat - start.lat);
  const lngDelta = toRadians(end.lng - start.lng);
  const startLat = toRadians(start.lat);
  const endLat = toRadians(end.lat);

  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(lngDelta / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const formatDistance = (meters) => {
  if (meters < metersInKilometer) {
    return `${Math.round(meters)} m`;
  }

  return `${(meters / metersInKilometer).toFixed(1)} km`;
};

const formatPlaceType = (type) =>
  (type || "place")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const MapPage = () => {
  const token = localStorage.getItem("token");
  const [friends, setFriends] = useState([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState([]);
  const [meetupId, setMeetupId] = useState("");
  const [meetupIdInput, setMeetupIdInput] = useState("");
  const [myLocation, setMyLocation] = useState(null);
  const [friendLocations, setFriendLocations] = useState([]);
  const [meetingPoint, setMeetingPoint] = useState(null);
  const [coffeeShops, setCoffeeShops] = useState([]);
  const [status, setStatus] = useState("Start your meetup by loading your location.");
  const [title, setTitle] = useState("");
  const [participants, setParticipants] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [savingMeetup, setSavingMeetup] = useState(false);
  const [loadingCoffee, setLoadingCoffee] = useState(false);

  const authHeaders = useMemo(
    () =>
      token
        ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
        : { "Content-Type": "application/json" },
    [token]
  );

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
    setSelectedFriendIds((ids) => ids.filter((id) => friends.some((friend) => friend.id === id)));
  }, [friends]);

  const mapPoints = useMemo(
    () => [
      myLocation ? [myLocation.lat, myLocation.lng] : null,
      ...friendLocations.map((friend) => [friend.lat, friend.lng]),
      meetingPoint ? [meetingPoint.lat, meetingPoint.lng] : null,
      ...coffeeShops.map((shop) => [shop.lat, shop.lng]),
    ],
    [myLocation, friendLocations, meetingPoint, coffeeShops]
  );

  const travelLines = useMemo(() => {
    if (!meetingPoint) return [];

    const locations = [
      ...(myLocation ? [{ ...myLocation, id: "current-user", name: "You" }] : []),
      ...friendLocations,
    ];

    return locations.map((point) => ({
      ...point,
      distanceLabel: formatDistance(getDistanceMeters(point, meetingPoint)),
    }));
  }, [myLocation, friendLocations, meetingPoint]);

  const meetingDiameterLabel = useMemo(() => {
    if (!meetingPoint) return "";

    return formatDistance((meetingPoint.radiusMeters || 500) * 2);
  }, [meetingPoint]);

  const toggleFriend = (friendId) => {
    setSelectedFriendIds((prev) =>
      prev.includes(friendId) ? prev.filter((id) => id !== friendId) : [...prev, friendId]
    );
  };

  const getMyLocation = () => {
    if (!navigator.geolocation) {
      setStatus("Geolocation is not supported by your browser.");
      return;
    }

    setLoadingLocation(true);
    setStatus("Getting your location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setMyLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setStatus("Your location loaded.");
        setLoadingLocation(false);
      },
      (error) => {
        setStatus(
          error.code === error.PERMISSION_DENIED
            ? "Location permission denied. Please allow location access."
            : "Unable to retrieve your location."
        );
        setLoadingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const loadMeetup = async (id = meetupId) => {
    const lookupId = id.trim();
    if (!token || !lookupId) return [];

    try {
      const res = await fetch(apiUrl(`/api/meetups/${lookupId}`), { headers: authHeaders });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus(data.message || "Failed to load meetup.");
        return [];
      }

      const meetupParticipants = data.participants || [];
      const others = meetupParticipants
        .filter((participant) => participant.location && !participant.isCurrentUser)
        .map((participant) => ({
          id: participant.userId,
          name: participant.username || "Friend",
          lat: participant.location.lat,
          lng: participant.location.lng,
        }));
      const me = meetupParticipants.find((participant) => participant.isCurrentUser && participant.location);
      const loadedId = data.meetup?.id || lookupId;

      setMeetupId(loadedId);
      setMeetupIdInput(data.meetup?.meetupSaveId || loadedId);
      setParticipants(meetupParticipants);
      setFriendLocations(others);
      setMeetingPoint(data.suggestedMeetingPoint || null);
      setTitle(data.meetup?.title || title);
      setCoffeeShops([]);

      if (me?.location) {
        setMyLocation({ lat: me.location.lat, lng: me.location.lng });
      }

      setStatus("Meetup loaded.");
      return meetupParticipants;
    } catch (error) {
      setStatus("Could not load meetup.");
      return [];
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
      setSavingMeetup(true);
      setStatus("Creating meetup...");

      const createRes = await fetch(apiUrl("/api/meetups"), {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          title,
          invitedFriendIds: selectedFriendIds,
          friendIds: selectedFriendIds,
        }),
      });
      const createData = await createRes.json().catch(() => ({}));

      if (!createRes.ok) {
        setStatus(createData.message || "Failed to create meetup.");
        return;
      }

      const newMeetupId = createData.meetupId;
      setMeetupId(newMeetupId);
      setMeetupIdInput(createData.meetupSaveId || newMeetupId);

      const locationRes = await fetch(apiUrl(`/api/meetups/${newMeetupId}/location`), {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          lat: myLocation.lat,
          lng: myLocation.lng,
          source: "gps",
        }),
      });
      const locationData = await locationRes.json().catch(() => ({}));

      if (!locationRes.ok) {
        setStatus(locationData.message || "Meetup created, but location was not saved.");
        return;
      }

      setStatus("Meetup created. Your location has been saved.");
      await loadMeetup(newMeetupId);
    } catch (error) {
      setStatus("Something went wrong while creating the meetup.");
    } finally {
      setSavingMeetup(false);
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

      const meetupParticipants = await loadMeetup(meetupId);
      const locationsCount = meetupParticipants.filter((participant) => participant.location).length;

      if (locationsCount >= 2) {
        await calculateMeetup();
      } else {
        setStatus("Your meetup location has been saved.");
      }
    } catch (error) {
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
      setStatus("Something went wrong while calculating.");
    }
  };

  const findCoffeeShops = async () => {
    if (!meetingPoint) {
      setStatus("Calculate a meeting point first.");
      return;
    }

    try {
      setLoadingCoffee(true);
      setStatus("Finding places...");

      const radiusMeters = meetingPoint.radiusMeters || 1500;
      const res = await fetch(
        apiUrl(
          `/api/places?lat=${meetingPoint.lat}&lng=${meetingPoint.lng}&radiusMeters=${radiusMeters}`
        )
      );
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus(data.message || "Could not find places.");
        return;
      }

      const shops = data.places || data.shops || [];
      setCoffeeShops(shops);
      setStatus(
        shops.length
          ? `${shops.length} place${shops.length === 1 ? "" : "s"} loaded inside the ${meetingDiameterLabel} diameter.`
          : `No places found inside the ${meetingDiameterLabel} diameter.`
      );
    } catch (error) {
      setStatus("Could not reach the place search. Check that the backend is running.");
    } finally {
      setLoadingCoffee(false);
    }
  };

  return (
    <div className="map-page-container">
      <div className="meetup-card">
        <div className="meetup-card-header">
          <div>
            <h3>Create Meetup</h3>
            <p>Use your location, choose friends, then create a meetup.</p>
          </div>
          <span className="meetup-count">
            {selectedFriendIds.length} friend{selectedFriendIds.length === 1 ? "" : "s"} selected
          </span>
        </div>

        <div className="meetup-form-grid">
          <label className="meetup-title-field meetup-id-field" htmlFor="meetup-id">
            Meetup ID
            <span className="meetup-id-control">
              <input
                id="meetup-id"
                type="text"
                value={meetupIdInput}
                onChange={(e) => setMeetupIdInput(e.target.value)}
                placeholder="Paste meetup ID to open"
              />
              <button type="button" className="clear-meetup-button" onClick={() => loadMeetup(meetupIdInput)}>
                Open Meetup
              </button>
            </span>
          </label>
        </div>

        <div className="meetup-actions">
          <button type="button" className="save-meetup-button" onClick={getMyLocation} disabled={loadingLocation}>
            {loadingLocation ? "Locating..." : "Use My Location"}
          </button>
          <button type="button" className="save-meetup-button" onClick={createMeetup} disabled={savingMeetup}>
            {savingMeetup ? "Creating..." : "Create Meetup"}
          </button>
          <button type="button" className="save-meetup-button" onClick={shareMyLocationToMeetup}>
            Share Location
          </button>
          <button type="button" className="clear-meetup-button" onClick={() => loadMeetup(meetupId)} disabled={!meetupId}>
            Refresh
          </button>
          <button type="button" className="clear-meetup-button" onClick={findCoffeeShops} disabled={!meetingPoint || loadingCoffee}>
            {loadingCoffee ? "Finding..." : "Find Places"}
          </button>
        </div>

        <div className="meetup-details-grid">
          <div className="friend-picker-panel">
            <button
              type="button"
              className="friend-dropdown-header"
              onClick={() => setDropdownOpen((open) => !open)}
            >
              {selectedFriendIds.length > 0
                ? `${selectedFriendIds.length} friend${selectedFriendIds.length > 1 ? "s" : ""} selected`
                : "Select friends"}
            </button>

            {friends.length === 0 ? (
              <p className="friend-picker-empty">No friends available.</p>
            ) : (
              dropdownOpen && (
                <div className="friend-dropdown-list">
                  {friends.map((friend) => (
                    <label key={friend.id} className="friend-option">
                      <input
                        type="checkbox"
                        checked={selectedFriendIds.includes(friend.id)}
                        onChange={() => toggleFriend(friend.id)}
                      />
                      <span>{friend.username}</span>
                    </label>
                  ))}
                </div>
              )
            )}
          </div>

          <div className="participants-panel">
            <h3>Meetup Participants</h3>
            {participants.length === 0 ? (
              <p>No meetup loaded.</p>
            ) : (
              participants.map((participant) => (
                <div key={participant.userId} className="participant-row">
                  <strong>
                    {participant.isCurrentUser
                      ? `${participant.username || "You"} (You)`
                      : participant.username || "Friend"}
                  </strong>
                  <span>
                    {participant.location
                      ? `${participant.location.lat.toFixed(5)}, ${participant.location.lng.toFixed(5)}`
                      : "No location shared yet"}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="places-panel">
            <div className="places-panel-header">
              <h3>Places In Meet Radius</h3>
              <span>{coffeeShops.length}</span>
            </div>
            {coffeeShops.length === 0 ? (
              <p>No places loaded.</p>
            ) : (
              <div className="places-list">
                {coffeeShops.map((shop) => (
                  <div key={shop.id} className="place-row">
                    <span>
                      <strong>{shop.name}</strong>
                      <small>{formatPlaceType(shop.type)}</small>
                    </span>
                    {typeof shop.distanceMeters === "number" && (
                      <b>{formatDistance(shop.distanceMeters)}</b>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <p className="meetup-status-message">{status}</p>
      </div>

      <div className="map-wrapper">
        <MapContainer
          center={myLocation ? [myLocation.lat, myLocation.lng] : defaultCenter}
          zoom={myLocation ? 15 : 12}
          scrollWheelZoom
          className="map-container"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapBounds points={mapPoints} />

          {myLocation && (
            <Marker position={[myLocation.lat, myLocation.lng]} icon={markerIcon}>
              <Popup>You are here.</Popup>
            </Marker>
          )}

          {friendLocations.map((friend) => (
            <Marker key={friend.id} position={[friend.lat, friend.lng]} icon={markerIcon}>
              <Popup>{friend.name}</Popup>
            </Marker>
          ))}

          {meetingPoint && (
            <>
              <Marker position={[meetingPoint.lat, meetingPoint.lng]} icon={meetingIcon}>
                <Popup>Suggested meeting point</Popup>
              </Marker>
              <Circle
                center={[meetingPoint.lat, meetingPoint.lng]}
                radius={meetingPoint.radiusMeters || 500}
                pathOptions={{ className: "meeting-radius" }}
              >
                <Tooltip className="line-tooltip" permanent>
                  Diameter: {meetingDiameterLabel}
                </Tooltip>
              </Circle>
            </>
          )}

          {travelLines.map((point) => (
            <Polyline
              key={`${point.id}-${point.lat}-${point.lng}`}
              positions={[
                [point.lat, point.lng],
                [meetingPoint.lat, meetingPoint.lng],
              ]}
              pathOptions={{ color: "#f97316", weight: 3, opacity: 0.75 }}
            >
              <Tooltip className="line-tooltip" permanent>
                {point.name}: {point.distanceLabel}
              </Tooltip>
            </Polyline>
          ))}

          {coffeeShops.map((shop) => (
            <Marker key={shop.id} position={[shop.lat, shop.lng]} icon={coffeeIcon}>
              <Popup>
                {shop.name}
                {typeof shop.distanceMeters === "number" && (
                  <>
                    <br />
                    {formatDistance(shop.distanceMeters)} from meeting point
                  </>
                )}
                <br />
                {formatPlaceType(shop.type)}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
};

export default MapPage;
