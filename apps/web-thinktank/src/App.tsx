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
import { Toaster, toast } from '@thinktank/ui-library/components/sonner'
import { Switch } from '@thinktank/ui-library/components/switch'
import { Textarea } from '@thinktank/ui-library/components/textarea'
import { Loader2, Moon, Pencil, Play, Plus, RotateCcw, Sun, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ProblemInput } from './components/ProblemInput'
import { ResultDetailSheet } from './components/ResultDetailSheet'
import { ResultsPanel } from './components/ResultsPanel'
import { RunHistory } from './components/RunHistory'
import { StageCard } from './components/StageCard'
import {
  DEFAULT_AGENT_MODEL_IDS,
  DEFAULT_BASE_URL,
  DEFAULT_REVIEW_MODEL_ID,
  DEFAULT_SYNTHESIS_MODEL_ID,
} from './data/pipeline'
import { useLocalStorageState } from './hooks/useLocalStorageState'
import { usePipelineRunner } from './hooks/usePipelineRunner'
import { useWorkflowState } from './hooks/useWorkflowState'
import { formatElapsed } from './lib/format'
import { MODEL_OPTIONS, getAgentLabel } from './lib/models'
import {
  cloneDefaultStages,
  getRequestCount,
  getStageStatus,
  isAgentStage,
  isReviewStage,
  isSynthesisStage,
  mergeTemplates,
} from './lib/pipeline-utils'
import { clearStoredState } from './lib/storage'
import type { StageKind, WorkflowConfig } from './lib/types'

const DEFAULT_RETRY_THRESHOLD = 3
const DEFAULT_WORKFLOW_ID = 'default'

const TEMPLATE_WORKFLOWS: WorkflowConfig[] = [
  {
    id: DEFAULT_WORKFLOW_ID,
    name: 'Problem Solver',
    description: 'Baseline multi-stage workflow for structured solutions.',
    stages: cloneDefaultStages(),
  },
  {
    id: 'brainstormer',
    name: 'Brainstormer',
    description: 'Generates and refines new ideas given a problem area.',
    stages: [
      {
        id: 'ideation',
        label: 'Ideation',
        enabled: true,
        temperature: 0.6,
        kind: 'agent',
        systemPrompt:
          'You generate a wide range of novel ideas for the given problem area. Be expansive, but keep ideas grounded and feasible.',
      },
      {
        id: 'refinement',
        label: 'Refinement',
        enabled: true,
        temperature: 0.4,
        kind: 'synthesis',
        systemPrompt:
          'You refine and combine the best ideas from prior outputs into a concise set of high-potential options.',
      },
      {
        id: 'summary',
        label: 'Summary',
        enabled: true,
        temperature: 0.2,
        kind: 'review',
        systemPrompt:
          'You review the refined ideas and produce a clear, prioritized summary with next steps.',
      },
    ],
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    description: 'Intended to critically review ideas.',
    stages: [
      {
        id: 'review',
        label: 'Review',
        enabled: true,
        temperature: 0.3,
        kind: 'agent',
        systemPrompt:
          'You critically review the given ideas, flag risks, missing assumptions, and weak points, and suggest improvements.',
      },
      {
        id: 'refinement',
        label: 'Refinement',
        enabled: true,
        temperature: 0.35,
        kind: 'synthesis',
        systemPrompt: 'You synthesize the review feedback into a refined, improved proposal.',
      },
      {
        id: 'summary',
        label: 'Summary',
        enabled: true,
        temperature: 0.2,
        kind: 'review',
        systemPrompt:
          'You produce a final review summary with key issues, fixes, and a polished recommendation.',
      },
    ],
  },
  {
    id: 'summarizer',
    name: 'Summarizer',
    description: 'Query multiple models and synthesize their opinions into a unified summary.',
    stages: [
      {
        id: 'opinion',
        label: 'Opinion',
        enabled: true,
        temperature: 0.4,
        kind: 'agent',
        systemPrompt:
          'You provide your thoughtful opinion and analysis on the given topic or question. Be thorough, clear, and share your unique perspective.',
      },
      {
        id: 'summarize',
        label: 'Summarize',
        enabled: true,
        temperature: 0.3,
        kind: 'synthesis',
        systemPrompt: `You are a summarizer that synthesizes multiple model responses. Your output must follow this exact format:

For each model response you received, provide a dedicated summary section:

**[Model Name] Summary:**
[Provide a concise summary of this model's key points, arguments, and conclusions]

After summarizing each model individually, conclude with:

**Combined Summary:**
[Provide a comprehensive synthesis that integrates the best insights from all models, highlights areas of agreement and disagreement, and presents a cohesive final answer that draws on the collective wisdom of all responses]`,
      },
    ],
  },
]

const formatApiKey = (value: string) => {
  const trimmed = value.trim()
  if (trimmed.length <= 8) return trimmed
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`
}

export default function App() {
  const { stored, persistState } = useLocalStorageState({
    templateWorkflows: TEMPLATE_WORKFLOWS,
    defaultWorkflowId: DEFAULT_WORKFLOW_ID,
    getAgentLabel,
    defaultRetryThreshold: DEFAULT_RETRY_THRESHOLD,
  })
  const initialWorkflows = mergeTemplates(TEMPLATE_WORKFLOWS, stored?.workflows ?? [])
  const initialSelectedRunId = stored?.selectedRunId ?? stored?.runs?.[0]?.id
  const initialSelectedRun = stored?.runs?.find((run) => run.id === initialSelectedRunId)
  const initialWorkflowId =
    initialSelectedRun?.workflowId ??
    stored?.selectedWorkflowId ??
    initialWorkflows[0]?.id ??
    DEFAULT_WORKFLOW_ID
  const initialStages =
    initialSelectedRun?.stagesConfig ??
    initialWorkflows.find((workflow) => workflow.id === initialWorkflowId)?.stages ??
    stored?.stages ??
    cloneDefaultStages()
  const [apiKey, setApiKey] = useState(stored?.apiKey ?? '')
  const [baseUrl, setBaseUrl] = useState(stored?.baseUrl ?? DEFAULT_BASE_URL)
  const [problem, setProblem] = useState(initialSelectedRun?.problem ?? stored?.problem ?? '')
  const [agentModelIds, setAgentModelIds] = useState<string[]>(
    initialSelectedRun?.agentModelIds ?? stored?.agentModelIds ?? DEFAULT_AGENT_MODEL_IDS,
  )
  const [synthesisModelId, setSynthesisModelId] = useState(
    initialSelectedRun?.synthesisModelId ?? stored?.synthesisModelId ?? DEFAULT_SYNTHESIS_MODEL_ID,
  )
  const [reviewModelId, setReviewModelId] = useState(
    initialSelectedRun?.reviewModelId ?? stored?.reviewModelId ?? DEFAULT_REVIEW_MODEL_ID,
  )
  const [retryEnabled, setRetryEnabled] = useState(stored?.retryEnabled ?? true)
  const [retryThreshold, setRetryThreshold] = useState(
    stored?.retryThreshold ?? DEFAULT_RETRY_THRESHOLD,
  )
  const [historySheetOpen, setHistorySheetOpen] = useState(false)
  const [isEditingApiKey, setIsEditingApiKey] = useState(() => !stored?.apiKey?.trim())
  const [theme, setTheme] = useState<'light' | 'dark'>(stored?.theme ?? 'light')
  const [newModelId, setNewModelId] = useState('')
  const [newPresetId, setNewPresetId] = useState(MODEL_OPTIONS[0]?.id ?? 'custom')

  const {
    stages,
    setStages,
    workflows,
    setWorkflows,
    selectedWorkflowId,
    setSelectedWorkflowId,
    selectedWorkflow,
    workflowSheetOpen,
    setWorkflowSheetOpen,
    workflowName,
    setWorkflowName,
    workflowDescription,
    setWorkflowDescription,
    workflowStages,
    selectWorkflow,
    applyWorkflowFromRun,
    syncStagesToWorkflow,
    resetWorkflowDraft,
    handleWorkflowStageUpdate,
    handleWorkflowStageAdd,
    handleWorkflowStageRemove,
    handleSaveWorkflow: handleSaveWorkflowState,
  } = useWorkflowState({
    initialStages,
    initialWorkflows,
    initialSelectedWorkflowId: initialWorkflowId,
  })

  const {
    runs,
    selectedRunId,
    setSelectedRunId,
    viewedRun,
    selectedResult,
    sheetOpen,
    setSheetOpen,
    sheetViewAsText,
    setSheetViewAsText,
    isRunning,
    runStartedAt,
    runElapsedMs,
    handleRun,
    handleViewResult,
    clearHistory,
    clearSelectedResult,
    resetRunState,
  } = usePipelineRunner({
    apiKey,
    baseUrl,
    stages,
    agentModelIds,
    synthesisModelId,
    reviewModelId,
    problem,
    retryEnabled,
    retryThreshold,
    selectedWorkflowId,
    getAgentLabel,
    initialRuns: stored?.runs ?? [],
    initialSelectedRunId,
    onApplyRun: (run) => {
      setProblem(run.problem)
      setAgentModelIds(run.agentModelIds)
      setSynthesisModelId(run.synthesisModelId)
      setReviewModelId(run.reviewModelId)
      applyWorkflowFromRun(run.workflowId, run.stagesConfig)
    },
  })
  const hasApiKey = Boolean(apiKey.trim())
  const isViewingComplete =
    viewedRun?.final?.status === 'complete' ||
    (viewedRun?.stages.length
      ? viewedRun.stages.every((stage) => stage.status === 'complete')
      : false)

  useEffect(() => {
    persistState({
      apiKey,
      baseUrl,
      problem,
      stages,
      workflows,
      selectedWorkflowId,
      agentModelIds,
      synthesisModelId,
      reviewModelId,
      retryEnabled,
      retryThreshold,
      theme,
      runs,
      selectedRunId,
    })
  }, [
    apiKey,
    baseUrl,
    problem,
    persistState,
    runs,
    selectedRunId,
    stages,
    workflows,
    selectedWorkflowId,
    agentModelIds,
    synthesisModelId,
    reviewModelId,
    retryEnabled,
    retryThreshold,
    theme,
  ])

  useEffect(() => {
    syncStagesToWorkflow(stages)
  }, [stages, syncStagesToWorkflow])

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const enabledStages = stages.filter((stage) => stage.enabled)
  const synthesisStages = enabledStages.filter((stage) => isSynthesisStage(stage))
  const reviewStage = [...enabledStages].reverse().find((stage) => isReviewStage(stage))
  const needsAgentModels = enabledStages.some((stage) => isAgentStage(stage))
  const needsSynthesisModel = synthesisStages.length > 0
  const needsReviewModel = Boolean(reviewStage)

  const canRun =
    Boolean(problem.trim()) &&
    enabledStages.length > 0 &&
    Boolean(apiKey.trim()) &&
    (!needsAgentModels || agentModelIds.length > 0) &&
    (!needsSynthesisModel || Boolean(synthesisModelId.trim())) &&
    (!needsReviewModel || Boolean(reviewModelId.trim()))

  const handlePromptChange = (id: string, value: string) => {
    setStages((prev) =>
      prev.map((stage) => (stage.id === id ? { ...stage, systemPrompt: value } : stage)),
    )
  }

  const handleAgentUpdate = (index: number, value: string) => {
    setAgentModelIds((prev) => {
      if (prev.some((item, idx) => idx !== index && item === value)) {
        toast.error('That model is already in the pool.')
        return prev
      }
      return prev.map((item, idx) => (idx === index ? value : item))
    })
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

  const handleWorkflowSelect = (workflowId: string) => {
    selectWorkflow(workflowId)
    setSelectedRunId(undefined)
    resetRunState()
  }

  const handleSaveWorkflow = () => {
    const result = handleSaveWorkflowState()
    if (!result.ok) {
      if (result.reason === 'missing-name') {
        toast.error('Add a workflow name before saving.')
        return
      }
      if (result.reason === 'missing-stages') {
        toast.error('Add at least one stage to save this workflow.')
        return
      }
      toast.error('Each stage needs a name and prompt before saving.')
      return
    }
    toast.success('Workflow saved')
  }

  const handleReset = () => {
    setProblem('')
    const defaultStages = cloneDefaultStages()
    setStages(defaultStages)
    setSelectedWorkflowId(DEFAULT_WORKFLOW_ID)
    setWorkflows((prev) => {
      const hasDefault = prev.some((workflow) => workflow.id === DEFAULT_WORKFLOW_ID)
      if (!hasDefault) {
        return [
          {
            id: DEFAULT_WORKFLOW_ID,
            name: 'Default pipeline',
            stages: defaultStages,
          },
          ...prev,
        ]
      }
      return prev.map((workflow) =>
        workflow.id === DEFAULT_WORKFLOW_ID ? { ...workflow, stages: defaultStages } : workflow,
      )
    })
    setAgentModelIds(DEFAULT_AGENT_MODEL_IDS)
    setSynthesisModelId(DEFAULT_SYNTHESIS_MODEL_ID)
    setReviewModelId(DEFAULT_REVIEW_MODEL_ID)
    setNewModelId('')
    setNewPresetId(MODEL_OPTIONS[0]?.id ?? 'custom')
  }

  const handleClearData = () => {
    clearStoredState()
    setApiKey('')
    setBaseUrl(DEFAULT_BASE_URL)
    setProblem('')
    const defaultStages = cloneDefaultStages()
    setStages(defaultStages)
    setWorkflows(mergeTemplates(TEMPLATE_WORKFLOWS, []))
    setSelectedWorkflowId(DEFAULT_WORKFLOW_ID)
    setAgentModelIds(DEFAULT_AGENT_MODEL_IDS)
    setSynthesisModelId(DEFAULT_SYNTHESIS_MODEL_ID)
    setReviewModelId(DEFAULT_REVIEW_MODEL_ID)
    setRetryEnabled(true)
    setRetryThreshold(DEFAULT_RETRY_THRESHOLD)
    clearHistory()
    setTheme('light')
    setNewModelId('')
    setNewPresetId(MODEL_OPTIONS[0]?.id ?? 'custom')
  }

  const handleRunClick = () => {
    if (!canRun || isRunning) return
    handleRun()
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#f5ede1,_#f7f4ef_45%,_#eef2f7_100%)] text-slate-900 dark:bg-[radial-gradient(circle_at_top,_#1a1a1a,_#0f0f10_45%,_#050505_100%)] dark:text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <Toaster />
        <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-zinc-400">
              LLM THINKTANK 🤔
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
              className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-zinc-400"
            >
              OpenRouter API key
            </label>
            <div className="flex flex-wrap items-center gap-3">
              {hasApiKey && !isEditingApiKey ? (
                <div className="flex min-w-[150px] items-center justify-between gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-100">
                  <span className="font-mono">{formatApiKey(apiKey)}</span>
                  <button
                    type="button"
                    onClick={() => setIsEditingApiKey(true)}
                    className="rounded-full p-1 text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-100"
                    aria-label="Edit OpenRouter API key"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <Input
                  id="openrouter-api-key"
                  type="text"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  onBlur={() => {
                    setIsEditingApiKey(false)
                  }}
                  placeholder="OpenRouter API key"
                  className="w-64 bg-white/90 dark:bg-zinc-900"
                />
              )}
              <button
                type="button"
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                aria-label="Toggle theme"
                className="flex items-center rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.05em] text-slate-700 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-100"
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
          <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-5 shadow-sm dark:border-zinc-700/40 dark:bg-zinc-950/70">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-zinc-400">
                  Select Models
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
                  Model Pool
                </h2>
              </div>
              <span className="text-xs text-slate-500 dark:text-zinc-400">
                {agentModelIds.length} selected
              </span>
            </div>
            <div className="mt-4 grid gap-3">
              {agentModelIds.map((modelId, index) => {
                const isKnownModel = MODEL_OPTIONS.some((option) => option.id === modelId)
                return (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: stable index needed for Radix Select state
                    key={`agent-model-${index}`}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-zinc-700/60"
                  >
                    <Select
                      value={modelId}
                      onValueChange={(value) => handleAgentUpdate(index, value)}
                      disabled={isRunning}
                    >
                      <SelectTrigger
                        className="flex-1 bg-white shadow-sm focus:ring-0 focus:ring-offset-0 dark:bg-zinc-900"
                        aria-label={`Model ${index + 1}`}
                      >
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {MODEL_OPTIONS.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.label}
                          </SelectItem>
                        ))}
                        {!isKnownModel && (
                          <SelectItem
                            key="custom"
                            value={modelId}
                          >{`Custom: ${modelId}`}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <button
                      type="button"
                      onClick={() => handleAgentRemove(index)}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.05em] text-slate-500 hover:border-slate-300 dark:border-zinc-700/60 dark:text-zinc-400 dark:hover:border-zinc-600"
                      disabled={isRunning}
                    >
                      Remove
                    </button>
                  </div>
                )
              })}
            </div>
            {needsAgentModels && agentModelIds.length === 0 && (
              <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">
                Select at least one agent to run the pipeline.
              </p>
            )}
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-4 dark:border-zinc-700/50">
              <p className="text-xs font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-zinc-400">
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

          <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-5 shadow-sm dark:border-zinc-700/40 dark:bg-zinc-950/70">
            <p className="text-xs font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-zinc-400">
              Synthesis + review
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
              Synthesis Models
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-zinc-300">
              Choose the single model that merges all planning + solution outputs.
            </p>
            <div className="mt-4 grid gap-3">
              <label
                htmlFor="synthesis-model"
                className="text-xs font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-zinc-400"
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
                className="text-xs font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-zinc-400"
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

        <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm dark:border-zinc-700/40 dark:bg-zinc-950/70">
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
                  onClick={handleRunClick}
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
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600 dark:text-zinc-300">
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-zinc-400">
                  Workflow
                </span>
                <Select
                  value={selectedWorkflowId ?? ''}
                  onValueChange={handleWorkflowSelect}
                  disabled={isRunning}
                >
                  <SelectTrigger className="h-8 w-44 bg-white/90 text-xs shadow-sm dark:bg-zinc-900">
                    <SelectValue placeholder="Select workflow" />
                  </SelectTrigger>
                  <SelectContent>
                    {workflows.map((workflow) => (
                      <SelectItem key={workflow.id} value={workflow.id}>
                        {workflow.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 gap-2"
                  onClick={() => {
                    resetWorkflowDraft()
                    setWorkflowSheetOpen(true)
                  }}
                  disabled={isRunning}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create workflow
                </Button>
              </div>
              {selectedWorkflow?.description && (
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  {selectedWorkflow.description}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-zinc-400">
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
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-zinc-400">
                Pipeline stages
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
                Workflow Stages
              </h2>
            </div>
            {stages.map((stage) => {
              const stageResults = viewedRun?.stages.filter((result) => result.stageId === stage.id)
              const status =
                stage.kind === 'review'
                  ? viewedRun?.final?.status
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
                  onPromptChange={handlePromptChange}
                  onViewResult={handleViewResult}
                />
              )
            })}
          </div>

          <div className="space-y-4">
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-zinc-400">
                Outputs
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Results</h2>
                <Button size="sm" variant="secondary" onClick={() => setHistorySheetOpen(true)}>
                  View History
                </Button>
              </div>
            </div>
            <ResultsPanel run={viewedRun ?? undefined} />
          </div>
        </div>
        <Sheet
          open={workflowSheetOpen}
          onOpenChange={(open) => {
            setWorkflowSheetOpen(open)
            if (open) {
              resetWorkflowDraft()
            }
          }}
        >
          <SheetContent>
            <div className="space-y-6">
              <SheetHeader>
                <SheetTitle>Create workflow</SheetTitle>
                <SheetDescription className="text-slate-600 dark:text-zinc-300">
                  Build a custom pipeline and save it for future runs.
                </SheetDescription>
              </SheetHeader>
              <div className="grid gap-3">
                <label
                  htmlFor="workflow-name"
                  className="text-xs font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-zinc-400"
                >
                  Workflow name
                </label>
                <Input
                  id="workflow-name"
                  value={workflowName}
                  onChange={(event) => setWorkflowName(event.target.value)}
                  placeholder="Client research sprint"
                  className="bg-white/90 dark:bg-zinc-900"
                />
              </div>
              <div className="grid gap-3">
                <label
                  htmlFor="workflow-description"
                  className="text-xs font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-zinc-400"
                >
                  Description
                </label>
                <Textarea
                  id="workflow-description"
                  value={workflowDescription}
                  onChange={(event) => setWorkflowDescription(event.target.value)}
                  placeholder="Describe what this workflow is best at."
                  className="min-h-[80px] bg-white/90 dark:bg-zinc-900"
                />
              </div>
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-zinc-400">
                    Stages
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="gap-2"
                    onClick={handleWorkflowStageAdd}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add stage
                  </Button>
                </div>
                <div className="space-y-4">
                  {workflowStages.map((stage, index) => (
                    <div
                      key={stage.id}
                      className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm dark:border-zinc-700/40 dark:bg-zinc-950/70"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <label
                            htmlFor={`workflow-stage-name-${stage.id}`}
                            className="text-xs font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-zinc-400"
                          >
                            Stage {index + 1} name
                          </label>
                          <Input
                            id={`workflow-stage-name-${stage.id}`}
                            value={stage.name}
                            onChange={(event) =>
                              handleWorkflowStageUpdate(stage.id, { name: event.target.value })
                            }
                            placeholder="Discovery"
                            className="bg-white/90 dark:bg-zinc-900"
                          />
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="gap-2"
                          onClick={() => handleWorkflowStageRemove(stage.id)}
                          disabled={workflowStages.length <= 1}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </Button>
                      </div>
                      <div className="mt-4 grid gap-2">
                        <label
                          htmlFor={`workflow-stage-prompt-${stage.id}`}
                          className="text-xs font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-zinc-400"
                        >
                          Prompt instructions
                        </label>
                        <Textarea
                          id={`workflow-stage-prompt-${stage.id}`}
                          value={stage.prompt}
                          onChange={(event) =>
                            handleWorkflowStageUpdate(stage.id, { prompt: event.target.value })
                          }
                          className="min-h-[120px] bg-white/90 dark:bg-zinc-900"
                        />
                      </div>
                      <div className="mt-4 grid gap-2 text-xs text-slate-600 dark:text-zinc-300">
                        <label
                          htmlFor={`workflow-stage-kind-${stage.id}`}
                          className="text-xs font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-zinc-400"
                        >
                          Stage type
                        </label>
                        <Select
                          value={stage.kind}
                          onValueChange={(value) =>
                            handleWorkflowStageUpdate(stage.id, { kind: value as StageKind })
                          }
                        >
                          <SelectTrigger
                            id={`workflow-stage-kind-${stage.id}`}
                            className="h-8 bg-white/90 text-xs shadow-sm dark:bg-zinc-900"
                          >
                            <SelectValue placeholder="Select stage type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="agent">Agent stage</SelectItem>
                            <SelectItem value="synthesis">Synthesis stage</SelectItem>
                            <SelectItem value="review">Final review stage</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Synthesis stages run on the synthesis model. The last Final review stage runs with
                  the review model.
                </p>
                <Button onClick={handleSaveWorkflow} className="gap-2">
                  Save workflow
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
        <ResultDetailSheet
          open={sheetOpen}
          onOpenChange={(open) => {
            setSheetOpen(open)
            if (!open) {
              clearSelectedResult()
              setSheetViewAsText(false)
            }
          }}
          result={selectedResult}
          title={
            selectedResult ? `${selectedResult.stageLabel} · ${selectedResult.agentLabel}` : ''
          }
          subtitle={selectedResult?.modelId}
          viewAsText={sheetViewAsText}
          onViewAsTextChange={setSheetViewAsText}
          toggleId="stage-view-toggle"
        />
        <Sheet open={historySheetOpen} onOpenChange={setHistorySheetOpen}>
          <SheetContent>
            <div className="space-y-6">
              <SheetHeader>
                <SheetTitle>Run history</SheetTitle>
                <SheetDescription className="text-slate-600 dark:text-zinc-300">
                  Select a previous run to load it in the main view.
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 dark:text-zinc-300">
                <span>All data is stored locally in the browser.</span>
                <Button size="sm" variant="secondary" onClick={clearHistory}>
                  Clear all
                </Button>
              </div>
              <RunHistory
                runs={runs}
                selectedRunId={selectedRunId}
                onSelect={(runId) => {
                  setSelectedRunId(runId)
                  setHistorySheetOpen(false)
                }}
                onClear={clearHistory}
                showClear={false}
              />
            </div>
          </SheetContent>
        </Sheet>
        <footer className="mt-10 text-sm text-slate-500 dark:text-zinc-400">
          <div className="ml-[calc(50%-50vw)] w-screen border-t border-slate-200/70 dark:border-zinc-700/40" />
          <div className="flex items-center gap-3 pt-6">
            <span>
              Built by{' '}
              <a
                href="https://priori-labs.com/"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-slate-600 hover:text-sky-600 dark:text-zinc-300 dark:hover:text-sky-400"
              >
                Priori Labs
              </a>
            </span>
            <span>·</span>
            <a
              href="https://github.com/unstructured-labs/thinktank"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-slate-600 hover:text-sky-600 dark:text-zinc-300 dark:hover:text-sky-400"
            >
              GitHub
            </a>
          </div>
        </footer>
      </div>
    </div>
  )
}
