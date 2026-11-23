import type { AqiCategoryKey } from '../../shared/types';

export function classifyCpcbCategory(subIndex: number | null): AqiCategoryKey {
  if (subIndex === null || !Number.isFinite(subIndex)) return 'unavailable';
  if (subIndex <= 50) return 'good';
  if (subIndex <= 100) return 'satisfactory';
  if (subIndex <= 200) return 'moderate';
  if (subIndex <= 300) return 'poor';
  if (subIndex <= 400) return 'very_poor';
  return 'severe';
}
