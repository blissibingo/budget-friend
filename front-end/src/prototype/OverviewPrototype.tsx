// PROTOTYPE — throwaway. Three overview + transaction-row layouts for #30,
// switchable via ?variant=A|B|C, with ?neutral=zinc|stone for the base grey.

import { useEffect, useMemo, useState } from 'react'

import { summarize, type Summary } from '../summary'
import { CATEGORIES, TRANSACTIONS, UNCATEGORIZED_GREY } from './fakeData'
import type { Transaction } from '../api'
import './prototype.css'

const VARIANTS = [
  { key: 'A', name: 'Dashboard cards' },
  { key: 'B', name: 'Headline statement' },
  { key: 'C', name: 'Split pane' },
]
const NEUTRALS = ['zinc', 'stone']

const money = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' })
const whole = new Intl.NumberFormat('en-CA', {
  style: 'currency', currency: 'CAD', maximumFractionDigits: 0,
})

const PLACEHOLDER = 'Bank transaction'
const GROUPINGS = ['day', 'category']
const DONUT_SLICES = 5

type Slice = { key: string; name: string; total: number; color: string; members?: string[] }

const colorOf = new Map(CATEGORIES.map(c => [String(c.id), c.color ?? UNCATEGORIZED_GREY]))
const nameOf = new Map(CATEGORIES.map(c => [c.id, c.name]))

// the largest categories, the rest folded into Other, Uncategorized last
function slices(summary: Summary): Slice[] {
  const categorized = summary.byCategory.filter(e => e.key !== 'uncategorized')
  const uncategorized = summary.byCategory.find(e => e.key === 'uncategorized')
  const top = categorized.slice(0, DONUT_SLICES).map(e => ({ ...e, color: colorOf.get(e.key)! }))
  const rest = categorized.slice(DONUT_SLICES)
  const out: Slice[] = [...top]
  if (rest.length) {
    out.push({
      key: 'other',
      name: 'Other',
      total: rest.reduce((s, e) => s + e.total, 0),
      color: '#52525b',
      members: rest.map(e => `${e.name} ${money.format(e.total)}`),
    })
  }
  if (uncategorized) out.push({ ...uncategorized, color: UNCATEGORIZED_GREY })
  return out
}

function label(t: Transaction): string {
  return t.merchant === PLACEHOLDER ? t.description ?? PLACEHOLDER : t.merchant
}

// the description without its leading "Visa purchase -" style prefix
function detail(t: Transaction): string {
  if (t.merchant === PLACEHOLDER) return 'Bank transaction'
  const parts = (t.description ?? '').split(' - ')
  return parts.length > 1 ? parts.slice(0, -1).join(' · ') : t.description ?? ''
}

function byDay(transactions: Transaction[]): [string, Transaction[]][] {
  const days = new Map<string, Transaction[]>()
  for (const t of transactions) days.set(t.date, [...(days.get(t.date) ?? []), t])
  return [...days]
}

type CategoryGroup = {
  key: string; name: string; color: string; total: number; excluded: boolean; rows: Transaction[]
}

// spending categories largest first, then income and excluded, Uncategorized last
function byCategory(transactions: Transaction[]): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup>()
  for (const t of transactions) {
    const key = t.category_id === null ? 'uncategorized' : String(t.category_id)
    const cat = CATEGORIES.find(c => String(c.id) === key)
    const group = groups.get(key) ?? {
      key,
      name: cat?.name ?? 'Uncategorized',
      color: cat?.color ?? UNCATEGORIZED_GREY,
      total: 0,
      excluded: cat?.excluded_from_spend ?? false,
      rows: [],
    }
    group.total += Number(t.amount)
    group.rows.push(t)
    groups.set(key, group)
  }
  const rank = (g: CategoryGroup) =>
    g.key === 'uncategorized' ? 3 : g.excluded ? 2 : g.total > 0 ? 1 : 0
  return [...groups.values()].sort((a, b) => rank(a) - rank(b) || a.total - b.total)
}

function dayHeading(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-CA', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function signed(amount: string): string {
  const n = Number(amount)
  return n > 0 ? `+${money.format(n)}` : money.format(n)
}

function Donut({ data, total, size = 220, thickness = 26 }: {
  data: Slice[]; total: number; size?: number; thickness?: number
}) {
  const [hover, setHover] = useState<Slice | null>(null)
  const r = (size - thickness) / 2
  const circumference = 2 * Math.PI * r
  const gap = 2
  const lengths = data.map(s => (s.total / total) * circumference)
  const offsets = lengths.map((_, i) => lengths.slice(0, i).reduce((a, b) => a + b, 0))

  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {data.map((s, i) => (
              <circle
                key={s.key}
                cx={size / 2} cy={size / 2} r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={hover?.key === s.key ? thickness + 6 : thickness}
                strokeDasharray={`${Math.max(lengths[i] - gap, 0)} ${circumference}`}
                strokeDashoffset={-offsets[i]}
                onMouseEnter={() => setHover(s)}
                onMouseLeave={() => setHover(null)}
              />
          ))}
        </g>
      </svg>
      <div className="donut-centre">
        {hover ? (
          <>
            <span className="muted small">{hover.name}</span>
            <strong className="num">{money.format(hover.total)}</strong>
            {hover.members?.map(m => <span key={m} className="muted tiny">{m}</span>)}
          </>
        ) : (
          <>
            <span className="muted small">Spent</span>
            <strong className="num big">{whole.format(total)}</strong>
          </>
        )}
      </div>
    </div>
  )
}

function Chip({ categoryId }: { categoryId: number | null }) {
  if (categoryId === null) return <span className="chip chip-empty">Uncategorized</span>
  const color = colorOf.get(String(categoryId))
  return (
    <span className="chip" style={{ '--chip': color } as React.CSSProperties}>
      {nameOf.get(categoryId)}
    </span>
  )
}

function ReviewLine({ count }: { count: number }) {
  return (
    <a className="review-line" href="#review">
      <span className="dot" /> {count} transactions still need a category <span aria-hidden>→</span>
    </a>
  )
}

// A — four KPI cards, donut with legend, day-grouped list below
function VariantA({ summary, data }: { summary: Summary; data: Slice[] }) {
  return (
    <main className="page">
      <section className="kpis">
        <Kpi label="Spent" value={summary.spending} />
        <Kpi label="Income" value={summary.income} />
        <Kpi label="Net" value={summary.net} tone={summary.net >= 0 ? 'up' : 'down'} />
        <Kpi label="Saved" value={summary.saved} tone="up" />
      </section>

      <section className="panel donut-panel">
        <Donut data={data} total={summary.spending} />
        <ul className="legend">
          {data.map(s => (
            <li key={s.key}>
              <span className="swatch" style={{ background: s.color }} />
              <span>{s.name}</span>
              <span className="num muted">{Math.round((s.total / summary.spending) * 100)}%</span>
              <span className="num">{money.format(s.total)}</span>
            </li>
          ))}
        </ul>
      </section>
      <ReviewLine count={summary.uncategorizedCount} />

      <section className="panel">
        <h2 className="section-title">Transactions</h2>
        {byDay(TRANSACTIONS).map(([date, rows]) => (
          <div key={date}>
            <div className="day-header">
              <span>{dayHeading(date)}</span>
              <span className="num">{money.format(rows.reduce((s, t) => s + Number(t.amount), 0))}</span>
            </div>
            {rows.map(t => (
              <div key={t.id} className="row">
                <div className="row-main">
                  <span className="row-title">{label(t)}</span>
                  <span className="muted small">{detail(t)}</span>
                </div>
                <Chip categoryId={t.category_id} />
                <span className={`num amount ${Number(t.amount) > 0 ? 'pos' : ''}`}>{signed(t.amount)}</span>
              </div>
            ))}
          </div>
        ))}
      </section>
    </main>
  )
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'up' | 'down' }) {
  return (
    <div className="kpi">
      <span className="muted small">{label}</span>
      <strong className={`num kpi-value ${tone ?? ''}`}>{money.format(value)}</strong>
    </div>
  )
}

// B — a sentence headline, ranked bar legend beside a small donut, flat dense list
function VariantB({ summary, data }: { summary: Summary; data: Slice[] }) {
  const up = summary.net >= 0
  const max = Math.max(...data.map(s => s.total))
  return (
    <main className="page narrow">
      <section className="headline">
        <span className="muted">September 2026</span>
        <h1>
          You finished the month{' '}
          <span className={up ? 'up' : 'down'}>
            {up ? 'up' : 'down'} {money.format(Math.abs(summary.net))}
          </span>
        </h1>
        <p className="muted inline-figures">
          <span>Income <strong className="num">{money.format(summary.income)}</strong></span>
          <span>Spent <strong className="num">{money.format(summary.spending)}</strong></span>
          <span>Saved <strong className="num up">{money.format(summary.saved)}</strong></span>
        </p>
      </section>

      <section className="ranked">
        <Donut data={data} total={summary.spending} size={160} thickness={18} />
        <ul className="bars">
          {data.map(s => (
            <li key={s.key} title={s.members?.join('\n')}>
              <span>{s.name}</span>
              <span className="bar-track">
                <span className="bar" style={{ width: `${(s.total / max) * 100}%`, background: s.color }} />
              </span>
              <span className="num">{money.format(s.total)}</span>
            </li>
          ))}
        </ul>
      </section>
      <ReviewLine count={summary.uncategorizedCount} />

      <section>
        {byDay(TRANSACTIONS).map(([date, rows]) => (
          <div key={date} className="b-day">
            <div className="b-day-header muted small">
              <span>{dayHeading(date)}</span>
              <span className="num">{money.format(rows.reduce((s, t) => s + Number(t.amount), 0))}</span>
            </div>
            {rows.map(t => (
              <div key={t.id} className="b-row">
                <span className="b-bar" style={{ background: t.category_id ? colorOf.get(String(t.category_id)) : UNCATEGORIZED_GREY }} />
                <div className="row-main">
                  <span className="row-title">{label(t)}</span>
                  <span className="muted small">
                    {t.category_id ? nameOf.get(t.category_id) : 'Uncategorized'} · {detail(t)}
                  </span>
                </div>
                <span className={`num amount ${Number(t.amount) > 0 ? 'pos' : ''}`}>{signed(t.amount)}</span>
              </div>
            ))}
          </div>
        ))}
      </section>
    </main>
  )
}

// C — sticky summary column on the left, list fills the right
function VariantC({ summary, data }: { summary: Summary; data: Slice[] }) {
  const [groupBy, setGroupBy] = useParam('group', 'day')
  return (
    <main className="split">
      <aside className="split-side">
        <span className="muted small">September 2026</span>
        <dl className="stack">
          <div><dt>Net</dt><dd className={`num big ${summary.net >= 0 ? 'up' : 'down'}`}>{money.format(summary.net)}</dd></div>
          <div><dt>Income</dt><dd className="num">{money.format(summary.income)}</dd></div>
          <div><dt>Spent</dt><dd className="num">{money.format(summary.spending)}</dd></div>
          <div><dt>Saved</dt><dd className="num up">{money.format(summary.saved)}</dd></div>
        </dl>
        <Donut data={data} total={summary.spending} size={200} thickness={22} />
        <ul className="legend compact">
          {data.map(s => (
            <li key={s.key}>
              <span className="swatch" style={{ background: s.color }} />
              <span>{s.name}</span>
              <span className="num">{whole.format(s.total)}</span>
            </li>
          ))}
        </ul>
        <ReviewLine count={summary.uncategorizedCount} />
      </aside>

      <section className="split-main">
        <div className="group-toggle">
          <span className="muted small">Group by</span>
          {GROUPINGS.map(g => (
            <button key={g} className={groupBy === g ? 'on' : ''} onClick={() => setGroupBy(g)}>
              {g === 'day' ? 'Day' : 'Category'}
            </button>
          ))}
        </div>

        {groupBy === 'day'
          ? byDay(TRANSACTIONS).map(([date, rows]) => (
            <div key={date}>
              <div className="day-header sticky">
                <span>{dayHeading(date)}</span>
              </div>
              {rows.map(t => (
                <div key={t.id} className="row tall">
                  <span className="avatar" style={{ background: t.category_id ? colorOf.get(String(t.category_id)) : UNCATEGORIZED_GREY }}>
                    {label(t).charAt(0)}
                  </span>
                  <div className="row-main">
                    <span className="row-title">{label(t)}</span>
                    <span className="muted small">{detail(t)}</span>
                  </div>
                  <div className="row-end">
                    <span className={`num amount ${Number(t.amount) > 0 ? 'pos' : ''}`}>{signed(t.amount)}</span>
                    <Chip categoryId={t.category_id} />
                  </div>
                </div>
              ))}
            </div>
          ))
          : byCategory(TRANSACTIONS).map(group => (
            <div key={group.key}>
              <div className="cat-header sticky">
                <span className="swatch" style={{ background: group.color }} />
                <span className="cat-name">{group.name}</span>
                <span className="muted small">{group.rows.length} transactions</span>
                {group.excluded
                  ? <span className="muted small">not counted</span>
                  : <span className="num">{money.format(Math.abs(group.total))}</span>}
              </div>
              {group.rows.map(t => (
                <div key={t.id} className="row tall">
                  <span className="avatar" style={{ background: group.color }}>
                    {label(t).charAt(0)}
                  </span>
                  <div className="row-main">
                    <span className="row-title">{label(t)}</span>
                    <span className="muted small">{dayHeading(t.date)} · {detail(t)}</span>
                  </div>
                  <span className={`num amount ${Number(t.amount) > 0 ? 'pos' : ''}`}>{signed(t.amount)}</span>
                </div>
              ))}
            </div>
          ))}
      </section>
    </main>
  )
}

function useParam(name: string, fallback: string): [string, (value: string) => void] {
  const read = () => new URLSearchParams(window.location.search).get(name) ?? fallback
  const [value, setValue] = useState(read)
  const set = (next: string) => {
    const params = new URLSearchParams(window.location.search)
    params.set(name, next)
    window.history.replaceState(null, '', `?${params}`)
    setValue(next)
  }
  return [value, set]
}

function Switcher({ variant, setVariant, neutral, setNeutral }: {
  variant: string; setVariant: (v: string) => void
  neutral: string; setNeutral: (v: string) => void
}) {
  const index = Math.max(VARIANTS.findIndex(v => v.key === variant), 0)
  const step = (by: number) => setVariant(VARIANTS[(index + by + VARIANTS.length) % VARIANTS.length].key)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, [contenteditable]')) return
      if (e.key === 'ArrowLeft') step(-1)
      if (e.key === 'ArrowRight') step(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="switcher">
      <button onClick={() => step(-1)} aria-label="Previous variant">←</button>
      <span>{VARIANTS[index].key} ({VARIANTS[index].name})</span>
      <button onClick={() => step(1)} aria-label="Next variant">→</button>
      <span className="switcher-sep" />
      <button onClick={() => setNeutral(neutral === 'zinc' ? 'stone' : 'zinc')}>
        base: {neutral}
      </button>
    </div>
  )
}

export default function OverviewPrototype() {
  const [variant, setVariant] = useParam('variant', 'A')
  const [neutral, setNeutral] = useParam('neutral', 'zinc')
  const summary = useMemo(() => summarize(TRANSACTIONS, CATEGORIES), [])
  const data = useMemo(() => slices(summary), [summary])

  return (
    <div className={`proto neutral-${NEUTRALS.includes(neutral) ? neutral : 'zinc'}`}>
      <header className="proto-header">
        <strong>budget-friend</strong>
        <span className="month-control"><button>‹</button> September 2026 <button>›</button></span>
        <span className="header-actions"><button>Import</button><button>Categories</button></span>
        <nav className="tabs"><a className="active">Overview</a><a>Transactions</a><a>Review</a></nav>
      </header>
      {variant === 'B' ? <VariantB summary={summary} data={data} />
        : variant === 'C' ? <VariantC summary={summary} data={data} />
          : <VariantA summary={summary} data={data} />}
      {import.meta.env.DEV && (
        <Switcher variant={variant} setVariant={setVariant} neutral={neutral} setNeutral={setNeutral} />
      )}
    </div>
  )
}
