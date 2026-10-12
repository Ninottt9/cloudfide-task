import { describe, it, expect } from 'vitest';
import { summarizeTodos } from '../src/features/todos/summary.ts';
import { todo } from './fixture.ts';

const make = (over: Partial<typeof todo>) => ({ ...todo, ...over });

describe('summarizeTodos', () => {
  it('returns zeros for no tasks', () => {
    expect(summarizeTodos([], '2026-10-12')).toEqual({
      total: 0, active: 0, completed: 0, overdue: 0, active_by_priority: { low: 0, medium: 0, high: 0 },
    });
  });
  it('counts active, completed and active tasks by priority', () => {
    const todos = [
      make({ id: 1, priority: 'high' }),
      make({ id: 2, priority: 'high' }),
      make({ id: 3, priority: 'low' }),
      make({ id: 4, priority: 'medium', completed: true }),
    ];
    expect(summarizeTodos(todos, '2026-10-01')).toEqual({
      total: 4, active: 3, completed: 1, overdue: 0, active_by_priority: { low: 1, medium: 0, high: 2 },
    });
  });
  it.each([
    ['due before today', '2026-10-11', false, 1],
    ['due today', '2026-10-12', false, 0],
    ['due after today', '2026-10-13', false, 0],
    ['no due date', null, false, 0],
    ['completed and past due', '2026-10-11', true, 0],
  ])('overdue: %s', (_name, due_date, completed, overdue) => {
    expect(summarizeTodos([make({ due_date, completed })], '2026-10-12').overdue).toBe(overdue);
  });
});
