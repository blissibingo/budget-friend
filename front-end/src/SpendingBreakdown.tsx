// the month's spending as a donut beside a ranked list of category bars

import { useMemo, useState } from 'react'

import type { Category } from './api'
import { categoryColor } from './categoryColor'
import { money } from './money'
import { round, UNCATEGORIZED, type CategorySpend } from './summary'


// categories drawn on their own before the rest fold into Other
const SHOWN_CATEGORIES = 5

const OTHER = 'other'

const OTHER_COLOR = 'var(--chart-other)'

type Slice = CategorySpend & { color: string; members?: CategorySpend[] }

// the largest categories, the rest folded into Other, Uncategorized last
function toSlices(byCategory: CategorySpend[], categories: Category[]): Slice[] {
  const byId = new Map(categories.map(category => [String(category.id), category]))
  const categorized = byCategory.filter(entry => entry.key !== UNCATEGORIZED)
  const uncategorized = byCategory.find(entry => entry.key === UNCATEGORIZED)

  const folds = categorized.length > SHOWN_CATEGORIES + 1
  const shown = folds ? categorized.slice(0, SHOWN_CATEGORIES) : categorized
  const slices: Slice[] = shown.map(entry => ({
    ...entry,
    color: categoryColor(byId.get(entry.key) ?? null),
  }))

  if (folds) {
    const members = categorized.slice(SHOWN_CATEGORIES)
    slices.push({
      key: OTHER,
      name: 'Other',
      total: round(members.reduce((sum, entry) => sum + entry.total, 0)),
      color: OTHER_COLOR,
      members,
    })
  }
  if (uncategorized) slices.push({ ...uncategorized, color: categoryColor(null) })
  return slices
}

const SIZE = 168
const THICKNESS = 20
const GAP = 2

function Donut({
  slices,
  total,
  active,
  onActivate,
}: {
  slices: Slice[]
  total: number
  active: Slice | null
  onActivate: (slice: Slice | null) => void
}) {
  const radius = (SIZE - THICKNESS) / 2
  const circumference = 2 * Math.PI * radius
  const lengths = slices.map(slice => (slice.total / total) * circumference)
  // where each slice's arc starts along the ring
  const starts = lengths.map((_, i) => lengths.slice(0, i).reduce((sum, length) => sum + length, 0))

  return (
    <figure
      aria-label="Spending by category"
      className="relative shrink-0"
      style={{ width: SIZE, height: SIZE }}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
        <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
          {slices.map((slice, i) => (
            <circle
              key={slice.key}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth={active?.key === slice.key ? THICKNESS + 6 : THICKNESS}
              strokeDasharray={`${Math.max(lengths[i] - GAP, 0)} ${circumference}`}
              strokeDashoffset={-starts[i]}
              onMouseEnter={() => onActivate(slice)}
              onMouseLeave={() => onActivate(null)}
            />
          ))}
        </g>
      </svg>
      <figcaption className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        {active ? (
          <>
            <span className="text-xs text-muted-foreground">{active.name}</span>
            <strong className="font-semibold tabular-nums">{money.format(active.total)}</strong>
            {active.members?.map(member => (
              <span key={member.key} className="text-[0.6875rem] text-muted-foreground">
                {member.name} {money.format(member.total)}
              </span>
            ))}
          </>
        ) : (
          <>
            <span className="text-xs text-muted-foreground">Spent</span>
            <strong className="text-2xl font-semibold tabular-nums">{money.format(total)}</strong>
          </>
        )}
      </figcaption>
    </figure>
  )
}

function RankedBars({
  slices,
  onActivate,
}: {
  slices: Slice[]
  onActivate: (slice: Slice | null) => void
}) {
  const largest = Math.max(...slices.map(slice => slice.total))

  return (
    <ul aria-label="Categories ranked by spending" className="grid flex-1 gap-2.5">
      {slices.map(slice => (
        <li
          key={slice.key}
          className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 rounded-sm text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          tabIndex={0}
          onMouseEnter={() => onActivate(slice)}
          onMouseLeave={() => onActivate(null)}
          onFocus={() => onActivate(slice)}
          onBlur={() => onActivate(null)}
        >
          <span className="truncate">{slice.name}</span>
          <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span
              className="block h-full rounded-full"
              style={{ width: `${(slice.total / largest) * 100}%`, backgroundColor: slice.color }}
            />
          </span>
          <span className="tabular-nums">{money.format(slice.total)}</span>
        </li>
      ))}
    </ul>
  )
}

function SpendingBreakdown({
  byCategory,
  categories,
  total,
}: {
  byCategory: CategorySpend[]
  categories: Category[]
  total: number
}) {
  const slices = useMemo(() => toSlices(byCategory, categories), [byCategory, categories])
  const [active, setActive] = useState<Slice | null>(null)

  return (
    <div className="flex flex-wrap items-center gap-8">
      <Donut slices={slices} total={total} active={active} onActivate={setActive} />
      <RankedBars slices={slices} onActivate={setActive} />
    </div>
  )
}

export default SpendingBreakdown
