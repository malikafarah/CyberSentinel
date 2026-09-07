import { api } from './api';
import type { Complaint } from '../types';

export const complaintService = {
  /**
   * Fetch list of complaints with optional region and crime category filters
   */
  getComplaints: async (region?: string, crimeCategory?: string): Promise<Complaint[]> => {
    const params: Record<string, string> = {};
    if (region) params.region = region;
    if (crimeCategory) params.crime_category = crimeCategory;

    const data = await api.get<any[]>('/complaints/', params);
    if (!Array.isArray(data)) return [];
    return data.map((c: any) => ({
      ...c,
      id: c.id || c.complaint_id || (c._id ? String(c._id) : 'C000'),
      complaint_id: c.complaint_id || c.id,
      timestamp: c.timestamp || c.reported_at || new Date().toISOString(),
      amount: Number(c.amount || 0),
    }));
  },

  /**
   * Fetch single complaint by ID
   */
  getComplaintById: async (id: string): Promise<Complaint> => {
    const c = await api.get<any>(`/complaints/${encodeURIComponent(id)}`);
    return {
      ...c,
      id: c.id || c.complaint_id || (c._id ? String(c._id) : id),
      complaint_id: c.complaint_id || c.id || id,
      timestamp: c.timestamp || c.reported_at || new Date().toISOString(),
      amount: Number(c.amount || 0),
    };
  },

  /**
   * Log / create a new complaint
   */
  createComplaint: async (data: Partial<Complaint>): Promise<any> => {
    return await api.post<any>('/complaints/', data);
  },
};
