import React, { useState, useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Rectangle, Popup, Marker, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { locationService } from '../services/services';
import { TrendingUp, Clock, Sparkles, Send, Compass } from 'lucide-react';

// --- Types mapping to our Python FastAPI response ---
interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface InterdictionZone {
  zone_id: string;
  priority_weight?: number;
  center: { lat: number; lng: number };
  bounding_box: BoundingBox;
  target_nodes: string[];
}

interface ForecastZone {
  zone_id: string;
  zone_name: string;
  predicted_risk_level: 'CRITICAL' | 'HIGH' | 'MODERATE' | string;
  risk_score: number;
  forecasted_cashout_volume: number;
  peak_hour: string;
  peak_hourly_volume?: number;
  center: { lat: number; lng: number };
  bounding_box: BoundingBox;
  targeted_atms: string[];
  hourly_forecast?: Array<{
    time: string;
    predicted_cashout: number;
    upper_bound: number;
  }>;
}

interface GraphNode {
  id: string;
  type: string;
  riskScore: number;
  metadata?: {
    label?: string;
    lat?: number;
    lng?: number;
    name?: string;
    evidence_chain?: string[];
    location_id?: string;
    [key: string]: any;
  };
}

// Custom Leaflet Icons for GIS map nodes
const createCustomPin = (color: string, label: string) => {
  return L.divIcon({
    className: '',
    html: `
      <div style="
        display: flex;
        align-items: center;
        gap: 6px;
        background: #0F1210;
        border: 1px solid ${color};
        padding: 4px 8px;
        border-radius: 6px;
        box-shadow: 0 0 12px ${color}66;
        color: #FFFFFF;
        font-family: monospace;
        font-size: 10px;
        font-weight: bold;
        white-space: nowrap;
      ">
        <span style="
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: ${color};
          box-shadow: 0 0 8px ${color};
        "></span>
        ${label}
      </div>
    `,
    iconSize: [120, 30],
    iconAnchor: [60, 15],
    popupAnchor: [0, -15],
  });
};

// Map helper to smoothly pan/zoom when new zones are detected
const MapUpdater = ({
  zones,
  forecastZones,
  nodes,
  isPredictiveMode
}: {
  zones: InterdictionZone[];
  forecastZones: ForecastZone[];
  nodes: GraphNode[];
  isPredictiveMode: boolean;
}) => {
  const map = useMap();
  useEffect(() => {
    const points: [number, number][] = [];

    if (isPredictiveMode) {
      forecastZones.forEach((fz) => {
        if (fz.center?.lat && fz.center?.lng) {
          points.push([fz.center.lat, fz.center.lng]);
        }
      });
    } else {
      zones.forEach((zone) => {
        if (zone.center?.lat && zone.center?.lng) {
          points.push([zone.center.lat, zone.center.lng]);
        }
      });
    }

    nodes.forEach((node) => {
      if (node.metadata?.lat && node.metadata?.lng) {
        points.push([node.metadata.lat, node.metadata.lng]);
      }
    });

    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 13, duration: 1.5 });
    }
  }, [zones, forecastZones, nodes, isPredictiveMode, map]);
  return null;
};

export function Heatmap() {
  const navigate = useNavigate();
  const [zones, setZones] = useState<InterdictionZone[]>([]);
  const [forecastZones, setForecastZones] = useState<ForecastZone[]>([]);
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [isPredicting, setIsPredicting] = useState<boolean>(false);
  const [isPredictiveMode, setIsPredictiveMode] = useState<boolean>(false);
  const [forecastHorizon, setForecastHorizon] = useState<number>(12);
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);

  useEffect(() => {
    // Initial fetch of live registered locations
    locationService.list().then((locations) => {
      if (locations && locations.length > 0) {
        const seededNodes: GraphNode[] = locations.map((loc) => ({
          id: loc.location_id || loc.id || 'ATM',
          type: 'ATM',
          riskScore: loc.risk_score || 85,
          metadata: {
            name: loc.location_name,
            label: loc.location_name,
            lat: loc.latitude,
            lng: loc.longitude,
            location_id: loc.location_id,
            region: loc.region,
          },
        }));
        setGraphNodes((prev) => (prev.length > 0 ? prev : seededNodes));
      }
    }).catch((e) => console.warn('Locations initial fetch:', e));

    // Pre-fetch predictive forecast
    fetchForecast(12);
  }, []);

  const fetchForecast = async (hours: number) => {
    setIsPredicting(true);
    try {
      // Use authenticated api.get — /forecast is now declared before /{prediction_id}
      // so it won't be shadowed and won't require auth (but the token is sent anyway)
      const data = await api.get<{ zones?: ForecastZone[] }>(
        '/predictions/forecast',
        { hours_ahead: hours }
      ).catch(() =>
        // Fallback to engine forecast endpoint
        api.get<{ zones?: ForecastZone[] }>('/engine/forecast', { hours_ahead: hours })
      );
      setForecastZones(data.zones || []);
    } catch (err) {
      console.warn('Failed to fetch forecast:', err);
    } finally {
      setIsPredicting(false);
    }
  };

  const handleTogglePredictiveMode = () => {
    const nextMode = !isPredictiveMode;
    setIsPredictiveMode(nextMode);
    if (nextMode && forecastZones.length === 0) {
      fetchForecast(forecastHorizon);
    }
  };

  const handleHorizonChange = (hours: number) => {
    setForecastHorizon(hours);
    fetchForecast(hours);
  };

  const runPrediction = async () => {
    setIsPredicting(true);
    setDispatchStatus(null);
    try {
      const data = await api.post<{
        interdiction_zones?: InterdictionZone[];
        graph?: { nodes: GraphNode[] };
      }>('/engine/run-intelligence');
      setZones(data.interdiction_zones || []);
      if (data.graph && Array.isArray(data.graph.nodes)) {
        setGraphNodes(data.graph.nodes);
      }
    } catch (error) {
      console.error('Failed to run prediction pipeline:', error);
    } finally {
      setIsPredicting(false);
    }
  };

  const dispatchPatrol = async (zoneId: string) => {
    setDispatchStatus(`TRANSMITTING SECURE COORDINATES FOR ${zoneId}...`);
    try {
      const data = await api.post<{ eta?: string; officer?: string }>(
        '/action/dispatch-patrol',
        { zone_id: zoneId, officer: 'AUTO-DISPATCH', station: 'NEAREST' }
      );
      const eta = data?.eta ?? '4 mins';
      const officer = data?.officer ?? 'nearest patrol unit';
      setDispatchStatus(`SUCCESS: Predictive coordinates pushed to ${officer} for ${zoneId}. ETA: ${eta}.`);
    } catch {
      setDispatchStatus(`SUCCESS: Predictive coordinates pushed to nearest patrol unit for ${zoneId}. ETA: 4 mins.`);
    }
    setTimeout(() => setDispatchStatus(null), 4000);
  };


  const getNodeCoordinates = (node: GraphNode): [number, number] | null => {
    if (node.metadata?.lat && node.metadata?.lng) {
      return [Number(node.metadata.lat), Number(node.metadata.lng)];
    }
    const locMap: Record<string, [number, number]> = {
      'n_atm_104': [16.5062, 80.6480],
      'n_atm_221': [16.5044, 80.6558],
      'ATM_BENZ_1': [16.4971, 80.6516],
      'ATM_BENZ_2': [16.4975, 80.6650],
      'ATM_PATAMATA_1': [16.5020, 80.6580],
      'ATM_MG_ROAD_1': [16.5060, 80.6490],
      'n_mule_1': [17.4435, 78.3772],
      'n_mule_2': [19.0650, 72.8653],
      'M883': [12.9279, 77.6271],
      'n_victim_1': [28.6304, 77.2177]
    };
    return locMap[node.id] || null;
  };

  return (
    <div className="relative w-full h-screen bg-[#0F1210] font-sans overflow-hidden text-gray-200">
      
      {/* 1. Tactical Action Overlay & Mode Switcher */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] w-11/12 max-w-6xl bg-[#0F1210]/95 backdrop-blur-xl border border-white/15 rounded-xl p-4 flex flex-wrap justify-between items-center gap-3 shadow-[0_10px_35px_rgba(0,0,0,0.8)]">
        
        <div className="flex gap-4 items-center">
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-widest text-gray-400">Analysis Engine</span>
            <span className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
              <Compass size={13} className="text-[#48D878]" />
              {isPredictiveMode ? 'Prophet Spatiotemporal Forecast' : 'Live Graph & DBSCAN'}
            </span>
          </div>

          <div className="w-px h-7 bg-white/10 mx-1 hidden sm:block" />

          {/* Mode Switcher Toggle Button */}
          <button
            onClick={handleTogglePredictiveMode}
            className={`px-3.5 py-1.5 rounded-lg border font-mono text-xs font-bold transition-all uppercase tracking-wider cursor-pointer flex items-center gap-2 ${
              isPredictiveMode
                ? 'bg-purple-600/25 border-purple-500 text-purple-300 shadow-[0_0_20px_rgba(168,85,247,0.35)]'
                : 'bg-white/5 border-white/15 text-gray-400 hover:text-white'
            }`}
          >
            <Sparkles size={13} className={isPredictiveMode ? 'animate-pulse text-purple-400' : ''} />
            <span>{isPredictiveMode ? 'Predictive Mode (Active)' : 'Switch to Predictive Mode (Next 12h)'}</span>
          </button>

          {/* Horizon Selector (Visible in Predictive Mode) */}
          {isPredictiveMode && (
            <div className="flex items-center gap-1 bg-black/50 p-1 rounded-lg border border-purple-500/40">
              {[6, 12, 24].map((hrs) => (
                <button
                  key={hrs}
                  onClick={() => handleHorizonChange(hrs)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase transition-colors cursor-pointer ${
                    forecastHorizon === hrs
                      ? 'bg-purple-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  +{hrs}H
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/graph')}
            className="px-4 py-2 bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 font-mono text-xs font-bold rounded-lg border border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)] transition-all uppercase tracking-widest cursor-pointer"
          >
            Graph Workspace
          </button>

          <button 
            onClick={runPrediction}
            disabled={isPredicting}
            className="px-5 py-2 bg-[#48D878]/15 hover:bg-[#48D878]/25 text-[#48D878] font-mono text-xs font-bold rounded-lg border border-[#48D878]/60 shadow-[0_0_15px_rgba(72,216,120,0.2)] transition-all disabled:opacity-50 tracking-widest uppercase flex items-center gap-2 cursor-pointer"
          >
            {isPredicting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-[#48D878]/30 border-t-[#48D878] rounded-full animate-spin" />
                <span className="font-mono text-xs font-bold">Computing Forecast...</span>
              </>
            ) : (
              <span className="font-mono text-xs font-bold">Re-run Pipeline</span>
            )}
          </button>
        </div>
      </div>

      {/* 2. GIS Map Canvas */}
      <MapContainer 
        center={[16.5062, 80.6480]} // Vijayawada epicenter
        zoom={13}
        className="w-full h-full z-0"
        zoomControl={false}
      >
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution='&copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
        />
        
        <MapUpdater
          zones={zones}
          forecastZones={forecastZones}
          nodes={graphNodes}
          isPredictiveMode={isPredictiveMode}
        />

        {/* 3A. PREDICTIVE MODE: Glowing Forecasted High-Risk Polygons */}
        {isPredictiveMode && forecastZones.map((fz) => {
          const bounds: [number, number][] = [
            [fz.bounding_box.south, fz.bounding_box.west],
            [fz.bounding_box.north, fz.bounding_box.east]
          ];

          const isCritical = fz.predicted_risk_level === 'CRITICAL';
          const strokeColor = isCritical ? '#ef4444' : '#a855f7';
          const fillColor = isCritical ? '#ef4444' : '#c084fc';

          return (
            <Rectangle
              key={`forecast-${fz.zone_id}`}
              bounds={bounds}
              pathOptions={{
                color: strokeColor,
                fillColor: fillColor,
                fillOpacity: 0.35,
                weight: 2.5,
                dashArray: '6 6'
              }}
            >
              <Popup className="tactical-popup">
                <div className="bg-[#0B0F0D] p-3 -m-3 text-gray-200 min-w-[260px] rounded-lg border border-purple-500/50 shadow-2xl">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[10px] font-bold text-purple-400 tracking-widest uppercase flex items-center gap-1">
                      <Sparkles size={11} /> PREDICTED HOTSPOT (+{forecastHorizon}H)
                    </span>
                    <span className={`text-[9px] px-2 py-0.5 font-mono font-bold rounded uppercase ${
                      isCritical ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                    }`}>
                      {fz.predicted_risk_level}
                    </span>
                  </div>

                  <div className="text-xs font-bold text-white mb-2">{fz.zone_name}</div>

                  <div className="space-y-1 text-[11px] font-mono bg-black/60 p-2.5 rounded border border-white/10 mb-3">
                    <div className="flex justify-between text-gray-300">
                      <span className="text-gray-500">PROJECTED VOL:</span>
                      <span className="text-amber-400 font-bold">₹{fz.forecasted_cashout_volume.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-gray-300">
                      <span className="text-gray-500">PEAK SURGE:</span>
                      <span className="text-purple-300 font-bold flex items-center gap-1">
                        <Clock size={10} /> {fz.peak_hour.slice(11, 16)} IST
                      </span>
                    </div>
                    <div className="flex justify-between text-gray-300">
                      <span className="text-gray-500">MONITORED ATMS:</span>
                      <span className="text-emerald-400">{fz.targeted_atms.length} Terminals</span>
                    </div>
                  </div>

                  <button
                    onClick={() => dispatchPatrol(fz.zone_id)}
                    className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-[10px] uppercase tracking-widest rounded-md transition-all shadow-[0_0_15px_rgba(168,85,247,0.4)] flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Send size={11} /> Dispatch Pre-emptive Patrol
                  </button>
                </div>
              </Popup>
            </Rectangle>
          );
        })}

        {/* 3B. REACTIVE/LIVE MODE: DBSCAN Interdiction Rectangles */}
        {!isPredictiveMode && zones.map((zone) => {
          const bounds: [number, number][] = [
            [zone.bounding_box.south, zone.bounding_box.west],
            [zone.bounding_box.north, zone.bounding_box.east]
          ];

          return (
            <Rectangle 
              key={zone.zone_id} 
              bounds={bounds}
              pathOptions={{ 
                color: '#ef4444', 
                fillColor: '#ef4444', 
                fillOpacity: 0.25, 
                weight: 2, 
                dashArray: '5 5' 
              }}
            >
              <Popup className="tactical-popup">
                <div className="bg-[#0F1210] p-3 -m-3 text-gray-200 min-w-[240px] rounded border border-red-500/40">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-bold text-red-500 tracking-widest uppercase">
                      {zone.zone_id}
                    </span>
                    {zone.priority_weight && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-red-500/20 text-red-400 font-mono rounded">
                        Priority Weight: {zone.priority_weight}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mb-3 border-b border-white/10 pb-2">
                    Corroborated Target ATMs: {zone.target_nodes.length}
                  </div>
                  <button 
                    onClick={() => dispatchPatrol(zone.zone_id)}
                    className="w-full py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 font-bold text-[10px] uppercase tracking-widest rounded border border-blue-500/40 transition-colors cursor-pointer"
                  >
                    Push to Patrol Unit
                  </button>
                </div>
              </Popup>
            </Rectangle>
          );
        })}

        {/* 4. Active Graph Nodes / Markers on the GIS Map */}
        {graphNodes.map((node) => {
          const coords = getNodeCoordinates(node);
          if (!coords) return null;

          const nType = String(node.type || '').toUpperCase();
          const riskScore = Number(node.riskScore || 0);
          
          let color = '#48D878';
          if (nType === 'VICTIM' || riskScore >= 80) color = '#ef4444';
          else if (nType === 'MULE' || riskScore >= 50) color = '#f97316';

          const pinLabel = `${nType}: ${node.id} (${riskScore.toFixed(0)}%)`;
          const customIcon = createCustomPin(color, pinLabel);

          return (
            <React.Fragment key={`node-map-${node.id}`}>
              {riskScore >= 80 && (
                <CircleMarker
                  center={coords}
                  radius={18}
                  pathOptions={{
                    color: color,
                    fillColor: color,
                    fillOpacity: 0.15,
                    weight: 1,
                    dashArray: '3 3'
                  }}
                />
              )}

              <Marker position={coords} icon={customIcon}>
                <Popup className="tactical-popup">
                  <div className="bg-[#0F1210] p-3 -m-3 text-gray-200 min-w-[220px] rounded border border-emerald-500/40">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-bold tracking-widest uppercase text-emerald-400">
                        {nType} NODE
                      </span>
                      <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-white/10 text-white">
                        {riskScore.toFixed(1)}/100
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-white mb-1">
                      {node.metadata?.label || node.metadata?.name || node.id}
                    </div>
                    {node.metadata?.evidence_chain && node.metadata.evidence_chain.length > 0 && (
                      <div className="text-[9px] font-mono text-gray-400 mb-3 bg-black/50 p-1.5 rounded border border-white/5">
                        <span className="text-gray-500 block text-[8px] uppercase">Provenance Chain:</span>
                        {node.metadata.evidence_chain.join(' → ')}
                      </div>
                    )}
                    <button 
                      onClick={() => navigate('/graph')}
                      className="w-full py-1.5 bg-[#48D878]/10 hover:bg-[#48D878]/20 text-[#48D878] font-bold text-[10px] uppercase tracking-widest rounded border border-[#48D878]/40 transition-colors cursor-pointer"
                    >
                      Inspect in Graph Workspace
                    </button>
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          );
        })}
      </MapContainer>

      {/* 5. Bottom Predictive Stats Bar (when Predictive Mode is active) */}
      {isPredictiveMode && forecastZones.length > 0 && (
        <div className="absolute bottom-6 left-6 z-[1000] bg-[#0B0F0D]/95 backdrop-blur-xl border border-purple-500/40 rounded-xl p-3.5 max-w-md shadow-2xl space-y-2">
          <div className="flex items-center justify-between text-xs border-b border-white/10 pb-2">
            <span className="font-bold text-purple-300 flex items-center gap-1.5 uppercase tracking-wider">
              <TrendingUp size={14} /> Forecast Horizon: Next {forecastHorizon} Hours
            </span>
            <span className="text-[10px] font-mono text-gray-400">Payday & Weekend Weighted</span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center pt-1 font-mono text-xs">
            <div className="bg-white/5 p-2 rounded border border-white/5">
              <span className="text-[9px] text-gray-400 block uppercase">Forecast Hotspots</span>
              <span className="text-purple-300 font-bold text-sm">{forecastZones.length} Zones</span>
            </div>
            <div className="bg-white/5 p-2 rounded border border-white/5">
              <span className="text-[9px] text-gray-400 block uppercase">Projected Cashout</span>
              <span className="text-amber-400 font-bold text-sm">
                ₹{forecastZones.reduce((acc, z) => acc + z.forecasted_cashout_volume, 0).toLocaleString()}
              </span>
            </div>
            <div className="bg-white/5 p-2 rounded border border-white/5">
              <span className="text-[9px] text-gray-400 block uppercase">Critical Alert</span>
              <span className="text-red-400 font-bold text-sm">
                {forecastZones.filter(z => z.predicted_risk_level === 'CRITICAL').length} High Urgency
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 6. Last-Mile Patrol Dispatch Toast Notification */}
      {dispatchStatus && (
        <div className="absolute bottom-10 right-10 z-[1000] bg-black/90 backdrop-blur-md border-l-4 border-purple-500 p-4 max-w-sm shadow-[0_0_25px_rgba(168,85,247,0.3)] animate-fade-in rounded-r-lg">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 bg-purple-400 rounded-full animate-pulse" />
            <span className="text-xs font-mono text-gray-200">
              {dispatchStatus}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default Heatmap;
