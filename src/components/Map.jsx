import { useEffect, useRef } from "react";
import L from "leaflet";

export default function Map({ myLocation, friendLocations, meetingPoint }) {
  const mapRef = useRef(null);
  const markersRef = useRef([]);

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

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    const bounds = [];

    if (myLocation) {
      const myMarker = L.marker([myLocation.lat, myLocation.lng])
        .addTo(mapRef.current)
        .bindPopup("You");
      markersRef.current.push(myMarker);
      bounds.push([myLocation.lat, myLocation.lng]);
    }

    friendLocations.forEach((friend) => {
      const friendMarker = L.marker([friend.lat, friend.lng])
        .addTo(mapRef.current)
        .bindPopup(friend.name || "Friend");
      markersRef.current.push(friendMarker);
      bounds.push([friend.lat, friend.lng]);
    });

    if (meetingPoint) {
      const meetupMarker = L.marker([meetingPoint.lat, meetingPoint.lng])
        .addTo(mapRef.current)
        .bindPopup("Suggested Meeting Point");
      markersRef.current.push(meetupMarker);
      bounds.push([meetingPoint.lat, meetingPoint.lng]);
    }

    if (bounds.length > 0) {
      mapRef.current.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [myLocation, friendLocations, meetingPoint]);

  return <div id="map" className="map"></div>;
}