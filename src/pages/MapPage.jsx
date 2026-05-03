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

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const createUserIcon = (name, variant = "friend") =>
  L.divIcon({
    className: "custom-user-marker",
    html: `
      <div class="user-marker ${variant === "me" ? "user-marker-me" : "user-marker-friend"}">
        <span class="user-marker-dot">${escapeHtml(name).slice(0, 1).toUpperCase() || "U"}</span>
        <span class="user-marker-label">${escapeHtml(name || "User")}</span>
      </div>
    `,
    iconSize: [128, 48],
    iconAnchor: [18, 42],
    popupAnchor: [0, -40],
  });

const meetingIcon = L.divIcon({
  className: "custom-pin",
  html: '<div class="pin meeting-pin"><span class="pin-text">Meet</span></div>',
  iconSize: [58, 58],
  iconAnchor: [29, 58],
});

const placeTypeOptions = [
  { value: "all", label: "All places" },
  { value: "coffee", label: "Coffee shops" },
  { value: "restaurant", label: "Restaurants" },
  { value: "pub", label: "Pubs" },
  { value: "bar", label: "Bars" },
  { value: "fast_food", label: "Fast food" },
];

const travelModeOptions = [
  { value: "driving", label: "Driving" },
  { value: "walking", label: "Walking" },
  { value: "cycling", label: "Cycling" },
];

const placePinLabels = {
  coffee: "Cafe",
  cafe: "Cafe",
  restaurant: "Food",
  pub: "Pub",
  bar: "Bar",
  fast_food: "Fast",
};

const getPlacePinType = (type) => {
  if (type === "cafe") return "coffee";
  if (placePinLabels[type]) return type;
  return "place";
};

const createPlaceIcon = (type) => {
  const pinType = getPlacePinType(type);

  return L.divIcon({
    className: "custom-pin",
    html: `<div class="pin place-pin place-pin-${pinType}"><span class="pin-text">${
      placePinLabels[pinType] || "Place"
    }</span></div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 48],
  });
};

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

const formatDuration = (minutes) => {
  if (minutes < 60) return `${Math.round(minutes)} min`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  return `${hours} hr${remainingMinutes ? ` ${remainingMinutes} min` : ""}`;
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
  const [previousMeetups, setPreviousMeetups] = useState([]);
  const [myLocation, setMyLocation] = useState(null);
  const [friendLocations, setFriendLocations] = useState([]);
  const [meetingPoint, setMeetingPoint] = useState(null);
  const [calculatedMeetingPoint, setCalculatedMeetingPoint] = useState(null);
  const [placeSearchRadiusMeters, setPlaceSearchRadiusMeters] = useState(null);
  const [selectedPlaceType, setSelectedPlaceType] = useState("all");
  const [travelMode, setTravelMode] = useState("driving");
  const [coffeeShops, setCoffeeShops] = useState([]);
  const [status, setStatus] = useState("Start your meetup by loading your location.");
  const [title, setTitle] = useState("");
  const [participants, setParticipants] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [activeChatUser, setActiveChatUser] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [previousMeetupsOpen, setPreviousMeetupsOpen] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [savingMeetup, setSavingMeetup] = useState(false);
  const [loadingCoffee, setLoadingCoffee] = useState(false);
  const [acceptingInvitationId, setAcceptingInvitationId] = useState("");
  const [rejectingInvitationId, setRejectingInvitationId] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [loadingPreviousMeetups, setLoadingPreviousMeetups] = useState(false);
  const [previewingPlaceId, setPreviewingPlaceId] = useState("");

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

  const loadInvitations = async () => {
    if (!token) {
      setInvitations([]);
      return;
    }

    try {
      const res = await fetch(apiUrl("/api/meetup-invitations"), { headers: authHeaders });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus(data.message || "Failed to load invitations.");
        return;
      }

      setInvitations(data.invitations || []);
    } catch (error) {
      setStatus("Could not load invitations.");
    }
  };

  const loadPreviousMeetups = async () => {
    if (!token) {
      setPreviousMeetups([]);
      return;
    }

    try {
      setLoadingPreviousMeetups(true);
      const res = await fetch(apiUrl("/api/meetups"), { headers: authHeaders });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus(data.message || "Failed to load previous meetups.");
        return;
      }

      setPreviousMeetups(data.meetups || []);
    } catch (error) {
      setStatus("Could not load previous meetups.");
    } finally {
      setLoadingPreviousMeetups(false);
    }
  };

  useEffect(() => {
    loadInvitations();
    loadPreviousMeetups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const participantLookup = new Map(
      participants.map((participant) => [
        participant.userId,
        {
          id: participant.userId,
          name: participant.isCurrentUser ? "You" : participant.username || "Friend",
          lat: participant.location?.lat,
          lng: participant.location?.lng,
        },
      ])
    );

    if (Array.isArray(meetingPoint.participantRoutes) && meetingPoint.participantRoutes.length) {
      return meetingPoint.participantRoutes
        .map((route) => {
          const participant = participantLookup.get(route.userId);
          if (!participant) return null;

          return {
            ...participant,
            positions:
              Array.isArray(route.coordinates) && route.coordinates.length > 1
                ? route.coordinates
                : [
                    [participant.lat, participant.lng],
                    [meetingPoint.lat, meetingPoint.lng],
                  ],
            distanceLabel: formatDistance((route.distanceKm || 0) * metersInKilometer),
            durationLabel:
              typeof route.durationMinutes === "number" ? formatDuration(route.durationMinutes) : "",
          };
        })
        .filter(Boolean);
    }

    const locations = [
      ...(myLocation ? [{ ...myLocation, id: "current-user", name: "You" }] : []),
      ...friendLocations,
    ];

    return locations.map((point) => ({
      ...point,
      positions: [
        [point.lat, point.lng],
        [meetingPoint.lat, meetingPoint.lng],
      ],
      distanceLabel: formatDistance(getDistanceMeters(point, meetingPoint)),
      durationLabel: "",
    }));
  }, [myLocation, friendLocations, meetingPoint, participants]);

  const meetingDiameterLabel = useMemo(() => {
    if (!meetingPoint) return "";

    return formatDistance((placeSearchRadiusMeters || meetingPoint.radiusMeters || 500) * 2);
  }, [meetingPoint, placeSearchRadiusMeters]);

  const displayedMeetingRadiusMeters = placeSearchRadiusMeters || meetingPoint?.radiusMeters || 500;
  const currentUserName =
    participants.find((participant) => participant.isCurrentUser)?.username || "You";
  const routeSummary = useMemo(() => {
    if (!meetingPoint) return null;

    const routes = Array.isArray(meetingPoint.participantRoutes) ? meetingPoint.participantRoutes : [];
    const durations = routes
      .map((route) => route.durationMinutes)
      .filter((duration) => typeof duration === "number");
    const distances = routes
      .map((route) => route.distanceKm)
      .filter((distance) => typeof distance === "number");
    const modeLabel =
      travelModeOptions.find((option) => option.value === meetingPoint.transportMode)?.label ||
      travelModeOptions.find((option) => option.value === travelMode)?.label ||
      "Route";
    const timeGap =
      durations.length > 1 ? Math.max(...durations) - Math.min(...durations) : null;
    const totalDistanceKm = distances.reduce((sum, distance) => sum + distance, 0);

    return {
      title: meetingPoint.selectedPlace?.name || "Calculated meetpoint",
      modeLabel,
      routeCount: routes.length,
      timeGapLabel: typeof timeGap === "number" ? formatDuration(timeGap) : "Not available",
      totalDistanceLabel: distances.length ? formatDistance(totalDistanceKm * metersInKilometer) : "Not available",
      isPlacePreview: Boolean(meetingPoint.selectedPlace),
    };
  }, [meetingPoint, travelMode]);

  const chatContacts = useMemo(() => {
    const contacts = new Map();

    participants
      .filter((participant) => !participant.isCurrentUser)
      .forEach((participant) => {
        contacts.set(participant.userId, {
          id: participant.userId,
          name: participant.username || "Friend",
        });
      });

    selectedFriendIds.forEach((friendId) => {
      const friend = friends.find((friendItem) => friendItem.id === friendId);
      if (friend) {
        contacts.set(friend.id, { id: friend.id, name: friend.username || "Friend" });
      }
    });

    return Array.from(contacts.values());
  }, [friends, participants, selectedFriendIds]);

  const hasDirectChat = Boolean(activeChatUser);

  const toggleFriend = (friendId) => {
    const friend = friends.find((friendItem) => friendItem.id === friendId);

    setSelectedFriendIds((prev) => {
      if (prev.includes(friendId)) return prev.filter((id) => id !== friendId);
      if (friend) setActiveChatUser({ id: friend.id, name: friend.username || "Friend" });
      return [...prev, friendId];
    });
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
      const firstChatParticipant = meetupParticipants.find((participant) => !participant.isCurrentUser);
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
      setParticipants(meetupParticipants);
      setFriendLocations(others);
      setMeetingPoint(data.suggestedMeetingPoint || null);
      setCalculatedMeetingPoint(data.suggestedMeetingPoint || null);
      setPlaceSearchRadiusMeters(data.suggestedMeetingPoint?.radiusMeters || null);
      setTitle(data.meetup?.title || title);
      setCoffeeShops([]);
      setActiveChatUser(
        firstChatParticipant
          ? {
              id: firstChatParticipant.userId,
              name: firstChatParticipant.username || "Friend",
            }
          : activeChatUser
      );

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

  const loadMessages = async (contactId = activeChatUser?.id) => {
    if (!token || !contactId) {
      setMessages([]);
      return;
    }

    try {
      const res = await fetch(apiUrl(`/api/direct-messages/${contactId}`), { headers: authHeaders });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) return;
      setMessages(data.messages || []);
    } catch (error) {
      // Chat refresh should stay quiet so it does not interrupt map actions.
    }
  };

  useEffect(() => {
    if (!hasDirectChat) {
      setMessages([]);
      return undefined;
    }

    loadMessages(activeChatUser.id);
    const intervalId = window.setInterval(() => loadMessages(activeChatUser.id), 5000);

    return () => window.clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDirectChat, activeChatUser?.id, authHeaders]);

  const acceptInvitation = async (invitationId) => {
    if (!token) {
      setStatus("Please log in first.");
      return;
    }

    try {
      setAcceptingInvitationId(invitationId);
      setStatus("Accepting invitation...");

      const res = await fetch(apiUrl(`/api/meetup-invitations/${invitationId}/accept`), {
        method: "POST",
        headers: authHeaders,
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus(data.message || "Could not accept invitation.");
        return;
      }

      setMeetupId(data.meetupId);
      await loadInvitations();
      await loadMeetup(data.meetupId);
      await loadPreviousMeetups();
      setStatus("Invitation accepted. Direct chat is open.");
    } catch (error) {
      setStatus("Something went wrong while accepting the invitation.");
    } finally {
      setAcceptingInvitationId("");
    }
  };

  const rejectInvitation = async (invitationId) => {
    if (!token) {
      setStatus("Please log in first.");
      return;
    }

    try {
      setRejectingInvitationId(invitationId);
      setStatus("Rejecting invitation...");

      const res = await fetch(apiUrl(`/api/meetup-invitations/${invitationId}/reject`), {
        method: "POST",
        headers: authHeaders,
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus(data.message || "Could not reject invitation.");
        return;
      }

      await loadInvitations();
      await loadPreviousMeetups();
      setStatus("Invitation rejected.");
    } catch (error) {
      setStatus("Something went wrong while rejecting the invitation.");
    } finally {
      setRejectingInvitationId("");
    }
  };

  const sendMessage = async (event) => {
    event.preventDefault();

    const text = messageText.trim();
    if (!text || !activeChatUser) return;

    try {
      setSendingMessage(true);
      const res = await fetch(apiUrl(`/api/direct-messages/${activeChatUser.id}`), {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus(data.message || "Could not send message.");
        return;
      }

      setMessages((currentMessages) => [...currentMessages, data.message]);
      setMessageText("");
    } catch (error) {
      setStatus("Could not send message.");
    } finally {
      setSendingMessage(false);
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

      setStatus("Meetup created. Invitations have been sent.");
      await loadMeetup(newMeetupId);
      await loadPreviousMeetups();
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
        body: JSON.stringify({
          transportMode: travelMode,
          trafficMode: "current",
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus(data.message || "Failed to calculate meeting point.");
        return;
      }

      setMeetingPoint(data.meetingPoint || null);
      setCalculatedMeetingPoint(data.meetingPoint || null);
      setPlaceSearchRadiusMeters(data.meetingPoint?.radiusMeters || null);
      setPreviewingPlaceId("");
      await loadMeetup(meetupId);
      const modeLabel = travelModeOptions.find((option) => option.value === travelMode)?.label || "route";
      const routeSource = data.meetingPoint?.routeSource || "";
      setStatus(
        travelMode === "driving" && !routeSource.includes("tomtom")
          ? `Meeting point calculated for ${modeLabel.toLowerCase()} routes. Add TOMTOM_API_KEY for live traffic.`
          : `Meeting point calculated for ${modeLabel.toLowerCase()} routes.`
      );
    } catch (error) {
      setStatus("Something went wrong while calculating.");
    }
  };

  const findCoffeeShops = async (options = {}) => {
    const grow = options.grow === true;
    const autoExpand = options.autoExpand !== false;

    if (!meetingPoint) {
      setStatus("Calculate a meeting point first.");
      return;
    }

    try {
      setLoadingCoffee(true);
      setStatus(grow ? "Growing radius and finding places..." : "Finding places...");

      const baseRadiusMeters = placeSearchRadiusMeters || meetingPoint.radiusMeters || 1500;
      const radiusMeters = grow ? Math.min(baseRadiusMeters * 2, 10000) : baseRadiusMeters;
      const res = await fetch(
        apiUrl(
          `/api/places?lat=${meetingPoint.lat}&lng=${meetingPoint.lng}&radiusMeters=${radiusMeters}&expand=${autoExpand}&type=${selectedPlaceType}`
        )
      );
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus(data.message || "Could not find places.");
        return;
      }

      const shops = data.places || data.shops || [];
      const usedRadiusMeters = data.radiusMeters || radiusMeters;
      setPlaceSearchRadiusMeters(usedRadiusMeters);
      setCoffeeShops(shops);
      const selectedPlaceOption = placeTypeOptions.find((option) => option.value === selectedPlaceType);
      const placeTypeLabel =
        selectedPlaceType === "all" ? "places" : selectedPlaceOption?.label.toLowerCase() || "places";
      setStatus(
        shops.length
          ? `${shops.length} ${placeTypeLabel} loaded inside the ${formatDistance(
              usedRadiusMeters * 2
            )} diameter${data.expanded ? " after expanding the radius" : ""}.`
          : `No ${placeTypeLabel} found inside the ${formatDistance(usedRadiusMeters * 2)} diameter.`
      );
    } catch (error) {
      setStatus("Could not reach the place search. Check that the backend is running.");
    } finally {
      setLoadingCoffee(false);
    }
  };

  const previewPlaceAsMeetpoint = async (shop) => {
    if (!token) {
      setStatus("Please log in first.");
      return;
    }

    if (!meetupId || !meetingPoint) {
      setStatus("Calculate a meeting point before previewing a place.");
      return;
    }

    try {
      setPreviewingPlaceId(shop.id);
      setStatus(`Checking travel times to ${shop.name}...`);

      const res = await fetch(apiUrl(`/api/meetups/${meetupId}/preview-point`), {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          lat: shop.lat,
          lng: shop.lng,
          place: {
            id: shop.id,
            name: shop.name,
            type: shop.type,
          },
          transportMode: travelMode,
          trafficMode: "current",
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus(data.message || "Could not preview this place.");
        return;
      }

      setCalculatedMeetingPoint((currentCalculatedPoint) => currentCalculatedPoint || meetingPoint);
      setMeetingPoint({
        ...data.meetingPoint,
        radiusMeters: placeSearchRadiusMeters || meetingPoint.radiusMeters,
        radiusKm: (placeSearchRadiusMeters || meetingPoint.radiusMeters || 0) / metersInKilometer,
      });
      setStatus(`${shop.name} is previewed as the meetup point. Use Undo to return.`);
    } catch (error) {
      setStatus("Could not calculate travel times to that place.");
    } finally {
      setPreviewingPlaceId("");
    }
  };

  const undoPlacePreview = () => {
    if (!calculatedMeetingPoint) return;

    setMeetingPoint(calculatedMeetingPoint);
    setPlaceSearchRadiusMeters(calculatedMeetingPoint.radiusMeters || placeSearchRadiusMeters);
    setStatus("Returned to the calculated meeting point.");
  };

  return (
    <div className="map-page-container">
      <div className="map-page-layout">
        <div className="map-side-panel">
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
          <label className="meetup-title-field" htmlFor="meetup-title">
            Meetup Title
            <span className="meetup-title-control">
              <input
                id="meetup-title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Friday coffee, study meetup, lunch plan..."
                maxLength={80}
              />
              <button type="button" className="save-meetup-button" onClick={createMeetup} disabled={savingMeetup}>
                {savingMeetup ? "Creating..." : "Create Meetup"}
              </button>
            </span>
          </label>
        </div>

        <div className="place-search-controls">
          <label htmlFor="travel-mode">
            Route by
            <select
              id="travel-mode"
              value={travelMode}
              onChange={(event) => {
                setTravelMode(event.target.value);
                setMeetingPoint(null);
                setCalculatedMeetingPoint(null);
                setPlaceSearchRadiusMeters(null);
                setCoffeeShops([]);
              }}
            >
              {travelModeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="place-search-field">
            <label htmlFor="place-type">
              Search for
              <span className="place-search-control">
                <select
                  id="place-type"
                  value={selectedPlaceType}
                  onChange={(event) => {
                    setSelectedPlaceType(event.target.value);
                    setCoffeeShops([]);
                    setPlaceSearchRadiusMeters(meetingPoint?.radiusMeters || null);
                  }}
                >
                  {placeTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="clear-meetup-button inline-find-button"
                  onClick={findCoffeeShops}
                  disabled={!meetingPoint || loadingCoffee}
                >
                  {loadingCoffee ? "Finding..." : "Find Places"}
                </button>
              </span>
            </label>
          </div>
        </div>

        <div className="meetup-actions">
          <button type="button" className="save-meetup-button" onClick={getMyLocation} disabled={loadingLocation}>
            {loadingLocation ? "Locating..." : "Use My Location"}
          </button>
          <button type="button" className="save-meetup-button" onClick={shareMyLocationToMeetup}>
            Share Location
          </button>
          <button type="button" className="clear-meetup-button" onClick={() => loadMeetup(meetupId)} disabled={!meetupId}>
            Refresh
          </button>
        </div>

        {routeSummary && (
          <div className="route-summary-card">
            <div>
              <span>{routeSummary.isPlacePreview ? "Previewing place" : "Route summary"}</span>
              <strong>{routeSummary.title}</strong>
            </div>
            <dl>
              <span>
                <dt>Mode</dt>
                <dd>{routeSummary.modeLabel}</dd>
              </span>
              <span>
                <dt>Time gap</dt>
                <dd>{routeSummary.timeGapLabel}</dd>
              </span>
              <span>
                <dt>Total distance</dt>
                <dd>{routeSummary.totalDistanceLabel}</dd>
              </span>
            </dl>
          </div>
        )}

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
                  <button
                    key={shop.id}
                    type="button"
                    className="place-row"
                    onClick={() => previewPlaceAsMeetpoint(shop)}
                    disabled={previewingPlaceId === shop.id}
                  >
                    <span>
                      <strong>{shop.name}</strong>
                      <small>{formatPlaceType(shop.type)}</small>
                    </span>
                    {typeof shop.distanceMeters === "number" && (
                      <b>{previewingPlaceId === shop.id ? "Checking..." : formatDistance(shop.distanceMeters)}</b>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="invitations-panel">
            <div className="places-panel-header">
              <h3>Meetup Invitations</h3>
              <span>{invitations.length}</span>
            </div>
            {invitations.length === 0 ? (
              <p>No pending invitations.</p>
            ) : (
              <div className="invitation-list">
                {invitations.map((invitation) => (
                  <div key={invitation.id} className="invitation-row">
                    <span>
                      <strong>{invitation.title}</strong>
                      <small>From {invitation.fromUsername}</small>
                    </span>
                    <span className="invitation-actions">
                      <button
                        type="button"
                        className="save-meetup-button compact-action-button"
                        onClick={() => acceptInvitation(invitation.id)}
                        disabled={acceptingInvitationId === invitation.id || rejectingInvitationId === invitation.id}
                      >
                        {acceptingInvitationId === invitation.id ? "Accepting..." : "Accept"}
                      </button>
                      <button
                        type="button"
                        className="clear-meetup-button compact-action-button"
                        onClick={() => rejectInvitation(invitation.id)}
                        disabled={acceptingInvitationId === invitation.id || rejectingInvitationId === invitation.id}
                      >
                        {rejectingInvitationId === invitation.id ? "Rejecting..." : "Reject"}
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {hasDirectChat && (
          <div className="chat-panel">
            <div className="chat-panel-header">
              <h3>Direct Chat</h3>
              <span>
                {activeChatUser.name}
              </span>
            </div>
            {chatContacts.length > 1 && (
              <div className="chat-contact-list">
                {chatContacts.map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    className={`chat-contact-button${activeChatUser.id === contact.id ? " active" : ""}`}
                    onClick={() => setActiveChatUser(contact)}
                  >
                    {contact.name}
                  </button>
                ))}
              </div>
            )}
            <div className="message-list">
              {messages.length === 0 ? (
                <p>No messages yet.</p>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`message-row${message.isCurrentUser ? " own-message" : ""}`}
                  >
                    <strong>{message.senderUsername}</strong>
                    <span>{message.text}</span>
                  </div>
                ))
              )}
            </div>
            <form className="message-form" onSubmit={sendMessage}>
              <input
                type="text"
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                placeholder={`Message ${activeChatUser.name}`}
                maxLength={500}
              />
              <button type="submit" className="save-meetup-button" disabled={sendingMessage || !messageText.trim()}>
                {sendingMessage ? "Sending..." : "Send"}
              </button>
            </form>
          </div>
        )}

        <p className="meetup-status-message">{status}</p>
      </div>

        <div className="previous-meetups-panel">
          <div className="previous-meetups-header">
            <button
              type="button"
              className="previous-meetups-toggle"
              onClick={() => setPreviousMeetupsOpen((open) => !open)}
            >
              <span>
                <strong>Previous Meetups</strong>
                <small>
                  {previousMeetups.length} meetup{previousMeetups.length === 1 ? "" : "s"}
                </small>
              </span>
              <b>{previousMeetupsOpen ? "Hide" : "Show"}</b>
            </button>
            <button
              type="button"
              className="clear-meetup-button compact-action-button"
              onClick={loadPreviousMeetups}
              disabled={loadingPreviousMeetups}
            >
              {loadingPreviousMeetups ? "Loading..." : "Refresh"}
            </button>
          </div>

          {previousMeetupsOpen &&
            (previousMeetups.length === 0 ? (
              <p>No previous meetups yet.</p>
            ) : (
              <div className="previous-meetups-list">
                {previousMeetups.map((meetup) => (
                  <button
                    key={meetup.id}
                    type="button"
                    className={`previous-meetup-row${meetupId === meetup.id ? " active" : ""}`}
                    onClick={() => loadMeetup(meetup.id)}
                  >
                    <span>
                      <strong>{meetup.title || "Untitled meetup"}</strong>
                      <small>{meetup.status?.replace(/_/g, " ") || "created"}</small>
                    </span>
                    <b>{meetup.participantIds?.length || 0}</b>
                  </button>
                ))}
              </div>
            ))}
        </div>
      </div>

      <div className="map-column">
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
            <Marker position={[myLocation.lat, myLocation.lng]} icon={createUserIcon(currentUserName, "me")}>
              <Popup>{currentUserName} is here.</Popup>
            </Marker>
          )}

          {friendLocations.map((friend) => (
            <Marker key={friend.id} position={[friend.lat, friend.lng]} icon={createUserIcon(friend.name)}>
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
                radius={displayedMeetingRadiusMeters}
                pathOptions={{ className: "meeting-radius" }}
              >
                <Tooltip className="line-tooltip" permanent>
                  Diameter: {meetingDiameterLabel}
                </Tooltip>
                <Popup>
                  <div className="map-popup-actions">
                    <strong>Meet radius</strong>
                    <span>Diameter: {meetingDiameterLabel}</span>
                    <button
                      type="button"
                      className="map-popup-button"
                      onClick={() => findCoffeeShops({ grow: true, autoExpand: false })}
                      disabled={!meetingPoint || loadingCoffee}
                    >
                      {loadingCoffee ? "Growing..." : "Grow Radius"}
                    </button>
                  </div>
                </Popup>
              </Circle>
            </>
          )}

          {travelLines.map((point) => (
            <Polyline
              key={`${point.id}-${point.lat}-${point.lng}`}
              positions={point.positions}
              pathOptions={{ color: "#f97316", weight: 3, opacity: 0.75 }}
            >
              <Tooltip className="line-tooltip" permanent>
                {point.name}: {point.durationLabel ? `${point.durationLabel}, ` : ""}
                {point.distanceLabel}
              </Tooltip>
            </Polyline>
          ))}

          {coffeeShops.map((shop) => (
            <Marker
              key={shop.id}
              position={[shop.lat, shop.lng]}
              icon={createPlaceIcon(shop.type)}
              eventHandlers={{ click: () => previewPlaceAsMeetpoint(shop) }}
            >
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
                <br />
                {meetingPoint?.selectedPlace?.id === shop.id ? (
                  <button type="button" className="map-popup-button" onClick={undoPlacePreview}>
                    Undo Place
                  </button>
                ) : (
                  "Click pin to preview as meetup point"
                )}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      </div>
      </div>
    </div>
  );
};

export default MapPage;
