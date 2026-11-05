import type { AnalysisImprovementAction } from '@/types/agent/multi-persona';
export interface CanvasReviewAnnotations {
  enabled: boolean;
  scanning: boolean;
  reviewKey: string;
  frameId?: string;
  showHighlights?: boolean;
  issues: AnalysisImprovementAction[];
  activeIssueId: string | null;
  refresh?: number;
}
export interface CanvasAnnotationStatus {
  mapped: number;
  pageLevel: number;
  error?: string;
}
