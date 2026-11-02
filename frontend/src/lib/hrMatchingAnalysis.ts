import type { MatchingAnalysisComponent } from './employerApi';

export function analysisPercent(value: unknown): string | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? `${Math.round(value * 100)}%` : null;
}

export function analysisComponent(component?: MatchingAnalysisComponent, compatibility = false) {
  const available = component?.available === true && analysisPercent(component.score) !== null && analysisPercent(component.weight) !== null;
  return {
    score: available ? analysisPercent(component?.score) : null,
    weight: compatibility ? '0%' : analysisPercent(component?.weight),
    available,
    evidence: analysisTexts(component?.evidence),
  };
}

export function analysisTexts(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && !!item.trim()) : [];
}
