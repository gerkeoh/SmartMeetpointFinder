import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
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
  const [position, setPosition] = useState(null);
  const [status, setStatus] = useState("Click the button below to allow location access.");
  const [loading, setLoading] = useState(false);

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
