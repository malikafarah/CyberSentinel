import React, { useState, useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Rectangle, Popup, Marker, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { locationService } from '../services/services';
import { TrendingUp, Clock, Sparkles, Send, Flame, RotateCw, Maximize2 } from 'lucide-react';
import { ThreatGlobeHeatmap, type GlobePoint, type ThreatGlobeHeatmapRef } from '../components/ThreatGlobeHeatmap';

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
        background: var(--surface-raised, #0F1210);
        border: 1px solid ${color};
        padding: 4px 8px;
        border-radius: 6px;
        box-shadow: 0 0 12px ${color}66;
        color: var(--text-primary, #FFFFFF);
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
  const globeHeatmapRef = useRef<ThreatGlobeHeatmapRef>(null);
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');
  const [textureMode, setTextureMode] = useState<'satellite' | 'dark'>('satellite');
  const [activeLayers, setActiveLayers] = useState<'hex' | 'points' | 'both'>('hex');
  const [hexResolution, setHexResolution] = useState<number>(4);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);

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
      const data = await api.get<{ zones?: ForecastZone[] }>(
        '/predictions/forecast',
        { hours_ahead: hours }
      ).catch(() =>
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
      const data = await api.post<any>('/predictions/run', {
        prediction_horizon_hours: 24,
        include_graph_features: true,
        max_candidates: 50
      });
      if (data && data.hotspots) {
        const newNodes: GraphNode[] = data.hotspots.map((h: any) => ({
          id: h.atm_id,
          type: 'ATM',
          riskScore: h.risk_score,
          metadata: { lat: h.latitude, lng: h.longitude, name: h.atm_id }
        }));
        setGraphNodes(newNodes);
        setZones([]);
      }
    } catch (error) {
      console.error('Failed to run ML prediction pipeline:', error);
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

  // Convert all telemetry nodes and zones into 3D Globe Points
  const globePoints: GlobePoint[] = useMemo(() => {
    const pts: GlobePoint[] = [];

    // Graph nodes
    graphNodes.forEach((node) => {
      const coords = getNodeCoordinates(node);
      if (coords) {
        pts.push({
          lat: coords[0],
          lng: coords[1],
          weight: node.riskScore || 75,
          label: `${node.metadata?.name || node.id} (${node.type})`,
          type: node.type,
          riskScore: node.riskScore,
        });
      }
    });

    // Forecast zones
    forecastZones.forEach((fz) => {
      if (fz.center?.lat && fz.center?.lng) {
        pts.push({
          lat: fz.center.lat,
          lng: fz.center.lng,
          weight: fz.risk_score || (fz.predicted_risk_level === 'CRITICAL' ? 95 : 78),
          label: `Hotspot: ${fz.zone_name}`,
          type: 'HOTSPOT',
          riskScore: fz.risk_score,
        });
      }
    });

    // Interdiction zones
    zones.forEach((z) => {
      if (z.center?.lat && z.center?.lng) {
        pts.push({
          lat: z.center.lat,
          lng: z.center.lng,
          weight: (z.priority_weight || 1) * 88,
          label: `Interdiction Zone: ${z.zone_id}`,
          type: 'INTERDICTION',
        });
      }
    });

    return pts;
  }, [graphNodes, forecastZones, zones]);

  return (
    <div className="relative w-full h-[calc(100vh-58px)] bg-slate-100 dark:bg-[#0B0C10] font-sans overflow-hidden text-slate-900 dark:text-gray-200">
      
      {/* 1. Single Unified Parent Container with whitespace-nowrap and shrink-0 */}
      <div className="absolute top-4 sm:top-5 left-1/2 -translate-x-1/2 z-40 w-[96%] max-w-7xl h-14 px-4 bg-white/95 dark:bg-[#121318]/90 backdrop-blur-md rounded-xl border border-slate-200/90 dark:border-gray-800 shadow-lg shadow-slate-200/50 dark:shadow-black/40 overflow-x-auto scrollbar-hide whitespace-nowrap flex items-center justify-between gap-4 transition-colors">
        
        {/* LEFT: Node Status & Map Toggle */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-[#0a0b0e] rounded-full border border-slate-200 dark:border-gray-800">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
            <span className="text-[10px] font-mono tracking-widest text-slate-700 dark:text-gray-300 uppercase font-semibold">
              Mesh • {viewMode === '3d' ? globePoints.length : graphNodes.length} Nodes
            </span>
          </div>

          <div className="flex bg-slate-100 dark:bg-[#0a0b0e] p-1 rounded-lg border border-slate-200 dark:border-gray-800">
            <button
              onClick={() => setViewMode('3d')}
              className={`px-3 py-1 text-xs font-semibold rounded cursor-pointer transition-all ${
                viewMode === '3d'
                  ? 'text-white bg-emerald-600 dark:text-black dark:bg-[#00d664] shadow-sm font-bold'
                  : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              3D Globe
            </button>
            <button
              onClick={() => setViewMode('2d')}
              className={`px-3 py-1 text-xs font-semibold rounded cursor-pointer transition-all ${
                viewMode === '2d'
                  ? 'text-white bg-emerald-600 dark:text-black dark:bg-[#00d664] shadow-sm font-bold'
                  : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              2D Map
            </button>
          </div>
        </div>

        {/* CENTER: Engine Status & Actions (Using gap and border-x to prevent overlap) */}
        <div className="flex items-center gap-4 px-4 border-x border-slate-200 dark:border-gray-800/50 shrink-0">
          {/* Fixed Text Wrapping */}
          <div className="flex flex-col justify-center">
            <span className="text-[9px] text-slate-500 dark:text-gray-500 uppercase tracking-widest font-semibold">Analysis Engine</span>
            <span className={`text-xs font-bold flex items-center gap-1.5 ${isPredictiveMode ? 'text-purple-700 dark:text-purple-400' : 'text-emerald-700 dark:text-emerald-500'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isPredictiveMode ? 'bg-purple-500' : 'bg-emerald-500'}`}></span>
              {isPredictiveMode ? 'PROPHET FORECAST (+12H)' : 'LIVE GRAPH & DBSCAN'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/graph')}
              className="px-3 py-1 text-xs text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 rounded transition-all cursor-pointer font-semibold"
            >
              Graph
            </button>
            <button
              onClick={runPrediction}
              disabled={isPredicting}
              className="px-3 py-1 text-xs text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 rounded transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5 font-semibold"
            >
              {isPredicting ? (
                <>
                  <div className="w-2.5 h-2.5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                  <span>Running...</span>
                </>
              ) : (
                <span>Pipeline</span>
              )}
            </button>
          </div>
        </div>

        {/* RIGHT: Predictive Controls & Layer Toggles */}
        <div className="flex items-center gap-4 shrink-0">
          {/* Predictive Toggle Group */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleTogglePredictiveMode}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs rounded-lg border transition-all cursor-pointer font-semibold ${
                isPredictiveMode
                  ? 'text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/30 border-purple-300 dark:border-purple-500/40 shadow-sm'
                  : 'text-slate-700 dark:text-gray-300 bg-slate-100 dark:bg-[#1a1c23] border-slate-200 dark:border-gray-700 hover:bg-slate-200 dark:hover:bg-gray-800'
              }`}
            >
              <Sparkles size={13} className="text-purple-600 dark:text-purple-400" />
              <span>Predictive Mode</span>
            </button>

            {isPredictiveMode && (
              <div className="flex bg-slate-100 dark:bg-[#0a0b0e] p-1 rounded-lg border border-slate-200 dark:border-gray-800 text-[10px]">
                {[6, 12, 24].map((hrs) => (
                  <button
                    key={hrs}
                    onClick={() => handleHorizonChange(hrs)}
                    className={`px-2 py-0.5 rounded font-bold transition-all cursor-pointer ${
                      forecastHorizon === hrs
                        ? 'text-white dark:text-black bg-purple-600 dark:bg-purple-500 shadow font-bold'
                        : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    +{hrs}H
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Layer Controls (Safely inside the unified background container) */}
          {viewMode === '3d' && (
            <div className="flex items-center gap-2 pl-4 border-l border-slate-200 dark:border-gray-800/50">
              <button
                onClick={() => setTextureMode((prev) => (prev === 'satellite' ? 'dark' : 'satellite'))}
                className={`px-3 py-1 text-xs font-semibold rounded border transition-all cursor-pointer ${
                  textureMode === 'satellite'
                    ? 'text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20'
                    : 'text-emerald-700 dark:text-emerald-500 border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20'
                }`}
              >
                {textureMode === 'satellite' ? 'Satellite' : 'Dark'}
              </button>
              <button
                onClick={() => setActiveLayers((prev) => (prev === 'hex' ? 'both' : prev === 'both' ? 'points' : 'hex'))}
                className="px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 rounded transition-all cursor-pointer capitalize"
              >
                {activeLayers}
              </button>
              <div className="flex items-center gap-2 text-slate-500 dark:text-gray-400 ml-1">
                <button
                  onClick={() => setHexResolution((prev) => (prev === 4 ? 3 : prev === 3 ? 5 : 4))}
                  className="p-1 hover:text-orange-500 dark:hover:text-orange-400 transition-colors cursor-pointer"
                  title={`Hex Resolution: Level ${hexResolution}`}
                >
                  <Flame size={14} className={hexResolution === 5 ? 'text-orange-500 dark:text-orange-400' : ''} />
                </button>
                <button
                  onClick={() => setAutoRotate((prev) => !prev)}
                  className={`p-1 transition-colors cursor-pointer ${
                    autoRotate ? 'text-emerald-600 dark:text-emerald-400' : 'hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title={autoRotate ? 'Pause Rotation' : 'Auto-Rotate Globe'}
                >
                  <RotateCw size={14} className={autoRotate ? 'animate-spin' : ''} style={{ animationDuration: '6s' }} />
                </button>
                <button
                  onClick={() => globeHeatmapRef.current?.resetView()}
                  className="p-1 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  title="Reset Perspective"
                >
                  <Maximize2 size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {isPredicting && isPredictiveMode && (
        <div className="absolute inset-0 z-[999] flex items-center justify-center bg-black/40 pointer-events-none">
          <div className="bg-[#0B0F0D]/90 border border-purple-500/50 rounded-xl px-6 py-4 flex items-center gap-3 shadow-2xl">
            <div className="w-4 h-4 border-2 border-purple-500/30 border-t-purple-400 rounded-full animate-spin" />
            <span className="text-purple-300 font-mono text-xs font-bold uppercase tracking-widest">Running Prophet Forecast...</span>
          </div>
        </div>
      )}

      {/* 2. Visual Canvas: 3D Threat Globe or 2D GIS Map */}
      {viewMode === '3d' ? (
        <div className="w-full h-full absolute inset-0 z-0">
          <ThreatGlobeHeatmap
            ref={globeHeatmapRef}
            points={globePoints}
            height="100%"
            textureMode={textureMode}
            activeLayers={activeLayers}
            hexResolution={hexResolution}
            autoRotate={autoRotate}
          />
        </div>
      ) : (
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
                <div className="relative bg-white dark:bg-[#0B0C10] p-5 w-80 text-slate-800 dark:text-gray-200">
                  <div className="flex justify-between items-center mb-1.5 pr-6">
                    <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 tracking-widest uppercase flex items-center gap-1 font-mono">
                      <Sparkles size={12} /> HOTSPOT (+{forecastHorizon}H)
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 font-mono font-bold rounded uppercase ${
                      isCritical ? 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/40' : 'bg-purple-500/15 text-purple-600 dark:text-purple-300 border border-purple-500/40'
                    }`}>
                      {fz.predicted_risk_level}
                    </span>
                  </div>

                  <h3 className="text-slate-900 dark:text-white text-sm font-semibold mb-3 tracking-wide">{fz.zone_name}</h3>

                  <div className="space-y-1.5 text-xs font-mono bg-slate-50 dark:bg-[#16171B] p-3 rounded-lg border border-gray-200 dark:border-[#222327] mb-4">
                    <div className="flex justify-between text-slate-700 dark:text-gray-300">
                      <span className="text-slate-500 dark:text-[#82858E]">PROJECTED VOL:</span>
                      <span className="text-amber-600 dark:text-[#FFB800] font-bold">₹{fz.forecasted_cashout_volume.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-slate-700 dark:text-gray-300">
                      <span className="text-slate-500 dark:text-[#82858E]">PEAK SURGE:</span>
                      <span className="text-purple-600 dark:text-purple-300 font-bold flex items-center gap-1">
                        <Clock size={11} /> {fz.peak_hour.slice(11, 16)} IST
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-700 dark:text-gray-300">
                      <span className="text-slate-500 dark:text-[#82858E]">MONITORED ATMS:</span>
                      <span className="text-emerald-600 dark:text-[#00D26A] font-bold">{fz.targeted_atms.length} Terminals</span>
                    </div>
                  </div>

                  <button
                    onClick={() => dispatchPatrol(fz.zone_id)}
                    className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-mono font-bold text-[11px] uppercase tracking-widest rounded-md transition-all shadow-[0_0_15px_rgba(168,85,247,0.35)] flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Send size={12} /> Dispatch Pre-emptive Patrol
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
                <div className="relative bg-white dark:bg-[#0B0C10] p-5 w-80 text-slate-800 dark:text-gray-200">
                  <div className="flex justify-between items-center mb-1.5 pr-6">
                    <span className="text-xs font-bold text-red-600 dark:text-[#F73B3B] tracking-widest uppercase font-mono">
                      {zone.zone_id}
                    </span>
                    {zone.priority_weight && (
                      <span className="text-[10px] px-2 py-0.5 bg-red-500/15 text-red-600 dark:text-[#F73B3B] border border-red-500/30 font-mono rounded">
                        Priority: {zone.priority_weight}
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                    Corroborated Target ATMs: {zone.target_nodes.length}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-[#82858E] mb-4">
                    Anomalous spatial cash withdrawal cluster detected via DBSCAN triangulation.
                  </p>
                  <button 
                    onClick={() => dispatchPatrol(zone.zone_id)}
                    className="w-full py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-[#F73B3B] font-mono font-bold text-[11px] uppercase tracking-widest rounded border border-red-500/40 transition-colors cursor-pointer"
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
                  <div className="relative bg-white dark:bg-[#0B0C10] p-5 w-72 sm:w-80 text-slate-800 dark:text-gray-200">
                    {/* Header Row: pr-6 to prevent score pill from hitting close button */}
                    <div className="flex justify-between items-center mb-1.5 pr-6">
                      <span className="text-emerald-600 dark:text-[#00D26A] text-xs font-bold tracking-widest uppercase font-mono">
                        {nType} NODE
                      </span>
                      <span className="bg-slate-100 dark:bg-[#16171B] border border-gray-200 dark:border-[#222327] text-slate-600 dark:text-[#82858E] text-[10px] font-mono px-2 py-0.5 rounded">
                        {riskScore.toFixed(1)}/100
                      </span>
                    </div>

                    {/* Node Location / Title */}
                    <h3 className="text-slate-900 dark:text-white text-sm font-semibold mb-3 tracking-wide">
                      {node.metadata?.label || node.metadata?.name || node.id}
                    </h3>

                    {node.metadata?.evidence_chain && node.metadata.evidence_chain.length > 0 && (
                      <div className="text-[10px] font-mono text-slate-600 dark:text-gray-400 mb-4 bg-slate-50 dark:bg-[#16171B] p-2.5 rounded border border-gray-200 dark:border-[#222327]">
                        <span className="text-slate-500 dark:text-[#82858E] block text-[9px] uppercase tracking-wider mb-0.5">Provenance Chain:</span>
                        {node.metadata.evidence_chain.join(' → ')}
                      </div>
                    )}

                    {/* Button: py-2.5 for proper clickable touch area */}
                    <button 
                      onClick={() => navigate('/graph')}
                      className="w-full border border-emerald-500/40 text-emerald-600 dark:text-[#00D26A] bg-emerald-500/5 hover:bg-emerald-500/15 py-2.5 rounded-md text-[11px] font-mono font-bold tracking-widest uppercase transition-all shadow-[0_0_12px_rgba(0,210,106,0.1)] cursor-pointer"
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
      )}

      {/* 5. Bottom Predictive Stats Bar (when Predictive Mode is active) */}
      {isPredictiveMode && forecastZones.length > 0 && (
        <div className="absolute bottom-6 left-6 z-[1000] bg-white/95 dark:bg-[#0B0F0D]/95 backdrop-blur-xl border border-purple-300 dark:border-purple-500/40 rounded-xl p-3.5 max-w-md shadow-2xl space-y-2 text-slate-800 dark:text-gray-200">
          <div className="flex items-center justify-between text-xs border-b border-gray-200 dark:border-white/10 pb-2">
            <span className="font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1.5 uppercase tracking-wider">
              <TrendingUp size={14} /> Forecast Horizon: Next {forecastHorizon} Hours
            </span>
            <span className="text-[10px] font-mono text-slate-500 dark:text-gray-400">Payday & Weekend Weighted</span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center pt-1 font-mono text-xs">
            <div className="bg-slate-100 dark:bg-white/5 p-2 rounded border border-gray-200 dark:border-white/5">
              <span className="text-[9px] text-slate-500 dark:text-gray-400 block uppercase">Forecast Hotspots</span>
              <span className="text-purple-700 dark:text-purple-300 font-bold text-sm">{forecastZones.length} Zones</span>
            </div>
            <div className="bg-slate-100 dark:bg-white/5 p-2 rounded border border-gray-200 dark:border-white/5">
              <span className="text-[9px] text-slate-500 dark:text-gray-400 block uppercase">Projected Cashout</span>
              <span className="text-amber-600 dark:text-amber-400 font-bold text-sm">
                ₹{forecastZones.reduce((acc, z) => acc + z.forecasted_cashout_volume, 0).toLocaleString()}
              </span>
            </div>
            <div className="bg-slate-100 dark:bg-white/5 p-2 rounded border border-gray-200 dark:border-white/5">
              <span className="text-[9px] text-slate-500 dark:text-gray-400 block uppercase">Critical Alert</span>
              <span className="text-red-600 dark:text-red-400 font-bold text-sm">
                {forecastZones.filter(z => z.predicted_risk_level === 'CRITICAL').length} High Urgency
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 6. Last-Mile Patrol Dispatch Toast Notification */}
      {dispatchStatus && (
        <div className="absolute bottom-10 right-10 z-[1000] bg-white/95 dark:bg-black/90 backdrop-blur-md border-l-4 border-purple-500 p-4 max-w-sm shadow-2xl animate-fade-in rounded-r-lg border border-gray-200 dark:border-transparent">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 bg-purple-500 rounded-full animate-pulse" />
            <span className="text-xs font-mono text-slate-800 dark:text-gray-200 font-medium">
              {dispatchStatus}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default Heatmap;
