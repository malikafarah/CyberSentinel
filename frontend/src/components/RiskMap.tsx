import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, useMap } from 'react-leaflet';
import { locationService, type LocationNode } from '../services/locationService';
import 'leaflet/dist/leaflet.css';

function FitMapBounds({ locations }: { locations: LocationNode[] }) {
  const map = useMap();

  useEffect(() => {
    if (locations.length > 0) {
      const validPoints = locations
        .filter((l) => l.coordinates?.lat && l.coordinates?.lng)
        .map((l) => [l.coordinates.lat, l.coordinates.lng] as [number, number]);

      if (validPoints.length > 0) {
        map.fitBounds(validPoints, { padding: [40, 40], maxZoom: 12 });
      }
    }
  }, [locations, map]);

  return null;
}

export default function RiskMap({
  height = '500px',
  onSelectNode,
}: {
  height?: string;
  onSelectNode?: (loc: LocationNode) => void;
}) {
  const [locations, setLocations] = useState<LocationNode[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    setLoading(true);
    locationService
      .getLocations()
      .then((data) => {
        setLocations(data);
      })
      .catch((err) => {
        console.error('Failed to load physical locations from backend:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Helper to colorize based on risk score (0-100)
  const getMarkerColor = (score: number) => {
    if (score > 80) return '#ef4444'; // Red
    if (score > 50) return '#f97316'; // Orange
    return '#22c55e'; // Green
  };

  return (
    <div style={{ position: 'relative', width: '100%', height, borderRadius: '9px', overflow: 'hidden', border: '1px solid #292D2A' }}>
      {loading && (
        <div style={{ position: 'absolute', inset: 0, background: '#0B0D0C80', zIndex: 1000, display: 'grid', placeItems: 'center', color: '#48D878', fontFamily: 'monospace', fontSize: '11px' }}>
          Loading geospatial ATM telemetry...
        </div>
      )}

      <MapContainer
        center={[20.5937, 78.9629]}
        zoom={5}
        style={{ height: '100%', width: '100%', background: '#0B0D0C' }}
        scrollWheelZoom
      >
        <TileLayer
          attribution="Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />

        <FitMapBounds locations={locations} />

        {locations.map((loc) => {
          const color = getMarkerColor(loc.riskScore);
          const isHighRisk = loc.riskScore > 80;

          return (
            <CircleMarker
              key={loc.id}
              center={[loc.coordinates.lat, loc.coordinates.lng]}
              pathOptions={{
                color: color,
                fillColor: color,
                fillOpacity: isHighRisk ? 0.75 : 0.5,
                weight: 2,
              }}
              radius={isHighRisk ? 10 : 8}
              eventHandlers={{
                click: () => onSelectNode?.(loc),
              }}
            >
              <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
                {loc.name} · Risk: {loc.riskScore}%
              </Tooltip>
              <Popup>
                <div style={{ background: '#151817', color: '#F1F3F1', padding: '4px', minWidth: '190px', fontFamily: 'sans-serif' }}>
                  <p style={{ margin: '0 0 4px', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', color: '#6F7772', fontWeight: 700 }}>
                    PHYSICAL BANKING NODE
                  </p>
                  <strong style={{ fontSize: '14px', display: 'block', marginBottom: '4px', color: '#FFFFFF' }}>{loc.name}</strong>
                  <span style={{ fontSize: '11px', color: '#A6ADA8', display: 'block', marginBottom: '8px' }}>
                    {loc.location_id} · {loc.region}
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', borderTop: '1px solid #292D2A', paddingTop: '6px', fontSize: '10px' }}>
                    <div>
                      <span style={{ color: '#6F7772', display: 'block' }}>Type:</span>
                      <b style={{ color: '#F1F3F1' }}>{loc.type}</b>
                    </div>
                    <div>
                      <span style={{ color: '#6F7772', display: 'block' }}>Risk Score:</span>
                      <b style={{ color }}>{loc.riskScore}/100</b>
                    </div>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
