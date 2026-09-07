import { useEffect } from 'react';
import L from 'leaflet';
import { Circle, MapContainer, Marker, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import type { Prediction, LocationItem } from '../types';
import { riskColor } from '../utils/risk';

type MapNode = (Prediction | LocationItem) & {
  isLocationHotspot?: boolean;
};

function Fit({ data }: { data: MapNode[] }) {
  const map = useMap();

  useEffect(() => {
    const validCoords = data
      .filter((p) => p.latitude && p.longitude && !isNaN(p.latitude) && !isNaN(p.longitude))
      .map((p) => [p.latitude, p.longitude] as [number, number]);

    if (validCoords.length) {
      map.fitBounds(validCoords, {
        padding: [35, 35],
        maxZoom: 12,
      });
    }
  }, [data, map]);

  return null;
}

function FocusSelected({ node }: { node?: MapNode }) {
  const map = useMap();

  useEffect(() => {
    if (node && node.latitude && node.longitude) {
      map.flyTo([node.latitude, node.longitude], Math.max(map.getZoom(), 11), { duration: 0.45 });
    }
  }, [map, node]);

  return null;
}

function markerIcon(node: MapNode, selected?: string) {
  const riskLevel = String(node.risk_level || 'LOW').toUpperCase();
  const color = riskColor(riskLevel as any);
  const elevated = riskLevel === 'CRITICAL' || riskLevel === 'HIGH';
  const isAtm = node.location_id?.toUpperCase().includes('ATM') || !('crime_category' in node);
  const isSelected = selected === node.id || selected === node.location_id;

  return L.divIcon({
    className: '',
    html: `
      <div class="map-pin ${isSelected ? 'selected' : ''} ${elevated ? 'elevated-risk' : ''}" style="--pin:${color}; ${isAtm ? 'border-radius: 4px;' : ''}">
        <span style="${isAtm ? 'border-radius: 2px;' : ''}"></span>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -12],
  });
}

export function MapView({
  data,
  locations,
  onSelect,
  selected,
  compact = false,
}: {
  data: Prediction[];
  locations?: LocationItem[];
  onSelect: (p: any) => void;
  selected?: string;
  compact?: boolean;
}) {
  // Merge predictions and banking locations without duplicate IDs
  const combinedNodes: MapNode[] = [...data];

  if (locations && locations.length > 0) {
    const existingLocIds = new Set(data.map((p) => p.location_id || p.id));
    locations.forEach((loc) => {
      if (!existingLocIds.has(loc.location_id) && !existingLocIds.has(loc.id || '')) {
        combinedNodes.push({
          ...loc,
          isLocationHotspot: true,
        });
      }
    });
  }

  const selectedNode = combinedNodes.find((n) => n.id === selected || n.location_id === selected);

  return (
    <div className={`map ${compact ? 'compact' : ''}`}>
      <MapContainer center={[16.5062, 80.6480]} zoom={8} scrollWheelZoom>
        <TileLayer
          attribution="Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />
        <Fit data={combinedNodes} />
        <FocusSelected node={selectedNode} />
        {combinedNodes.map((p) => {
          const key = p.id || p.location_id;
          const riskLevel = String(p.risk_level || 'LOW').toUpperCase();
          const riskScore = p.risk_score ?? 0;
          const isAtm = p.location_id?.toUpperCase().includes('ATM') || ('location_metadata' in p);

          return (
            <Marker
              key={key}
              position={[p.latitude, p.longitude]}
              eventHandlers={{ click: () => onSelect(p) }}
              icon={markerIcon(p, selected)}
            >
              <Tooltip direction="top" offset={[0, -10]} opacity={0.96}>
                {p.location_id} · {riskLevel} · {riskScore}% {isAtm ? '💳 ATM' : '🎯 Hotspot'}
              </Tooltip>
              <Popup>
                <div className="map-popup">
                  <p className="eyebrow">{isAtm ? 'BANKING / ATM TERMINAL' : 'PREDICTIVE RISK NODE'}</p>
                  <strong>{p.location_name}</strong>
                  <span>{p.location_id} · {p.region}</span>
                  <dl>
                    <div>
                      <dt>Risk level</dt>
                      <dd>{riskLevel}</dd>
                    </div>
                    <div>
                      <dt>Risk score</dt>
                      <dd>{riskScore}/100</dd>
                    </div>
                    <div>
                      <dt>Forecast window</dt>
                      <dd>{p.predicted_window || '12:00–18:00'}</dd>
                    </div>
                    <div>
                      <dt>Type</dt>
                      <dd>{isAtm ? 'ATM Hardware' : 'AI Prediction'}</dd>
                    </div>
                  </dl>
                </div>
              </Popup>
            </Marker>
          );
        })}
        {combinedNodes
          .filter((p) => String(p.risk_level).toUpperCase() === 'CRITICAL' || String(p.risk_level).toUpperCase() === 'HIGH')
          .map((p) => {
            const isCritical = String(p.risk_level).toUpperCase() === 'CRITICAL';
            const color = riskColor(String(p.risk_level).toUpperCase() as any);
            return (
              <Circle
                key={`${p.id || p.location_id}-zone`}
                center={[p.latitude, p.longitude]}
                radius={isCritical ? 10000 : 6000}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: 0.06,
                  opacity: 0.25,
                  weight: 1,
                  className: 'risk-zone',
                }}
              />
            );
          })}
        {selectedNode && (
          <Circle
            key={`${selectedNode.id || selectedNode.location_id}-selected`}
            center={[selectedNode.latitude, selectedNode.longitude]}
            radius={8500}
            pathOptions={{
              color: riskColor(String(selectedNode.risk_level).toUpperCase() as any),
              fillOpacity: 0,
              opacity: 0.45,
              weight: 1.5,
              dashArray: '4 6',
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}

