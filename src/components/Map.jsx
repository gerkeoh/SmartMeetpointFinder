import { useEffect, useRef } from "react";
import L from "leaflet";

const COLORS = [
  "#f97316",
  "#22c55e",
  "#3b82f6",
  "#eab308",
  "#a855f7",
  "#ef4444",
  "#14b8a6",
  "#ec4899",
];

function createUserIcon(name, color) {
  const shortName = name?.slice(0, 8) || "User";

  return L.divIcon({
    className: "custom-pin",
    html: `
      <div class="pin" style="background:${color}">
        <span class="pin-text">${shortName}</span>
      </div>
    `,
    iconSize: [58, 58],
    iconAnchor: [29, 58],
    popupAnchor: [0, -58],
  });
}

export default function Map({ myLocation, friendLocations, meetingPoint }) {
  const mapRef = useRef(null);
  const layersRef = useRef([]);

  useEffect(() => {
    if (mapRef.current) return;

    mapRef.current = L.map("map").setView([51.8985, -8.4756], 13);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    layersRef.current.forEach((layer) => layer.remove());
    layersRef.current = [];

    const bounds = [];
    const people = [];

    if (myLocation) {
      people.push({
        lat: myLocation.lat,
        lng: myLocation.lng,
        name: "You",
      });
    }

    friendLocations.forEach((friend) => {
      people.push({
        lat: friend.lat,
        lng: friend.lng,
        name: friend.name || friend.username || "Friend",
      });
    });

    people.forEach((person, index) => {
      const color = COLORS[index % COLORS.length];

      const marker = L.marker([person.lat, person.lng], {
        icon: createUserIcon(person.name, color),
      })
        .addTo(mapRef.current)
        .bindPopup(person.name);

      layersRef.current.push(marker);
      bounds.push([person.lat, person.lng]);
    });

    if (meetingPoint) {
      const radius = L.circleMarker([meetingPoint.lat, meetingPoint.lng], {
        radius: 30,
        className: "meeting-radius",
      })
        .addTo(mapRef.current)
        .bindPopup("Suggested meeting area");

      layersRef.current.push(radius);
      bounds.push([meetingPoint.lat, meetingPoint.lng]);
    }

    if (bounds.length > 0) {
      mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [myLocation, friendLocations, meetingPoint]);

  return <div id="map" className="map"></div>;
}