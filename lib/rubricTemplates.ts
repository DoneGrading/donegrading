/**
 * Rubric templates: save and load from localStorage per user (keyed by educator id or 'local').
 */
const KEY_PREFIX = 'dg_rubric_templates_';

export type RubricTemplate = {
  id: string;
  title: string;
  rubric: string;
  maxScore: number;
  createdAt: number;
};

function storageKey(userId: string): string {
  return `${KEY_PREFIX}${userId || 'local'}`;
}

export function getRubricTemplates(userId: string = 'local'): RubricTemplate[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRubricTemplate(
  userId: string,
  template: Omit<RubricTemplate, 'id' | 'createdAt'>
): RubricTemplate {
  const list = getRubricTemplates(userId);
  const newOne: RubricTemplate = {
    ...template,
    id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    createdAt: Date.now(),
  };
  list.unshift(newOne);
  const capped = list.slice(0, 20);
  localStorage.setItem(storageKey(userId), JSON.stringify(capped));
  return newOne;
}

export function deleteRubricTemplate(userId: string, id: string): void {
  const list = getRubricTemplates(userId).filter((t) => t.id !== id);
  localStorage.setItem(storageKey(userId), JSON.stringify(list));
}
