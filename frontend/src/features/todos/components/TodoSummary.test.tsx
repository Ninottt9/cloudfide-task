import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { TodoSummary } from './TodoSummary'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

it('renders nothing when there are no tasks', () => {
  const { container } = render(<TodoSummary todos={[]} />)
  expect(container).toBeEmptyDOMElement()
})

it('shows active and completed counts and hides overdue when zero', () => {
  render(<TodoSummary todos={[todoFixture, { ...todoFixture, id: 8, completed: true }]} />)
  expect(screen.getByRole('region', { name: 'Task summary' })).toBeInTheDocument()
  expect(screen.getByText('1 active')).toBeInTheDocument()
  expect(screen.getByText('1 completed')).toBeInTheDocument()
  expect(screen.queryByText(/overdue/)).not.toBeInTheDocument()
})

it('shows the overdue count when tasks are past due', () => {
  render(<TodoSummary todos={[{ ...todoFixture, due_date: '2000-01-01' }]} />)
  expect(screen.getByText('1 overdue')).toBeInTheDocument()
})
