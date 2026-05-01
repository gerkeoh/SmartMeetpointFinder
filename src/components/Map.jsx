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

function kmToLat(km) {
  return km / 111;
}

function kmToLng(km, lat) {
  return km / (111 * Math.cos((lat * Math.PI) / 180));
}

function distanceToBoundary(distanceKm, radiusKm) {
  return Math.abs(distanceKm - radiusKm);
}

function formatDistance(km) {
  return `${km.toFixed(2)} km`;
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
      const radiusMeters = meetingPoint.radiusMeters || 300;
      const radiusKm = radiusMeters / 1000;

      const meetingCircle = L.circle([meetingPoint.lat, meetingPoint.lng], {
        radius: radiusMeters,
        className: "meeting-radius",
      })
        .addTo(mapRef.current)
        .bindPopup("Suggested meeting area");

      layersRef.current.push(meetingCircle);
      bounds.push([meetingPoint.lat, meetingPoint.lng]);

      const diameterPoints = [
        [meetingPoint.lat, meetingPoint.lng - kmToLng(radiusKm, meetingPoint.lat)],
        [meetingPoint.lat, meetingPoint.lng + kmToLng(radiusKm, meetingPoint.lat)],
      ];

      const diameterLine = L.polyline(diameterPoints, {
        color: "#f97316",
        weight: 3,
        dashArray: "8 6",
        opacity: 0.9,
      })
        .addTo(mapRef.current)
        .bindTooltip(`Diameter: ${formatDistance(radiusKm * 2)}`, {
          permanent: true,
          direction: "center",
          className: "diameter-tooltip",
        });

      layersRef.current.push(diameterLine);

      const participants = people.map((person) => ({
        ...person,
        distanceKm: L.latLng(person.lat, person.lng).distanceTo(
          L.latLng(meetingPoint.lat, meetingPoint.lng)
        ) / 1000,
      }));

      participants.forEach((person, index) => {
        const distanceKm = person.distanceKm;
        const boundaryPoint =
          distanceKm === 0
            ? [meetingPoint.lat, meetingPoint.lng + kmToLng(radiusKm, meetingPoint.lat)]
            : [
                meetingPoint.lat +
                  ((person.lat - meetingPoint.lat) * radiusKm) / distanceKm,
                meetingPoint.lng +
                  ((person.lng - meetingPoint.lng) * radiusKm) / distanceKm,
              ];

        const line = L.polyline([
          [person.lat, person.lng],
          boundaryPoint,
        ], {
          color: "#14b8a6",
          weight: 2,
          opacity: 0.8,
        })
          .addTo(mapRef.current)
          .bindTooltip(
            `${person.name}: ${formatDistance(distanceToBoundary(distanceKm, radiusKm))}`,
            {
              permanent: true,
              direction: "center",
              className: "line-tooltip",
            }
          );

        layersRef.current.push(line);
      });
    }

    if (bounds.length > 0) {
      mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [myLocation, friendLocations, meetingPoint]);

  return <div id="map" className="map"></div>;
}