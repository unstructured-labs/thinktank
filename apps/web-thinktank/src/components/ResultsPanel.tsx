import { Button } from '@thinktank/ui-library/components/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@thinktank/ui-library/components/sheet'
import { toast } from '@thinktank/ui-library/components/sonner'
import { useState } from 'react'
import type { PipelineRun, StageResult } from '../lib/types'
import { Markdown } from './Markdown'

const statusStyles: Record<NonNullable<StageResult['status']>, string> = {
  pending: 'border-slate-200 text-slate-500 dark:border-zinc-600 dark:text-zinc-300',
  running:
    'border-amber-300 text-amber-600 bg-amber-50 animate-pulse dark:border-amber-400 dark:text-amber-300 dark:bg-amber-950/40',
  complete: 'border-emerald-400 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300',
  error: 'border-rose-300 text-rose-700 dark:border-rose-400 dark:text-rose-300',
}

const formatCost = (cost?: number | null) => (cost != null ? `$${cost.toFixed(4)}` : '—')

const formatDuration = (durationMs?: number) =>
  durationMs != null ? `${(durationMs / 1000).toFixed(1)}s` : '—'

const formatNumber = (value?: number | null) => {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US').format(value)
}

const getTotalCost = (run: PipelineRun) => {
  const stageCost = run.stages.reduce((acc, stage) => acc + (stage.response?.cost ?? 0), 0)
  const finalCost = run.final?.response?.cost ?? 0
  return stageCost + finalCost
}

const getTotalTokens = (run: PipelineRun) => {
  const stageTokens = run.stages.reduce(
    (acc, stage) => acc + (stage.response?.usage?.total_tokens ?? 0),
    0,
  )
  const finalTokens = run.final?.response?.usage?.total_tokens ?? 0
  return stageTokens + finalTokens
}

type ResultsPanelProps = {
  run?: PipelineRun
}

export const ResultsPanel = ({ run }: ResultsPanelProps) => {
  const [finalSheetOpen, setFinalSheetOpen] = useState(false)
  if (!run) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-6 text-sm text-slate-500 dark:border-zinc-700 dark:bg-zinc-950/70 dark:text-zinc-400">
        Run the pipeline to see stage outputs, costs, and metadata.
      </div>
    )
  }

  const hasCost =
    run.stages.some((stage) => stage.response?.cost != null) || !!run.final?.response?.cost
  const totalCost = hasCost ? getTotalCost(run) : null
  const hasTokens =
    run.stages.some((stage) => stage.response?.usage?.total_tokens != null) ||
    !!run.final?.response?.usage?.total_tokens
  const totalTokens = hasTokens ? getTotalTokens(run) : null

  return (
    <div className="space-y-4">
      <details className="rounded-2xl border border-slate-200/70 bg-white/90 p-5 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-950/70">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-zinc-200">
          Problem
        </summary>
        <div className="mt-3 whitespace-pre-wrap text-sm text-slate-700 dark:text-zinc-200">
          {run.problem}
        </div>
      </details>

      <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-5 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-950/70">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-zinc-400">
              Response summary data
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
              {totalCost != null ? `$${totalCost.toFixed(4)}` : '—'}
            </h3>
          </div>
          <div className="text-sm text-slate-600 dark:text-zinc-300">
            Total tokens:{' '}
            <span className="font-semibold text-slate-900 dark:text-white">
              {formatNumber(totalTokens)}
            </span>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-500 dark:text-zinc-400">
          OpenRouter returns usage and cost when supported by the model.
        </p>
      </div>

      <details
        open
        className="rounded-2xl border border-slate-200/70 bg-white/90 p-5 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-950/70"
      >
        <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-zinc-200">
          Final Response
        </summary>
        {run.final ? (
          <div className="mt-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Final review • {run.final.agentLabel ?? run.final.modelId}
                </h3>
              </div>
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
                  statusStyles[run.final.status]
                }`}
              >
                {run.final.status}
              </span>
            </div>

            <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-3 dark:text-zinc-300">
              <div>
                <span className="font-semibold text-slate-800 dark:text-zinc-100">Cost</span>
                <div>{formatCost(run.final.response?.cost)}</div>
              </div>
              <div>
                <span className="font-semibold text-slate-800 dark:text-zinc-100">Tokens</span>
                <div>{formatNumber(run.final.response?.usage?.total_tokens ?? null)}</div>
              </div>
              <div>
                <span className="font-semibold text-slate-800 dark:text-zinc-100">Duration</span>
                <div>{formatDuration(run.final.durationMs)}</div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
              {run.final.error ? (
                <p className="text-sm text-rose-600 dark:text-rose-400">{run.final.error}</p>
              ) : run.final.output ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setFinalSheetOpen(true)}>
                    View Full Response
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (run.final?.output) {
                        navigator.clipboard.writeText(run.final.output)
                        toast.success('Response copied')
                      }
                    }}
                  >
                    Copy Response
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-zinc-400">No output yet.</p>
              )}
            </div>

            <details className="mt-4 rounded-xl border border-slate-100 bg-white/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/60">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-zinc-200">
                Request + response metadata
              </summary>
              <div className="mt-3 grid gap-3 text-xs text-slate-600 dark:text-zinc-300">
                <div>
                  <div className="font-semibold text-slate-700 dark:text-zinc-200">
                    Request payload
                  </div>
                  <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-950/5 p-3 text-[11px] text-slate-700 dark:bg-zinc-900/70 dark:text-zinc-200">
                    {JSON.stringify(run.final.request, null, 2)}
                  </pre>
                </div>
                <div>
                  <div className="font-semibold text-slate-700 dark:text-zinc-200">
                    Response metadata
                  </div>
                  <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-950/5 p-3 text-[11px] text-slate-700 dark:bg-zinc-900/70 dark:text-zinc-200">
                    {JSON.stringify(run.final.response, null, 2)}
                  </pre>
                </div>
              </div>
            </details>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500 dark:text-zinc-400">No output yet.</p>
        )}
      </details>
      <Sheet
        open={finalSheetOpen}
        onOpenChange={(open) => {
          setFinalSheetOpen(open)
        }}
      >
        <SheetContent>
          {run.final && (
            <div className="space-y-6">
              <SheetHeader>
                <SheetTitle>Final review • {run.final.agentLabel ?? run.final.modelId}</SheetTitle>
                <SheetDescription className="font-mono text-sky-700 dark:text-sky-300">
                  {run.final.modelId}
                </SheetDescription>
              </SheetHeader>

              <div className="grid gap-3 text-sm text-slate-600 dark:text-zinc-300 md:grid-cols-3">
                <div>
                  <span className="font-semibold text-slate-800 dark:text-zinc-100">Cost</span>
                  <div>{formatCost(run.final.response?.cost)}</div>
                </div>
                <div>
                  <span className="font-semibold text-slate-800 dark:text-zinc-100">Tokens</span>
                  <div>{formatNumber(run.final.response?.usage?.total_tokens ?? null)}</div>
                </div>
                <div>
                  <span className="font-semibold text-slate-800 dark:text-zinc-100">Duration</span>
                  <div>{formatDuration(run.final.durationMs)}</div>
                </div>
              </div>

              <div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (run.final?.output) {
                      navigator.clipboard.writeText(run.final.output)
                      toast.success('Response copied')
                    }
                  }}
                >
                  Copy Full Response
                </Button>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                {run.final.error ? (
                  <p className="text-sm text-rose-600 dark:text-rose-400">{run.final.error}</p>
                ) : run.final.output ? (
                  <Markdown
                    content={run.final.output}
                    className="text-sm text-slate-800 dark:text-zinc-100"
                  />
                ) : (
                  <p className="text-sm text-slate-500 dark:text-zinc-400">No output yet.</p>
                )}
              </div>

              <div className="grid gap-4">
                <details className="rounded-xl border border-slate-100 bg-white/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-zinc-200">
                    Request payload
                  </summary>
                  <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-950/5 p-3 text-[11px] text-slate-700 dark:bg-zinc-900/70 dark:text-zinc-200">
                    {JSON.stringify(run.final.request, null, 2)}
                  </pre>
                </details>
                <details className="rounded-xl border border-slate-100 bg-white/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-zinc-200">
                    Response metadata
                  </summary>
                  <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-950/5 p-3 text-[11px] text-slate-700 dark:bg-zinc-900/70 dark:text-zinc-200">
                    {JSON.stringify(run.final.response, null, 2)}
                  </pre>
                </details>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
