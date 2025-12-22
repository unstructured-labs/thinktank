import { Textarea } from '@thinktank/ui-library/components/textarea'

type ProblemInputProps = {
  value: string
  onChange: (value: string) => void
  onClearData: () => void
  disabled?: boolean
}

export const ProblemInput = ({ value, onChange, onClearData, disabled }: ProblemInputProps) => {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm dark:border-zinc-700/40 dark:bg-zinc-950/70">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-zinc-400">
            Problem Statement
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
            Define the Challenge
          </h2>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-zinc-400">
          <span>All data stored locally</span>
          <button
            type="button"
            onClick={onClearData}
            className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500 hover:border-slate-300 dark:border-zinc-700/60 dark:text-zinc-400 dark:hover:border-zinc-600"
          >
            Clear Data
          </button>
        </div>
      </div>
      <Textarea
        className="mt-4 min-h-[140px] bg-white/90 text-slate-900 dark:bg-zinc-900 dark:text-zinc-100"
        placeholder="Describe the hard problem you want to break apart. Include constraints, goals, and what success looks like."
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
    </div>
  )
}
