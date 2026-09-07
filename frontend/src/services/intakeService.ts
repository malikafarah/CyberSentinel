import { api } from './api';

export interface ExtractedEntities {
  upis: string[];
  phones: string[];
  accounts: string[];
}

export interface IntakeResponse {
  status: string;
  message?: string;
  entities?: ExtractedEntities;
  extracted_identifiers?: {
    upi_ids: string[];
    phone_numbers: string[];
    account_numbers: string[];
  };
  seed_nodes_updated_count?: number;
  seed_nodes?: Array<{
    node_id: string;
    identifier: string;
    status: string;
    type: string;
    riskScore: number;
  }>;
}

export const intakeService = {
  extractComplaint: async (text: string): Promise<ExtractedEntities> => {
    try {
      const res = await api.post<IntakeResponse>('/intake/extract', { text });
      if (res.entities) {
        return {
          upis: res.entities.upis || [],
          phones: res.entities.phones || [],
          accounts: res.entities.accounts || [],
        };
      }
      if (res.extracted_identifiers) {
        return {
          upis: res.extracted_identifiers.upi_ids || [],
          phones: res.extracted_identifiers.phone_numbers || [],
          accounts: res.extracted_identifiers.account_numbers || [],
        };
      }
      return { upis: [], phones: [], accounts: [] };
    } catch {
      // Fallback to complaint endpoint
      const res = await api.post<IntakeResponse>('/intake/complaint', { text });
      return {
        upis: res.entities?.upis || res.extracted_identifiers?.upi_ids || [],
        phones: res.entities?.phones || res.extracted_identifiers?.phone_numbers || [],
        accounts: res.entities?.accounts || res.extracted_identifiers?.account_numbers || [],
      };
    }
  },

  seedVictimNodes: async (entities: ExtractedEntities): Promise<any> => {
    try {
      return await api.post('/intake/seed-victims', { entities });
    } catch {
      return await api.post('/graph/seed-victims', { entities });
    }
  },

  processComplaint: async (text: string, reported_by: string = 'Investigator'): Promise<IntakeResponse> => {
    return await api.post<IntakeResponse>('/intake/complaint', { text, reported_by });
  },
};
