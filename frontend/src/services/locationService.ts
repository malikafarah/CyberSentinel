import { api } from './api';
import type { LocationItem } from '../types';

export interface LocationNode {
  id: string;
  name: string;
  type: string;
  riskScore: number;
  risk_score: number;
  risk_level: string;
  region: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  latitude: number;
  longitude: number;
  location_id: string;
  location_name: string;
  predicted_window?: string;
  location_metadata?: Record<string, any>;
}

function normalizeLocationRecord(loc: any): LocationNode {
  const coords = loc.geometry?.coordinates || [80.6480, 16.5062]; // [lng, lat]
  const lng = Number(loc.longitude ?? (coords.length === 2 ? coords[0] : 80.6480));
  const lat = Number(loc.latitude ?? (coords.length === 2 ? coords[1] : 16.5062));

  let score = loc.riskScore ?? loc.risk_score ?? 0;
  if (score > 0 && score <= 1.0) {
    score = Math.round(score * 100);
  } else {
    score = Math.round(score);
  }

  const locId = loc.location_id || loc.id || 'LOC-01';
  const locName = loc.location_name || loc.name || locId;
  const locType = loc.type || loc.location_metadata?.type || (locId.toUpperCase().includes('ATM') ? 'ATM' : 'Banking Hotspot');

  return {
    id: locId,
    name: locName,
    type: locType,
    riskScore: score,
    risk_score: score,
    risk_level: loc.risk_level || (score >= 80 ? 'CRITICAL' : score >= 50 ? 'HIGH' : 'LOW'),
    region: loc.region || 'Regional Corridor',
    coordinates: {
      lat,
      lng,
    },
    latitude: lat,
    longitude: lng,
    location_id: locId,
    location_name: locName,
    predicted_window: loc.predicted_window || '12:00–18:00',
    location_metadata: loc.location_metadata || {},
  };
}

export const locationService = {
  /**
   * Fetches physical locations (ATMs, banking hotspots) from /api/v1/locations/
   */
  getLocations: async (): Promise<LocationNode[]> => {
    try {
      const res = await api.get<{ status: string; count: number; data: any[] } | any[]>('/locations/');
      const rawList = Array.isArray(res) ? res : (res?.data || []);
      return rawList.map(normalizeLocationRecord);
    } catch (err) {
      console.warn('Failed to fetch /locations/, falling back to default seed nodes:', err);
      // Resilient fallback for offline mode
      return [
        {
          id: 'ATM-104',
          name: 'MG Road Branch ATM',
          type: 'ATM Terminal',
          riskScore: 92,
          risk_score: 92,
          risk_level: 'CRITICAL',
          region: 'Vijayawada',
          coordinates: { lat: 16.5062, lng: 80.6480 },
          latitude: 16.5062,
          longitude: 80.6480,
          location_id: 'ATM-104',
          location_name: 'MG Road Branch ATM',
        },
        {
          id: 'ATM-221',
          name: 'Benz Circle ATM Cluster',
          type: 'ATM Terminal',
          riskScore: 88,
          risk_score: 88,
          risk_level: 'CRITICAL',
          region: 'Vijayawada',
          coordinates: { lat: 16.5044, lng: 80.6558 },
          latitude: 16.5044,
          longitude: 80.6558,
          location_id: 'ATM-221',
          location_name: 'Benz Circle ATM Cluster',
        },
        {
          id: 'ATM-087',
          name: 'KPHB Colony ATM',
          type: 'ATM Terminal',
          riskScore: 78,
          risk_score: 78,
          risk_level: 'HIGH',
          region: 'Hyderabad',
          coordinates: { lat: 17.4933, lng: 78.3914 },
          latitude: 17.4933,
          longitude: 78.3914,
          location_id: 'ATM-087',
          location_name: 'KPHB Colony ATM',
        },
        {
          id: 'ATM-309',
          name: 'Gachibowli Financial District ATM',
          type: 'ATM Terminal',
          riskScore: 55,
          risk_score: 55,
          risk_level: 'MEDIUM',
          region: 'Hyderabad',
          coordinates: { lat: 17.4401, lng: 78.3489 },
          latitude: 17.4401,
          longitude: 78.3489,
          location_id: 'ATM-309',
          location_name: 'Gachibowli Financial District ATM',
        },
      ];
    }
  },

  /**
   * Alias list() method for consistency across codebase
   */
  list: async (): Promise<LocationItem[]> => {
    const nodes = await locationService.getLocations();
    return nodes.map((n) => ({
      id: n.id,
      location_id: n.location_id,
      location_name: n.location_name,
      region: n.region,
      geometry: {
        type: 'Point',
        coordinates: [n.coordinates.lng, n.coordinates.lat],
      },
      latitude: n.latitude,
      longitude: n.longitude,
      risk_score: n.riskScore,
      risk_level: n.risk_level as any,
      predicted_window: n.predicted_window,
      location_metadata: n.location_metadata,
    }));
  },

  get: async (locationId: string): Promise<LocationNode | null> => {
    try {
      const res = await api.get<{ status: string; data: any } | any>(`/locations/${encodeURIComponent(locationId)}`);
      const loc = res?.data || res;
      if (!loc) return null;
      return normalizeLocationRecord(loc);
    } catch {
      return null;
    }
  },
};
