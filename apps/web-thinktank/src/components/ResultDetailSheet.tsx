import { Button } from '@thinktank/ui-library/components/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@thinktank/ui-library/components/sheet'
import { toast } from '@thinktank/ui-library/components/sonner'
import { Switch } from '@thinktank/ui-library/components/switch'
import { formatCost, formatDuration, formatNumber } from '../lib/format'
import type { FinalResult, StageResult } from '../lib/types'
import { Markdown } from './Markdown'

type ResultDetailSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  result: StageResult | FinalResult | null
  title: string
  subtitle?: string
  viewAsText: boolean
  onViewAsTextChange: (value: boolean) => void
  toggleId: string
}

export const ResultDetailSheet = ({
  open,
  onOpenChange,
  result,
  title,
  subtitle,
  viewAsText,
  onViewAsTextChange,
  toggleId,
}: ResultDetailSheetProps) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        {result && (
          <div className="space-y-6">
            <SheetHeader>
              <SheetTitle>{title}</SheetTitle>
              {subtitle && (
                <SheetDescription className="font-mono text-sky-700 dark:text-sky-300">
                  {subtitle}
                </SheetDescription>
              )}
            </SheetHeader>

            <div className="grid gap-3 text-sm text-slate-600 dark:text-zinc-300 md:grid-cols-3">
              <div>
                <span className="font-semibold text-slate-800 dark:text-zinc-100">Cost</span>
                <div>{formatCost(result.response?.cost)}</div>
              </div>
              <div>
                <span className="font-semibold text-slate-800 dark:text-zinc-100">Tokens</span>
                <div>{formatNumber(result.response?.usage?.total_tokens ?? null)}</div>
              </div>
              <div>
                <span className="font-semibold text-slate-800 dark:text-zinc-100">Duration</span>
                <div>{formatDuration(result.durationMs)}</div>
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (result.output) {
                      navigator.clipboard.writeText(result.output)
                      toast.success('Response copied')
                    }
                  }}
                >
                  Copy Response
                </Button>
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-zinc-300">
                  <span>{viewAsText ? 'View as Markdown' : 'View as Text'}</span>
                  <label className="sr-only" htmlFor={toggleId}>
                    Toggle response view
                  </label>
                  <Switch
                    id={toggleId}
                    checked={viewAsText}
                    onCheckedChange={onViewAsTextChange}
                    aria-label="Toggle response view"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 dark:border-zinc-800/60 dark:bg-zinc-900/60">
              {result.error ? (
                <p className="text-sm text-rose-600 dark:text-rose-400">{result.error}</p>
              ) : result.output ? (
                viewAsText ? (
                  <div className="whitespace-pre-wrap text-sm text-slate-800 dark:text-zinc-100">
                    {result.output}
                  </div>
                ) : (
                  <Markdown
                    content={result.output}
                    className="text-sm text-slate-800 dark:text-zinc-100"
                  />
                )
              ) : (
                <p className="text-sm text-slate-500 dark:text-zinc-400">No output yet.</p>
              )}
            </div>

            <div className="grid gap-4">
              <details className="rounded-xl border border-slate-100 bg-white/80 px-4 py-3 dark:border-zinc-800/60 dark:bg-zinc-950/60">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-zinc-200">
                  Request payload
                </summary>
                <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-950/5 p-3 text-[11px] text-slate-700 dark:bg-zinc-900/70 dark:text-zinc-200">
                  {JSON.stringify(result.request, null, 2)}
                </pre>
              </details>
              <details className="rounded-xl border border-slate-100 bg-white/80 px-4 py-3 dark:border-zinc-800/60 dark:bg-zinc-950/60">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-zinc-200">
                  Response metadata
                </summary>
                <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-950/5 p-3 text-[11px] text-slate-700 dark:bg-zinc-900/70 dark:text-zinc-200">
                  {JSON.stringify(result.response, null, 2)}
                </pre>
              </details>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
