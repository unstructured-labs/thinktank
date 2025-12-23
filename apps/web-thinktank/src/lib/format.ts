export const formatCost = (cost?: number | null) => (cost != null ? `$${cost.toFixed(4)}` : '—')

export const formatDuration = (durationMs?: number | null) =>
  durationMs != null ? `${(durationMs / 1000).toFixed(1)}s` : '—'

export const formatNumber = (value?: number | null) => {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US').format(value)
}

export const formatElapsed = (durationMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds}s`
}
