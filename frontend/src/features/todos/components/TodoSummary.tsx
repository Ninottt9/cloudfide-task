import { Text } from '../../../design-system'
import type { Todo } from '../types'
import { summarizeTodos } from '../utils/todos'

export function TodoSummary({ todos }: { todos: Todo[] }) {
  if (todos.length === 0) return null
  const { active, completed, overdue } = summarizeTodos(todos)
  return (
    <section className="row compact" aria-label="Task summary">
      <Text muted>{active} active</Text>
      <Text muted>{completed} completed</Text>
      {overdue > 0 && <Text>{overdue} overdue</Text>}
    </section>
  )
}
