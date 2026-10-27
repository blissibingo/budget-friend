import { useId, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { uploadStatement, type UploadResult } from './api'

// selectable statement sources
const SOURCES = [
  { value: 'rbc_debit', label: 'RBC debit' },
  { value: 'rbc_credit', label: 'RBC credit' },
]

type Props = {
  onUploaded?: (result: UploadResult) => void
}

function UploadStatement({ onUploaded }: Props) {
  const fileInputId = useId()
  const sourceInputId = useId()

  const [file, setFile] = useState<File | null>(null)
  const [source, setSource] = useState(SOURCES[0].value)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!file || uploading) return

    // clears the previous outcome
    setResult(null)
    setError(null)
    setUploading(true)

    try {
      const uploaded = await uploadStatement(file, source)
      setResult(uploaded)
      onUploaded?.(uploaded)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-1.5">
        <label htmlFor={fileInputId} className="text-sm font-medium">Statement PDF</label>
        <input
          id={fileInputId}
          type="file"
          accept="application/pdf"
          className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-secondary file:px-3 file:py-1 file:text-sm file:text-foreground"
          onChange={event => setFile(event.target.files?.[0] ?? null)}
        />
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={sourceInputId} className="text-sm font-medium">Source</label>
        <select
          id={sourceInputId}
          value={source}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          onChange={event => setSource(event.target.value)}
        >
          {SOURCES.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" className="justify-self-start" disabled={!file || uploading}>
        {uploading ? 'Uploading…' : 'Upload'}
      </Button>

      {/* always-mounted live regions for the upload outcome */}
      <p role="status" className="text-sm tabular-nums">
        {result &&
          `${result.inserted_count} imported, ${result.skipped_count} skipped as duplicates`}
      </p>

      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    </form>
  )
}

export default UploadStatement
