import { useRef, useEffect, useState, useMemo, useImperativeHandle, forwardRef } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';

export interface GlobePoint {
  lat: number;
  lng: number;
  weight: number;
  label?: string;
  type?: string;
  riskScore?: number;
}

export interface ThreatGlobeHeatmapRef {
  resetView: () => void;
}

interface ThreatGlobeHeatmapProps {
  points?: GlobePoint[];
  height?: number | string;
  textureMode?: 'satellite' | 'dark';
  activeLayers?: 'hex' | 'points' | 'both';
  hexResolution?: number;
  autoRotate?: boolean;
  onPointClick?: (point: GlobePoint) => void;
}

function weightToColor(weight: number): string {
  if (weight > 80) return '#FF2222'; // High-contrast Red (CRITICAL)
  if (weight > 50) return '#FFB300'; // High-contrast Amber (HIGH)
  if (weight > 25) return '#00E5FF'; // Electric Cyan (MODERATE)
  return '#00FF66'; // Neon Green (LOW / NORMAL)
}

function generateDefaultGlobePoints(): GlobePoint[] {
  const hubSeeds = [
    { lat: 16.5062, lng: 80.6480, weight: 96, label: 'Vijayawada Epicenter' },
    { lat: 12.9716, lng: 77.5946, weight: 92, label: 'Bengaluru Core Cluster' },
    { lat: 19.0760, lng: 72.8777, weight: 90, label: 'Mumbai Metro Vault' },
    { lat: 28.6139, lng: 77.2090, weight: 94, label: 'NCR Financial Matrix' },
    { lat: 13.0827, lng: 80.2707, weight: 68, label: 'Chennai South Grid' },
    { lat: 22.5726, lng: 88.3639, weight: 75, label: 'Kolkata East Terminal' },
    { lat: 17.3850, lng: 78.4867, weight: 84, label: 'Hyderabad Cyberabad Matrix' },
    { lat: 23.0225, lng: 72.5714, weight: 62, label: 'Ahmedabad Industrial Zone' },
    { lat: 1.3521, lng: 103.8198, weight: 72, label: 'Singapore APAC Relay' },
    { lat: 25.2048, lng: 55.2708, weight: 86, label: 'Dubai Trade Matrix' },
    { lat: 51.5074, lng: -0.1278, weight: 80, label: 'London Gateway' },
    { lat: 40.7128, lng: -74.0060, weight: 91, label: 'New York Financial Node' },
    { lat: 35.6762, lng: 139.6503, weight: 65, label: 'Tokyo Global Hub' },
    { lat: -33.8688, lng: 151.2093, weight: 58, label: 'Sydney Endpoint' },
  ];

  const scatter: GlobePoint[] = [];
  hubSeeds.forEach((hub) => {
    scatter.push(hub);
    for (let i = 0; i < 18; i++) {
      scatter.push({
        lat: Number((hub.lat + (Math.random() - 0.5) * 6).toFixed(4)),
        lng: Number((hub.lng + (Math.random() - 0.5) * 6).toFixed(4)),
        weight: Math.max(20, Math.min(100, Math.round(hub.weight + (Math.random() - 0.5) * 30))),
        label: `${hub.label} - Terminal #${100 + i}`,
      });
    }
  });

  for (let i = 0; i < 100; i++) {
    scatter.push({
      lat: Number(((Math.random() - 0.5) * 120).toFixed(4)),
      lng: Number(((Math.random() - 0.5) * 340).toFixed(4)),
      weight: Math.floor(Math.random() * 75) + 15,
      label: `Surveillance Node #${2000 + i}`,
    });
  }

  return scatter;
}

export const ThreatGlobeHeatmap = forwardRef<ThreatGlobeHeatmapRef, ThreatGlobeHeatmapProps>(({
  points,
  height = '100%',
  textureMode = 'satellite',
  activeLayers = 'hex',
  hexResolution = 4,
  autoRotate = false,
  onPointClick,
}, ref) => {
  const globeEl = useRef<GlobeMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: typeof window !== 'undefined' ? window.innerWidth : 1000,
    height: typeof window !== 'undefined' ? window.innerHeight - 80 : 700,
  });

  // Expose resetView via imperative handle
  useImperativeHandle(ref, () => ({
    resetView: () => {
      if (globeEl.current) {
        try {
          globeEl.current.pointOfView({ lat: 20.5937, lng: 78.9629, altitude: 2.2 }, 1000);
        } catch (err) {
          console.warn('Reset view error:', err);
        }
      }
    },
  }));

  // Validate points or fallback to rich mock data
  const globeData: GlobePoint[] = useMemo(() => {
    if (points && points.length > 0) {
      const valid: GlobePoint[] = [];
      points.forEach((p) => {
        const lat = Number(p.lat);
        const lng = Number(p.lng);
        const weight = Number(p.weight);
        if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          valid.push({
            lat,
            lng,
            weight: isNaN(weight) ? 60 : Math.max(10, Math.min(100, weight)),
            label: p.label || 'Active Surveillance Node',
            type: p.type || 'ATM',
            riskScore: p.riskScore,
          });
        }
      });
      if (valid.length > 0) return valid;
    }
    return generateDefaultGlobePoints();
  }, [points]);

  // Responsive dynamic measurement
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const w = Math.max(rect.width, 300);
        const h = Math.max(rect.height, 300);
        setDimensions({ width: w, height: h });
      } else if (typeof window !== 'undefined') {
        setDimensions({
          width: window.innerWidth,
          height: window.innerHeight - 80,
        });
      }
    };

    updateSize();
    const ro = new ResizeObserver(() => updateSize());
    if (containerRef.current) {
      ro.observe(containerRef.current);
    }

    window.addEventListener('resize', updateSize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  // Configure camera and controls safely
  useEffect(() => {
    const timer = setTimeout(() => {
      if (globeEl.current) {
        try {
          const controls = globeEl.current.controls();
          if (controls) {
            controls.autoRotate = autoRotate;
            controls.autoRotateSpeed = 0.6;
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
          }
          globeEl.current.pointOfView({ lat: 20.5937, lng: 78.9629, altitude: 2.2 }, 1000);
        } catch (err) {
          console.warn('Globe initial pointOfView warning:', err);
        }
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [autoRotate]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-[#0a0b0e] overflow-hidden flex items-center justify-center select-none"
      style={{
        width: '100%',
        height: typeof height === 'number' ? `${height}px` : height,
        minHeight: '400px',
      }}
    >
      {/* WebGL 3D Globe Component */}
      <Globe
        ref={globeEl}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="#0a0b0e"
        
        // 1. Satellite vs Dark Earth Texture
        globeImageUrl={
          textureMode === 'satellite'
            ? 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg'
            : 'https://unpkg.com/three-globe/example/img/earth-dark.jpg'
        }
        
        // 2. 3D Bump Mapping for Terrain Depth
        bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
        
        // 3. Atmosphere Glow
        atmosphereColor={textureMode === 'satellite' ? '#38bdf8' : '#00d664'}
        atmosphereAltitude={textureMode === 'satellite' ? 0.2 : 0.16}
        
        // 4. Hexagonal Binning Heatmap
        hexBinPointsData={activeLayers === 'points' ? [] : globeData}
        hexBinPointLat="lat"
        hexBinPointLng="lng"
        hexBinPointWeight="weight"
        hexBinResolution={hexResolution}
        hexMargin={0.15}
        hexTopColor={(d: any) => weightToColor(d.sumWeight)}
        hexSideColor={(d: any) => `${weightToColor(d.sumWeight)}dd`}
        hexAltitude={(d: any) => Math.min(0.55, Math.max(0.06, (d.sumWeight / 250) * 0.48))}
        hexBinMerge={true}
        onHexClick={(hex: any) => {
          if (hex && hex.points && hex.points.length > 0 && onPointClick) {
            onPointClick(hex.points[0]);
          }
        }}
        
        // 5. Point Markers (Optional Layer)
        pointsData={activeLayers === 'hex' ? [] : globeData}
        pointLat="lat"
        pointLng="lng"
        pointColor={(d: any) => weightToColor(d.weight)}
        pointAltitude={0.04}
        pointRadius={(d: any) => (d.weight > 80 ? 0.65 : 0.4)}
        pointLabel={(d: any) => `
          <div style="background: rgba(10,11,14,0.95); border: 1px solid #333; padding: 6px 10px; border-radius: 6px; font-family: monospace; font-size: 11px; color: #fff; box-shadow: 0 4px 14px rgba(0,0,0,0.6);">
            <div style="font-weight: bold; color: ${weightToColor(d.weight)}">${d.label || 'Node Point'}</div>
            <div style="color: #9ca3af; margin-top: 2px;">Risk Weight: ${Math.round(d.weight)}%</div>
          </div>
        `}
      />

      {/* Bottom Floating Legend Bar */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4 px-4 py-2 rounded-xl bg-[#0a0b0e]/92 backdrop-blur-md border border-gray-800 text-[11px] font-mono shadow-xl">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#FF2222] shadow-[0_0_8px_#FF2222]" />
          <span className="text-gray-200 font-semibold">Critical (&gt;80%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#FFB300] shadow-[0_0_8px_#FFB300]" />
          <span className="text-gray-200 font-semibold">High (&gt;50%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#00E5FF] shadow-[0_0_8px_#00E5FF]" />
          <span className="text-gray-200 font-semibold">Moderate</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#00FF66] shadow-[0_0_8px_#00FF66]" />
          <span className="text-gray-200 font-semibold">Normal</span>
        </div>
      </div>
    </div>
  );
});

export default ThreatGlobeHeatmap;
