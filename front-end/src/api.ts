// the single network boundary for the app — components call through here so
// tests can mock this module instead of the global fetch

const BASE_URL = '/api'

export type Category = {
  id: number
  name: string
  user_id: number | null
}

export type Transaction = {
  id: number
  amount: string
  date: string
  merchant: string
  description: string | null
  source: string
  occurrence: number // 1, 2, ... for rows a statement repeats verbatim
  created_at: string
  user_id: number
  category_id: number | null
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export type UploadResult = {
  period: string
  // absent on a credit card statement
  opening_balance?: number
  closing_balance?: number
  transactions: Transaction[]
  inserted_count: number
  skipped_count: number
}

// sends a request and unwraps the json body, throwing ApiError on a bad status
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, init)

  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }

  if (!res.ok) {
    const error =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : res.statusText
    throw new ApiError(res.status, error)
  }

  return body as T
}

// the fields PATCH /api/transactions/:id accepts
export type TransactionEdit = Partial<
  Pick<Transaction, 'merchant' | 'amount' | 'description' | 'date' | 'category_id'>
>

export async function getTransactions(
  period?: { month: number; year: number },
): Promise<Transaction[]> {
  const query = period ? `?month=${period.month}&year=${period.year}` : ''
  const body = await request<{ transactions: Transaction[] }>(
    `/transactions${query}`,
  )
  return body.transactions
}

export async function updateTransaction(
  id: number,
  edit: TransactionEdit,
): Promise<Transaction> {
  const body = await request<{ transaction: Transaction }>(`/transactions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(edit),
  })
  return body.transaction
}

export async function deleteTransaction(id: number): Promise<void> {
  await request<{ id: number }>(`/transactions/${id}`, { method: 'DELETE' })
}

export async function getCategories(): Promise<Category[]> {
  const body = await request<{ categories: Category[] }>('/categories')
  return body.categories
}

// posts the pdf and source as multipart form data
export async function uploadStatement(
  pdf: File,
  source: string,
): Promise<UploadResult> {
  const form = new FormData()
  form.append('source', source)
  form.append('pdf', pdf)

  return request<UploadResult>('/upload', { method: 'POST', body: form })
}
