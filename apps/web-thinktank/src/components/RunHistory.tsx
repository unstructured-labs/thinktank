import type { PipelineRun } from '../lib/types'

const formatTimestamp = (value: string) => {
  const date = new Date(value)
  return date.toLocaleString()
}

type RunHistoryProps = {
  runs: PipelineRun[]
  selectedRunId?: string
  onSelect: (runId: string) => void
  onClear: () => void
  showClear?: boolean
}

export const RunHistory = ({
  runs,
  selectedRunId,
  onSelect,
  onClear,
  showClear = true,
}: RunHistoryProps) => {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-5 shadow-sm dark:border-zinc-700/40 dark:bg-zinc-950/70">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-zinc-400">
            Run History
          </p>
          <h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
            Previous runs
          </h3>
        </div>
        {showClear && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.05em] text-slate-500 hover:border-slate-300 dark:border-zinc-700/60 dark:text-zinc-400 dark:hover:border-zinc-600"
          >
            Clear
          </button>
        )}
      </div>
      <div className="mt-4 space-y-2">
        {runs.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-zinc-400">No runs yet.</p>
        ) : (
          runs.map((run) => (
            <button
              key={run.id}
              type="button"
              onClick={() => onSelect(run.id)}
              className={`w-full rounded-xl border px-3 py-3 text-left text-sm transition ${
                run.id === selectedRunId
                  ? 'border-slate-300 bg-slate-100 text-slate-900 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-100'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-zinc-800/50 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-700/60'
              }`}
            >
              <div className="font-semibold">
                {run.problem.trim().slice(0, 80) || 'Untitled problem'}
              </div>
              <div
                className={`mt-1 text-xs ${
                  run.id === selectedRunId
                    ? 'text-slate-500 dark:text-zinc-500'
                    : 'text-slate-500 dark:text-zinc-400'
                }`}
              >
                {formatTimestamp(run.createdAt)} · {run.stages.length} stages
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
