import { Button } from '@thinktank/ui-library/components/button'
import { Textarea } from '@thinktank/ui-library/components/textarea'
import type { StageConfig, StageResult, StageStatus } from '../lib/types'

const statusStyles: Record<StageStatus, string> = {
  pending: 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-200',
  running:
    'bg-amber-50 text-amber-600 border border-amber-300 animate-pulse dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-400',
  complete: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200',
  error: 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-200',
}

type StageCardProps = {
  stage: StageConfig
  status?: StageStatus
  stageResults?: StageResult[]
  disabled?: boolean
  disablePrompts?: boolean
  onPromptChange: (id: string, value: string) => void
  onViewResult: (result: StageResult) => void
}

export const StageCard = ({
  stage,
  status,
  stageResults,
  disabled,
  disablePrompts,
  onPromptChange,
  onViewResult,
}: StageCardProps) => {
  const isDisabled = !stage.enabled
  const promptId = `stage-${stage.id}-prompt`

  const statusLabel = (value: StageStatus) => {
    switch (value) {
      case 'running':
        return 'in progress'
      case 'complete':
        return 'complete'
      case 'error':
        return 'error'
      default:
        return 'pending'
    }
  }

  return (
    <div
      className={`rounded-2xl border border-slate-200/70 bg-white/90 p-5 shadow-sm transition dark:border-zinc-700/40 dark:bg-zinc-950/70 ${
        isDisabled ? 'opacity-60 grayscale' : ''
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{stage.label}</h3>
            {status && (
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.05em] ${statusStyles[status]}`}
              >
                {status}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-zinc-400">
            {stage.id}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        {stageResults && stageResults.length > 0 && (
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 text-sm text-slate-600 dark:border-zinc-800/60 dark:bg-zinc-900/60 dark:text-zinc-300">
            <div className="grid gap-2">
              {stageResults.map((result) => (
                <div key={result.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-900 dark:text-white">
                    {result.agentLabel}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600 dark:text-zinc-300">
                      {result.response?.cost != null ? `$${result.response.cost.toFixed(4)}` : ''}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.05em] ${statusStyles[result.status]}`}
                    >
                      {statusLabel(result.status)}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 px-2 text-xs"
                      onClick={() => onViewResult(result)}
                      disabled={!result.output && !result.error}
                    >
                      View
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="grid gap-2">
          <label
            htmlFor={promptId}
            className="text-xs font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-zinc-400"
          >
            Prompt Instructions
          </label>
          <Textarea
            id={promptId}
            className="min-h-[140px] bg-white/90 dark:bg-zinc-900"
            value={stage.systemPrompt}
            onChange={(event) => onPromptChange(stage.id, event.target.value)}
            disabled={disabled || !stage.enabled || disablePrompts}
          />
        </div>
      </div>
    </div>
  )
}
