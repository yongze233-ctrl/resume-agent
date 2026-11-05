import type { AnalysisImprovementAction } from '@/types/agent/multi-persona';
import { plainText } from './reviewModel';

export type PaperRect = { x: number; y: number; width: number; height: number };
export type DesignSnapshot = {
  image: string;
  width: number;
  height: number;
  nodes: Array<PaperRect & { id: string; type: string; text?: string }>;
};
export function snapshotIssueRect(
  snapshot: DesignSnapshot,
  issue: AnalysisImprovementAction,
): PaperRect | null {
  for (const evidence of issue.evidence) {
    const quote = plainText(evidence.quote);
    if (quote.length < 4) continue;
    const matches = snapshot.nodes.filter(
      (node) =>
        node.type === 'TEXT' &&
        node.text &&
        (plainText(node.text).includes(quote) ||
          (plainText(node.text).length >= 8 &&
            quote.includes(plainText(node.text)))),
    );
    if (!matches.length) continue;
    const x = Math.min(...matches.map((node) => node.x));
    const y = Math.min(...matches.map((node) => node.y));
    return {
      x,
      y,
      width: Math.max(...matches.map((node) => node.x + node.width)) - x,
      height: Math.max(...matches.map((node) => node.y + node.height)) - y,
    };
  }
  return null;
}
