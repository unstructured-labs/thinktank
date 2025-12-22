import { Button } from '@thinktank/ui-library/components/button'
import { Input } from '@thinktank/ui-library/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@thinktank/ui-library/components/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@thinktank/ui-library/components/sheet'
import { Toaster } from '@thinktank/ui-library/components/sonner'
import { Switch } from '@thinktank/ui-library/components/switch'
import { OPENROUTER_MODELS } from '@thinktank/utils/openrouter-models'
import { Loader2, Moon, Play, RotateCcw, Sun } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Markdown } from './components/Markdown'
import { ProblemInput } from './components/ProblemInput'
import { ResultsPanel } from './components/ResultsPanel'
import { RunHistory } from './components/RunHistory'
import { StageCard } from './components/StageCard'
import {
  AGENT_OPTIONS,
  DEFAULT_AGENT_MODEL_IDS,
  DEFAULT_BASE_URL,
  DEFAULT_REVIEW_MODEL_ID,
  DEFAULT_STAGES,
  DEFAULT_SYNTHESIS_MODEL_ID,
} from './data/pipeline'
import { requestStage } from './lib/openrouter'
import { clearStoredState, loadStoredState, saveStoredState } from './lib/storage'
import type { PipelineRun, StageConfig, StageResult, StageStatus, StoredState } from './lib/types'

const MAX_RUNS = 20
const DEFAULT_RETRY_THRESHOLD = 3

const cloneDefaultStages = () => DEFAULT_STAGES.map((stage) => ({ ...stage }))

const createRunId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `run_${Date.now()}`
}

const updateRunStages = (
  runs: PipelineRun[],
  runId: string,
  stageResultId: string,
  updater: (stage: StageResult) => StageResult,
) =>
  runs.map((run) => {
    if (run.id !== runId) return run
    return {
      ...run,
      stages: run.stages.map((stage) => (stage.id === stageResultId ? updater(stage) : stage)),
    }
  })

const updateRunFinal = (
  runs: PipelineRun[],
  runId: string,
  updater: (final: NonNullable<PipelineRun['final']>) => NonNullable<PipelineRun['final']>,
) =>
  runs.map((run) => {
    if (run.id !== runId || !run.final) return run
    return {
      ...run,
      final: updater(run.final),
    }
  })

const MODEL_OPTIONS = OPENROUTER_MODELS.map((model) => ({
  id: model.id,
  label: model.name,
  description: model.description,
}))

const getAgentLabel = (modelId: string) =>
  MODEL_OPTIONS.find((option) => option.id === modelId)?.label ??
  AGENT_OPTIONS.find((option) => option.modelId === modelId)?.label ??
  modelId

const getStageStatus = (results: StageResult[]): StageStatus | undefined => {
  if (results.length === 0) return undefined
  if (results.some((result) => result.status === 'error')) return 'error'
  if (results.some((result) => result.status === 'running')) return 'running'
  if (results.every((result) => result.status === 'complete')) return 'complete'
  return 'pending'
}

const isMultiAgentStage = (stageId: string) => stageId === 'planning' || stageId === 'solution'

const getRequestCount = (enabledStages: StageConfig[], agentCount: number) =>
  enabledStages.reduce((count, stage) => count + (isMultiAgentStage(stage.id) ? agentCount : 1), 0)

const normalizeStoredState = (state: StoredState | null): StoredState | null => {
  if (!state) return null

  const normalizedRuns =
    state.runs?.map((run) => ({
      ...run,
      stages: run.stages.map((stage, index) => ({
        ...stage,
        id: stage.id ?? `${stage.stageId}:${stage.modelId}:${index}`,
        agentLabel: stage.agentLabel ?? getAgentLabel(stage.modelId),
      })),
      final: run.final
        ? {
            ...run.final,
            id: run.final.id ?? 'final',
            agentLabel: run.final.agentLabel ?? getAgentLabel(run.final.modelId),
          }
        : undefined,
    })) ?? []

  return {
    ...state,
    agentModelIds:
      state.agentModelIds && state.agentModelIds.length > 0
        ? state.agentModelIds
        : DEFAULT_AGENT_MODEL_IDS,
    synthesisModelId: state.synthesisModelId ?? DEFAULT_SYNTHESIS_MODEL_ID,
    reviewModelId: state.reviewModelId ?? state.finalModelId ?? DEFAULT_REVIEW_MODEL_ID,
    retryEnabled: state.retryEnabled ?? true,
    retryThreshold: state.retryThreshold ?? DEFAULT_RETRY_THRESHOLD,
    theme: state.theme ?? 'light',
    runs: normalizedRuns,
  }
}

export default function App() {
  const stored = normalizeStoredState(loadStoredState())
  const [apiKey, setApiKey] = useState(stored?.apiKey ?? '')
  const [baseUrl, setBaseUrl] = useState(stored?.baseUrl ?? DEFAULT_BASE_URL)
  const [problem, setProblem] = useState(stored?.problem ?? '')
  const [stages, setStages] = useState<StageConfig[]>(stored?.stages ?? cloneDefaultStages())
  const [agentModelIds, setAgentModelIds] = useState<string[]>(
    stored?.agentModelIds ?? DEFAULT_AGENT_MODEL_IDS,
  )
  const [synthesisModelId, setSynthesisModelId] = useState(
    stored?.synthesisModelId ?? DEFAULT_SYNTHESIS_MODEL_ID,
  )
  const [reviewModelId, setReviewModelId] = useState(
    stored?.reviewModelId ?? DEFAULT_REVIEW_MODEL_ID,
  )
  const [retryEnabled, setRetryEnabled] = useState(stored?.retryEnabled ?? true)
  const [retryThreshold, setRetryThreshold] = useState(
    stored?.retryThreshold ?? DEFAULT_RETRY_THRESHOLD,
  )
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null)
  const [runElapsedMs, setRunElapsedMs] = useState(0)
  const [selectedResult, setSelectedResult] = useState<StageResult | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(stored?.theme ?? 'light')
  const [newModelId, setNewModelId] = useState('')
  const [newPresetId, setNewPresetId] = useState(MODEL_OPTIONS[0]?.id ?? 'custom')
  const [runs, setRuns] = useState<PipelineRun[]>(stored?.runs ?? [])
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(
    stored?.selectedRunId ?? stored?.runs?.[0]?.id,
  )
  const [isRunning, setIsRunning] = useState(false)

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? runs[0],
    [runs, selectedRunId],
  )
  const isViewingComplete =
    selectedRun?.final?.status === 'complete' ||
    (selectedRun?.stages.length
      ? selectedRun.stages.every((stage) => stage.status === 'complete')
      : false)

  useEffect(() => {
    saveStoredState({
      apiKey,
      baseUrl,
      problem,
      stages,
      agentModelIds,
      synthesisModelId,
      reviewModelId,
      retryEnabled,
      retryThreshold,
      theme,
      runs,
      selectedRunId: selectedRun?.id,
    })
  }, [
    apiKey,
    baseUrl,
    problem,
    runs,
    selectedRun?.id,
    stages,
    agentModelIds,
    synthesisModelId,
    reviewModelId,
    retryEnabled,
    retryThreshold,
    theme,
  ])

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    if (!isRunning || runStartedAt == null) return
    const interval = window.setInterval(() => {
      setRunElapsedMs(Date.now() - runStartedAt)
    }, 1000)
    return () => window.clearInterval(interval)
  }, [isRunning, runStartedAt])

  const formatElapsed = (durationMs: number) => {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}m ${seconds}s`
  }

  const enabledStages = stages.filter((stage) => stage.enabled)
  const synthesisStage = stages.find((stage) => stage.id === 'synthesis')
  const reviewStage = stages.find((stage) => stage.id === 'review')
  const needsSynthesisModel = synthesisStage?.enabled ?? false
  const needsReviewModel = reviewStage?.enabled ?? false

  const canRun =
    Boolean(problem.trim()) &&
    enabledStages.length > 0 &&
    Boolean(apiKey.trim()) &&
    agentModelIds.length > 0 &&
    (!needsSynthesisModel || Boolean(synthesisModelId.trim())) &&
    (!needsReviewModel || Boolean(reviewModelId.trim()))

  const handleStageToggle = (id: string) => {
    setStages((prev) =>
      prev.map((stage) => (stage.id === id ? { ...stage, enabled: !stage.enabled } : stage)),
    )
  }

  const handlePromptChange = (id: string, value: string) => {
    setStages((prev) =>
      prev.map((stage) => (stage.id === id ? { ...stage, systemPrompt: value } : stage)),
    )
  }

  const handleAgentUpdate = (index: number, value: string) => {
    setAgentModelIds((prev) => prev.map((item, idx) => (idx === index ? value : item)))
  }

  const handleAgentRemove = (index: number) => {
    setAgentModelIds((prev) => prev.filter((_, idx) => idx !== index))
  }

  const handlePresetChange = (presetId: string) => {
    setNewPresetId(presetId)
    if (presetId === 'custom') {
      setNewModelId('')
      return
    }
    setNewModelId(presetId)
  }

  const handleAddModel = () => {
    const next = newModelId.trim()
    if (!next || agentModelIds.includes(next)) return
    setAgentModelIds((prev) => [...prev, next])
    setNewModelId('')
  }

  const handleReset = () => {
    setProblem('')
    setStages(cloneDefaultStages())
    setAgentModelIds(DEFAULT_AGENT_MODEL_IDS)
    setSynthesisModelId(DEFAULT_SYNTHESIS_MODEL_ID)
    setReviewModelId(DEFAULT_REVIEW_MODEL_ID)
    setNewModelId('')
    setNewPresetId(MODEL_OPTIONS[0]?.id ?? 'custom')
  }

  const handleClearHistory = () => {
    setRuns([])
    setSelectedRunId(undefined)
  }

  const handleViewResult = (result: StageResult) => {
    setSelectedResult(result)
    setSheetOpen(true)
  }

  const handleClearData = () => {
    clearStoredState()
    setApiKey('')
    setBaseUrl(DEFAULT_BASE_URL)
    setProblem('')
    setStages(cloneDefaultStages())
    setAgentModelIds(DEFAULT_AGENT_MODEL_IDS)
    setSynthesisModelId(DEFAULT_SYNTHESIS_MODEL_ID)
    setReviewModelId(DEFAULT_REVIEW_MODEL_ID)
    setRetryEnabled(true)
    setRetryThreshold(DEFAULT_RETRY_THRESHOLD)
    setRuns([])
    setSelectedRunId(undefined)
    setTheme('light')
    setNewModelId('')
    setNewPresetId(MODEL_OPTIONS[0]?.id ?? 'custom')
  }

  const handleRun = async () => {
    if (!canRun || isRunning) return

    const requestWithRetries = async (params: Parameters<typeof requestStage>[0]) => {
      const attempts = retryEnabled ? Math.max(1, retryThreshold) : 1
      let lastError: unknown

      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          return await requestStage(params)
        } catch (error) {
          lastError = error
        }
      }

      throw lastError
    }

    const runId = createRunId()
    const createdAt = new Date().toISOString()
    const runStages: StageResult[] = enabledStages.flatMap((stage) => {
      if (isMultiAgentStage(stage.id)) {
        return agentModelIds.map((modelId) => ({
          id: `${stage.id}:${modelId}`,
          stageId: stage.id,
          stageLabel: stage.label,
          modelId,
          agentLabel: getAgentLabel(modelId),
          systemPrompt: stage.systemPrompt,
          status: 'pending' as const,
        }))
      }
      if (stage.id === 'synthesis') {
        return [
          {
            id: `${stage.id}:${synthesisModelId}`,
            stageId: stage.id,
            stageLabel: stage.label,
            modelId: synthesisModelId,
            agentLabel: getAgentLabel(synthesisModelId),
            systemPrompt: stage.systemPrompt,
            status: 'pending' as const,
          },
        ]
      }
      return []
    })

    const newRun: PipelineRun = {
      id: runId,
      problem: problem.trim(),
      createdAt,
      stages: runStages,
      final: reviewStage?.enabled
        ? {
            id: 'final',
            label: 'Final review',
            modelId: reviewModelId,
            agentLabel: getAgentLabel(reviewModelId),
            systemPrompt: reviewStage.systemPrompt,
            status: 'pending',
          }
        : undefined,
    }

    setRuns((prev) => [newRun, ...prev].slice(0, MAX_RUNS))
    setSelectedRunId(runId)
    setIsRunning(true)
    setRunStartedAt(Date.now())
    setRunElapsedMs(0)

    const priorOutputs: string[] = []
    let errorOccurred = false

    for (const stageConfig of enabledStages) {
      if (isMultiAgentStage(stageConfig.id)) {
        const stageEntries = agentModelIds.map((modelId) => ({
          modelId,
          stageResultId: `${stageConfig.id}:${modelId}`,
          startTime: new Date(),
        }))

        for (const entry of stageEntries) {
          setRuns((prev) =>
            updateRunStages(prev, runId, entry.stageResultId, (stage) => ({
              ...stage,
              status: 'running',
              startedAt: entry.startTime.toISOString(),
            })),
          )
        }

        const stageOutputs: string[] = []

        const requests = stageEntries.map((entry) =>
          requestWithRetries({
            apiKey,
            baseUrl,
            stage: stageConfig,
            modelId: entry.modelId,
            problem: problem.trim(),
            priorOutputs,
          })
            .then(({ content, request, responseMeta }) => {
              const finishedAt = new Date()
              const durationMs = finishedAt.getTime() - entry.startTime.getTime()
              setRuns((prev) =>
                updateRunStages(prev, runId, entry.stageResultId, (stage) => ({
                  ...stage,
                  status: 'complete',
                  completedAt: finishedAt.toISOString(),
                  durationMs,
                  output: content,
                  request,
                  response: responseMeta,
                })),
              )
              stageOutputs.push(
                `### ${stageConfig.label} (${getAgentLabel(entry.modelId)})\\n${content}`,
              )
            })
            .catch((error) => {
              const finishedAt = new Date()
              const durationMs = finishedAt.getTime() - entry.startTime.getTime()
              const message = error instanceof Error ? error.message : 'Request failed'
              setRuns((prev) =>
                updateRunStages(prev, runId, entry.stageResultId, (stage) => ({
                  ...stage,
                  status: 'error',
                  completedAt: finishedAt.toISOString(),
                  durationMs,
                  error: message,
                })),
              )
              errorOccurred = true
            }),
        )

        await Promise.allSettled(requests)

        if (errorOccurred) {
          break
        }

        priorOutputs.push(...stageOutputs)
        continue
      }

      if (stageConfig.id === 'synthesis') {
        const stageResultId = `${stageConfig.id}:${synthesisModelId}`
        const startTime = new Date()
        setRuns((prev) =>
          updateRunStages(prev, runId, stageResultId, (stage) => ({
            ...stage,
            status: 'running',
            startedAt: startTime.toISOString(),
          })),
        )

        try {
          const { content, request, responseMeta } = await requestWithRetries({
            apiKey,
            baseUrl,
            stage: stageConfig,
            modelId: synthesisModelId,
            problem: problem.trim(),
            priorOutputs,
          })

          const finishedAt = new Date()
          const durationMs = finishedAt.getTime() - startTime.getTime()

          setRuns((prev) =>
            updateRunStages(prev, runId, stageResultId, (stage) => ({
              ...stage,
              status: 'complete',
              completedAt: finishedAt.toISOString(),
              durationMs,
              output: content,
              request,
              response: responseMeta,
            })),
          )

          priorOutputs.push(`### ${stageConfig.label}\\n${content}`)
        } catch (error) {
          const finishedAt = new Date()
          const durationMs = finishedAt.getTime() - startTime.getTime()
          const message = error instanceof Error ? error.message : 'Request failed'

          setRuns((prev) =>
            updateRunStages(prev, runId, stageResultId, (stage) => ({
              ...stage,
              status: 'error',
              completedAt: finishedAt.toISOString(),
              durationMs,
              error: message,
            })),
          )
          errorOccurred = true
          break
        }
      }
    }

    if (!errorOccurred && reviewStage?.enabled && newRun.final) {
      const startTime = new Date()
      setRuns((prev) =>
        updateRunFinal(prev, runId, (finalStage) => ({
          ...finalStage,
          status: 'running',
          startedAt: startTime.toISOString(),
        })),
      )

      try {
        const { content, request, responseMeta } = await requestWithRetries({
          apiKey,
          baseUrl,
          stage: reviewStage,
          modelId: reviewModelId,
          problem: problem.trim(),
          priorOutputs,
        })

        const finishedAt = new Date()
        const durationMs = finishedAt.getTime() - startTime.getTime()

        setRuns((prev) =>
          updateRunFinal(prev, runId, (finalStage) => ({
            ...finalStage,
            status: 'complete',
            completedAt: finishedAt.toISOString(),
            durationMs,
            output: content,
            request,
            response: responseMeta,
          })),
        )
      } catch (error) {
        const finishedAt = new Date()
        const durationMs = finishedAt.getTime() - startTime.getTime()
        const message = error instanceof Error ? error.message : 'Request failed'

        setRuns((prev) =>
          updateRunFinal(prev, runId, (finalStage) => ({
            ...finalStage,
            status: 'error',
            completedAt: finishedAt.toISOString(),
            durationMs,
            error: message,
          })),
        )
      }
    }

    setIsRunning(false)
    setRunStartedAt(null)
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#f5ede1,_#f7f4ef_45%,_#eef2f7_100%)] text-slate-900 dark:bg-[radial-gradient(circle_at_top,_#1a1a1a,_#0f0f10_45%,_#050505_100%)] dark:text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <Toaster />
        <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500 dark:text-zinc-400">
              LLM THINKTANK
            </p>
            <h1 className="font-display mt-3 text-4xl text-slate-900 dark:text-white">
              Multi-model workflow for hard problems
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-slate-600 dark:text-zinc-300">
              A multi-stage LLM pipeline tool to plan, review, and synthesize solutions to hard
              problems.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="openrouter-api-key"
              className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-400"
            >
              OpenRouter API key
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <Input
                id="openrouter-api-key"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="OpenRouter API key"
                className="w-64 bg-white/90 dark:bg-zinc-900"
              />
              <button
                type="button"
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                aria-label="Toggle theme"
                className="flex items-center rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {theme === 'light' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </header>

        <ProblemInput
          value={problem}
          onChange={setProblem}
          onClearData={handleClearData}
          disabled={isRunning}
        />

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-5 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-950/70">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-zinc-400">
                  Select Models
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
                  Configure model pool
                </h2>
              </div>
              <span className="text-xs text-slate-500 dark:text-zinc-400">
                {agentModelIds.length} selected
              </span>
            </div>
            <div className="mt-4 grid gap-3">
              {agentModelIds.map((modelId, index) => (
                <div
                  key={modelId}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-zinc-700"
                >
                  <Input
                    value={modelId}
                    onChange={(event) => handleAgentUpdate(index, event.target.value)}
                    aria-label={`Model ${index + 1}`}
                    className="flex-1 bg-white/90 dark:bg-zinc-900"
                    disabled={isRunning}
                  />
                  <button
                    type="button"
                    onClick={() => handleAgentRemove(index)}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 hover:border-slate-300 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500"
                    disabled={isRunning}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            {agentModelIds.length === 0 && (
              <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">
                Select at least one agent to run the pipeline.
              </p>
            )}
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-4 dark:border-zinc-700">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-zinc-400">
                Add OpenRouter Model
              </p>
              <div className="mt-3 grid gap-3">
                <Select value={newPresetId} onValueChange={handlePresetChange} disabled={isRunning}>
                  <SelectTrigger className="bg-white shadow-sm focus:ring-0 focus:ring-offset-0 dark:bg-zinc-900">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    value={newModelId}
                    onChange={(event) => setNewModelId(event.target.value)}
                    placeholder="openai/gpt-4o-mini"
                    aria-label="New model ID"
                    className="flex-1 bg-white/90 dark:bg-zinc-900"
                    disabled={isRunning}
                  />
                  <Button
                    type="button"
                    onClick={handleAddModel}
                    variant="secondary"
                    disabled={isRunning || !newModelId.trim()}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-5 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-950/70">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-zinc-400">
              Synthesis + review
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
              Select synthesis + review models
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-zinc-300">
              Choose the single model that merges all planning + solution outputs.
            </p>
            <div className="mt-4 grid gap-3">
              <label
                htmlFor="synthesis-model"
                className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-zinc-400"
              >
                Select Synthesis Model
              </label>
              <Select
                value={synthesisModelId}
                onValueChange={setSynthesisModelId}
                disabled={isRunning}
              >
                <SelectTrigger
                  id="synthesis-model"
                  className="bg-white shadow-sm focus:ring-0 focus:ring-offset-0 dark:bg-zinc-900"
                >
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label
                htmlFor="review-model"
                className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-zinc-400"
              >
                Select Final Review Model
              </label>
              <p className="text-sm text-slate-600 dark:text-zinc-300">
                The reviewer produces the final response and flags any gaps.
              </p>
              <Select value={reviewModelId} onValueChange={setReviewModelId} disabled={isRunning}>
                <SelectTrigger
                  id="review-model"
                  className="bg-white shadow-sm focus:ring-0 focus:ring-offset-0 dark:bg-zinc-900"
                >
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-950/70">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-600 dark:text-zinc-300">
                <span className="font-semibold text-slate-900 dark:text-white">
                  {enabledStages.length}
                </span>{' '}
                of {stages.length} stages ·{' '}
                <span className="font-semibold text-slate-900 dark:text-white">
                  {agentModelIds.length}
                </span>{' '}
                agents ·{' '}
                <span className="font-semibold text-slate-900 dark:text-white">
                  {getRequestCount(enabledStages, agentModelIds.length)}
                </span>{' '}
                requests
              </p>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {isRunning ? 'Pipeline running...' : 'Ready to run'}
              </p>
              {isRunning && runStartedAt != null && (
                <p className="text-xs text-amber-600 dark:text-amber-300">
                  Workflow running for {formatElapsed(runElapsedMs)}...
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="secondary"
                  onClick={handleReset}
                  disabled={isRunning}
                  className="gap-2"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
                <Button
                  onClick={handleRun}
                  disabled={!canRun || isRunning}
                  className="gap-2 bg-slate-900 text-white hover:bg-slate-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                >
                  {isRunning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {isRunning ? 'Processing' : 'Run pipeline'}
                </Button>
              </div>
              {!apiKey.trim() && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Add an OpenRouter API key to run live requests.
                </p>
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-zinc-300">
            <span className="font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-400">
              Request retries
            </span>
            <Switch
              checked={retryEnabled}
              onCheckedChange={setRetryEnabled}
              disabled={isRunning}
              aria-label="Enable request retries"
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-zinc-400">Retry threshold</span>
              <Input
                type="number"
                min={1}
                value={retryThreshold}
                onChange={(event) => setRetryThreshold(Number(event.target.value))}
                className="w-14 bg-white/90 dark:bg-zinc-900"
                disabled={isRunning || !retryEnabled}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-zinc-400">
                Pipeline stages
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
                Configure the workflow
              </h2>
            </div>
            {stages.map((stage) => {
              const stageResults = selectedRun?.stages.filter(
                (result) => result.stageId === stage.id,
              )
              const status =
                stage.id === 'review'
                  ? selectedRun?.final?.status
                  : stageResults
                    ? getStageStatus(stageResults)
                    : undefined

              return (
                <StageCard
                  key={stage.id}
                  stage={stage}
                  status={status}
                  stageResults={stageResults}
                  disabled={isRunning}
                  disablePrompts={isViewingComplete}
                  onToggle={handleStageToggle}
                  onPromptChange={handlePromptChange}
                  onViewResult={handleViewResult}
                />
              )
            })}
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-zinc-400">
                Outputs
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
                Results + history
              </h2>
            </div>
            <ResultsPanel run={selectedRun} />
            <RunHistory
              runs={runs}
              selectedRunId={selectedRun?.id}
              onSelect={setSelectedRunId}
              onClear={handleClearHistory}
            />
          </div>
        </div>
        <Sheet
          open={sheetOpen}
          onOpenChange={(open) => {
            setSheetOpen(open)
            if (!open) {
              setSelectedResult(null)
            }
          }}
        >
          <SheetContent>
            {selectedResult && (
              <div className="space-y-6">
                <SheetHeader>
                  <SheetTitle>
                    {selectedResult.stageLabel} · {selectedResult.agentLabel}
                  </SheetTitle>
                  <SheetDescription className="font-mono text-sky-700 dark:text-sky-300">
                    {selectedResult.modelId}
                  </SheetDescription>
                </SheetHeader>

                <div className="grid gap-3 text-sm text-slate-600 dark:text-zinc-300 md:grid-cols-3">
                  <div>
                    <span className="font-semibold text-slate-800 dark:text-zinc-100">Cost</span>
                    <div>
                      {selectedResult.response?.cost != null
                        ? `$${selectedResult.response.cost.toFixed(4)}`
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-800 dark:text-zinc-100">Tokens</span>
                    <div>
                      {selectedResult.response?.usage?.total_tokens != null
                        ? new Intl.NumberFormat('en-US').format(
                            selectedResult.response.usage.total_tokens,
                          )
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-800 dark:text-zinc-100">
                      Duration
                    </span>
                    <div>
                      {selectedResult.durationMs != null
                        ? `${(selectedResult.durationMs / 1000).toFixed(1)}s`
                        : '—'}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                  {selectedResult.error ? (
                    <p className="text-sm text-rose-600 dark:text-rose-400">
                      {selectedResult.error}
                    </p>
                  ) : selectedResult.output ? (
                    <Markdown
                      content={selectedResult.output}
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
                      {JSON.stringify(selectedResult.request, null, 2)}
                    </pre>
                  </details>
                  <details className="rounded-xl border border-slate-100 bg-white/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-zinc-200">
                      Response metadata
                    </summary>
                    <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-950/5 p-3 text-[11px] text-slate-700 dark:bg-zinc-900/70 dark:text-zinc-200">
                      {JSON.stringify(selectedResult.response, null, 2)}
                    </pre>
                  </details>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </div>
  )
}
