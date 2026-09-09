export interface WeeklyTrendPoint {
  day: string;
  risk: number;
}

export interface DashboardSummary {
  totalComplaints: number;
  highRiskZones: number;
  activeAlerts: number;
  atRiskAtms: number;
  risk_level_breakdown?: Record<string, number>;
  weekly_trend?: WeeklyTrendPoint[];
}

export interface RiskTrendPoint {
  date: string;
  risk_score: number;
  high_risk_predictions: number;
}

export interface TopPredictedLocation {
  prediction_id: string;
  location_id: string;
  location_name: string;
  risk_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  predicted_window: string;
}

export interface DashboardData {
  summary: DashboardSummary;
  risk_trend: RiskTrendPoint[];
  top_predicted_locations: TopPredictedLocation[];
}