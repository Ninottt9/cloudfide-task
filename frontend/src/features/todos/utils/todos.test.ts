import { describe, expect, it } from 'vitest'
import { selectTodos, summarizeTodos } from './todos'
import type { Todo } from '../types'

const base: Todo = {
  id: 1,
  title: 'Sprint plan',
  description: '',
  priority: 'medium',
  completed: false,
  due_date: null,
  created_at: '2026-10-01T12:00:00Z',
  updated_at: '2026-10-01T12:00:00Z',
}

describe('selectTodos', () => {
  it('combines status with a case-insensitive search in the description', () => {
    const matching = { ...base, description: 'Discuss the API' }
    const todos = [
      matching,
      { ...matching, id: 2, completed: true },
      { ...base, id: 3 },
    ]
    expect(selectTodos(todos, 'active', ' api ', 'newest')).toEqual([matching])
  })

  it('sorts by priority without changing the source array', () => {
    const high: Todo = { ...base, id: 2, priority: 'high' }
    const todos = [base, high]
    expect(selectTodos(todos, 'all', '', 'priority')).toEqual([high, base])
    expect(todos).toEqual([base, high])
  })
})

describe('summarizeTodos', () => {
  it('counts active, completed and overdue tasks', () => {
    const todos = [
      { ...base, id: 1 },
      { ...base, id: 2, due_date: '2000-01-01' },
      { ...base, id: 3, completed: true, due_date: '2000-01-01' },
      { ...base, id: 4, due_date: '2999-01-01' },
    ]
    expect(summarizeTodos(todos)).toEqual({ active: 3, completed: 1, overdue: 1 })
  })

  it('returns zeros for an empty list', () => {
    expect(summarizeTodos([])).toEqual({ active: 0, completed: 0, overdue: 0 })
  })
})
