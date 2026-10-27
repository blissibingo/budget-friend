// the colour a category renders in everywhere: its stored colour, else the
// palette slot its id lands on; uncategorized is neutral grey

import type { Category } from './api'

// matches the --chart-1 … --chart-8 tokens in index.css
const PALETTE_SIZE = 8

export const UNCATEGORIZED_COLOR = 'var(--chart-none)'

export function categoryColor(category: Category | null): string {
  if (category === null) return UNCATEGORIZED_COLOR
  if (category.color) return category.color
  return `var(--chart-${((category.id - 1) % PALETTE_SIZE + PALETTE_SIZE) % PALETTE_SIZE + 1})`
}
