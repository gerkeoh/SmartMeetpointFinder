import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { apiUrl } from "../api";

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

function formatDistance(km) {
  return `${km.toFixed(2)} km`;
}

function latLngDistanceKm(a, b) {
  return L.latLng(a.lat, a.lng).distanceTo(L.latLng(b.lat, b.lng)) / 1000;
}

function midpoint(a, b) {
  return {
    lat: (a.lat + b.lat) / 2,
    lng: (a.lng + b.lng) / 2,
  };
}

function projectedMidpoint(map, a, b) {
  const pointA = map.latLngToLayerPoint([a.lat, a.lng]);
  const pointB = map.latLngToLayerPoint([b.lat, b.lng]);
  const midpointPoint = {
    x: (pointA.x + pointB.x) / 2,
    y: (pointA.y + pointB.y) / 2,
  };
  return map.layerPointToLatLng(midpointPoint);
}

function findFarthestParticipantPair(people) {
  let best = { a: people[0], b: people[1], distanceKm: 0 };

  for (let i = 0; i < people.length; i += 1) {
    for (let j = i + 1; j < people.length; j += 1) {
      const p1 = people[i];
      const p2 = people[j];
      const distanceKm = latLngDistanceKm(p1, p2);
      if (distanceKm > best.distanceKm) {
        best = { a: p1, b: p2, distanceKm };
      }
    }
  }

  return best;
}

export default function Map({ myLocation, friendLocations, meetingPoint }) {
  const mapRef = useRef(null);
  const layersRef = useRef([]);
  const [coffeeShops, setCoffeeShops] = useState([]);

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
    if (!meetingPoint?.lat || !meetingPoint?.lng || !meetingPoint?.radiusMeters) {
      setCoffeeShops([]);
      return;
    }

    const abortController = new AbortController();

    async function loadCoffeeShops() {
      try {
        const response = await fetch(
          apiUrl(
            `/api/coffee-shops?lat=${meetingPoint.lat}&lng=${meetingPoint.lng}&radiusMeters=${Math.round(
              meetingPoint.radiusMeters
            )}`
          ),
          {
            method: "GET",
            signal: abortController.signal,
          }
        );

        if (!response.ok) {
          setCoffeeShops([]);
          return;
        }

        const data = await response.json();
        const shops = (data.shops || []).filter(Boolean);
        setCoffeeShops(shops);
      } catch (error) {
        if (abortController.signal.aborted) return;
        setCoffeeShops([]);
      }
    }

    loadCoffeeShops();

    return () => abortController.abort();
  }, [meetingPoint]);

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

    if (people.length >= 2) {
      const { a: personA, b: personB, distanceKm: totalDistanceKm } = findFarthestParticipantPair(people);
      const midpointLocation = projectedMidpoint(mapRef.current, personA, personB);
      const radiusKm = Math.min(totalDistanceKm * 0.1, 5);
      const radiusMeters = radiusKm * 1000;

      const participantLine = L.polyline(
        [
          [personA.lat, personA.lng],
          [personB.lat, personB.lng],
        ],
        {
          color: "#3b82f6",
          weight: 4,
          opacity: 0.8,
        }
      )
        .addTo(mapRef.current)
        .bindTooltip(`Distance: ${formatDistance(totalDistanceKm)}`, {
          permanent: true,
          direction: "center",
          className: "line-tooltip",
        });

      layersRef.current.push(participantLine);

      const midpointMarker = L.circleMarker([midpointLocation.lat, midpointLocation.lng], {
        radius: 8,
        color: "#f97316",
        fillColor: "#f97316",
        fillOpacity: 1,
      })
        .addTo(mapRef.current)
        .bindTooltip("Midpoint", {
          permanent: true,
          direction: "top",
          className: "line-tooltip",
        });

      layersRef.current.push(midpointMarker);
      bounds.push([midpointLocation.lat, midpointLocation.lng]);

      const midpointRadius = L.circle([midpointLocation.lat, midpointLocation.lng], {
        radius: radiusMeters,
        className: "midpoint-radius",
      })
        .addTo(mapRef.current)
        .bindTooltip(`Radius: ${formatDistance(radiusKm)}`, {
          permanent: true,
          direction: "center",
          className: "diameter-tooltip",
        });

      layersRef.current.push(midpointRadius);
    }

    if (meetingPoint) {
      const radiusMeters = meetingPoint.radiusMeters || 300;

      const meetingCircle = L.circle([meetingPoint.lat, meetingPoint.lng], {
        radius: radiusMeters,
        className: "meeting-radius",
      })
        .addTo(mapRef.current)
        .bindPopup("Suggested meeting area");

      layersRef.current.push(meetingCircle);
      bounds.push([meetingPoint.lat, meetingPoint.lng]);

      coffeeShops.forEach((shop) => {
        const shopMarker = L.circleMarker([shop.lat, shop.lng], {
          radius: 6,
          color: "#8b5cf6",
          fillColor: "#8b5cf6",
          fillOpacity: 0.9,
        })
          .addTo(mapRef.current)
          .bindPopup(`<strong>${shop.name}</strong><br/>${shop.type}`);

        layersRef.current.push(shopMarker);
        bounds.push([shop.lat, shop.lng]);
      });
    }

    if (bounds.length > 0) {
      mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [myLocation, friendLocations, meetingPoint, coffeeShops]);

  return (
    <div className="map-container">
      <div id="map" className="map"></div>
    </div>
  );
}