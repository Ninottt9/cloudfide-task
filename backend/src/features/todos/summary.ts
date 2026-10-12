import type { Todo, TodoSummary } from './types.js';

// `today` is a calendar date (YYYY-MM-DD); a task is overdue when it is active and due before today.
export function summarizeTodos(todos: Todo[], today: string): TodoSummary {
  const summary: TodoSummary = {
    total: todos.length, active: 0, completed: 0, overdue: 0,
    active_by_priority: { low: 0, medium: 0, high: 0 },
  };
  for (const todo of todos) {
    if (todo.completed) {
      summary.completed += 1;
      continue;
    }
    summary.active += 1;
    summary.active_by_priority[todo.priority] += 1;
    if (todo.due_date !== null && todo.due_date < today) summary.overdue += 1;
  }
  return summary;
}
