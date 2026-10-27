import { expect, test } from 'vitest'

import type { Category } from './api'
import { categoryColor } from './categoryColor'

function category(overrides: Partial<Category> & Pick<Category, 'id'>): Category {
  return { name: 'Groceries', user_id: null, color: null, excluded_from_spend: false, ...overrides }
}

test('a category with a stored colour renders in it', () => {
  expect(categoryColor(category({ id: 3, color: '#3b82f6' }))).toBe('#3b82f6')
})

test('a category without a stored colour takes the palette slot of its id', () => {
  expect(categoryColor(category({ id: 1 }))).toBe('var(--chart-1)')
  expect(categoryColor(category({ id: 3 }))).toBe('var(--chart-3)')
  expect(categoryColor(category({ id: 8 }))).toBe('var(--chart-8)')
})

test('palette slots wrap around past the last hue', () => {
  expect(categoryColor(category({ id: 9 }))).toBe('var(--chart-1)')
  expect(categoryColor(category({ id: 12 }))).toBe('var(--chart-4)')
})

test('uncategorized is neutral grey', () => {
  expect(categoryColor(null)).toBe('var(--chart-none)')
})
