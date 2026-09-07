import { api } from './api';
import type { Case } from '../types';
import { cases as mockCases } from '../mocks/data';

export const caseService = {
  /**
   * Fetches all dynamic cases from /api/v1/cases/
   */
  getCases: async (): Promise<Case[]> => {
    try {
      const data = await api.get<Case[]>('/cases/');
      if (Array.isArray(data) && data.length > 0) {
        return data.map((c: any) => ({
          ...c,
          id: c.id || (c._id ? String(c._id) : 'CYB-CASE'),
          title: c.title || c.summary || `Case #${c.id}`,
          summary: c.summary || c.title || 'Ongoing financial cyber-fraud investigation',
          status: c.status || 'ACTIVE',
          risk_level: c.risk_level || 'HIGH',
          complaints: Array.isArray(c.complaints) ? c.complaints : [],
          hotspot_ids: Array.isArray(c.hotspot_ids) ? c.hotspot_ids : [],
          notes: Array.isArray(c.notes) ? c.notes : [],
          timeline: Array.isArray(c.timeline) ? c.timeline : [],
        }));
      }
    } catch (err) {
      console.warn('Failed to load /cases/ from backend, falling back to seed mock data:', err);
    }
    return mockCases;
  },

  /**
   * Fetches a single case by ID
   */
  getCaseById: async (id: string): Promise<Case | undefined> => {
    try {
      const caseData = await api.get<Case>(`/cases/${encodeURIComponent(id)}`);
      if (caseData && (caseData.id || (caseData as any)._id)) {
        return {
          ...caseData,
          id: caseData.id || String((caseData as any)._id),
          title: caseData.title || caseData.summary || `Case #${caseData.id}`,
          summary: caseData.summary || caseData.title || '',
          status: caseData.status || 'ACTIVE',
          risk_level: caseData.risk_level || 'HIGH',
          complaints: Array.isArray(caseData.complaints) ? caseData.complaints : [],
          hotspot_ids: Array.isArray(caseData.hotspot_ids) ? caseData.hotspot_ids : [],
          notes: Array.isArray(caseData.notes) ? caseData.notes : [],
          timeline: Array.isArray(caseData.timeline) ? caseData.timeline : [],
        };
      }
    } catch {
      // Fallback
    }
    const found = mockCases.find((c) => c.id === id);
    return found;
  },

  /**
   * Alias for getCaseById
   */
  get: async (id: string): Promise<Case | undefined> => {
    return await caseService.getCaseById(id);
  },

  /**
   * Creates a new dynamic investigation case
   */
  createCase: async (caseData: {
    id?: string;
    title?: string;
    summary?: string;
    risk_level?: string;
    status?: string;
    complaints?: string[];
    hotspot_ids?: string[];
  }): Promise<any> => {
    const payload = {
      id: caseData.id || `CYB-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      title: caseData.title || caseData.summary || 'New Cyber Incident Case',
      summary: caseData.summary || caseData.title || 'Active investigation',
      risk_level: caseData.risk_level || 'HIGH',
      status: caseData.status || 'ACTIVE',
      complaints: caseData.complaints || [],
      hotspot_ids: caseData.hotspot_ids || [],
      notes: [`Case opened on ${new Date().toLocaleDateString()}`],
      timeline: [
        {
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          event: 'Case opened and assigned to intelligence desk',
          location: 'Command Center',
        },
      ],
      created_at: new Date().toISOString(),
    };

    return await api.post<any>('/cases/', payload);
  },

  /**
   * Updates an existing case (e.g. status, summary, risk_level)
   */
  updateCase: async (caseId: string, updateData: Partial<Case>): Promise<any> => {
    return await api.patch<any>(`/cases/${encodeURIComponent(caseId)}`, updateData);
  },

  /**
   * Appends an intelligence note to a case
   */
  addNote: async (caseId: string, note: string): Promise<Case | undefined> => {
    try {
      const updated = await api.post<Case>(`/cases/${encodeURIComponent(caseId)}/notes`, { note });
      if (updated) return updated;
    } catch {
      const found = mockCases.find((c) => c.id === caseId);
      if (found) {
        found.notes.push(note);
        return { ...found };
      }
    }
  },
};
