import { DEFAULT_STAGES } from '../data/pipeline'
import type {
  FinalResult,
  PipelineRun,
  StageConfig,
  StageKind,
  StageResult,
  StageStatus,
  WorkflowConfig,
} from './types'

export const cloneDefaultStages = () => DEFAULT_STAGES.map((stage) => ({ ...stage }))

export const cloneStages = (stages: StageConfig[]) => stages.map((stage) => ({ ...stage }))

export const cloneRun = (run: PipelineRun): PipelineRun => ({
  ...run,
  stagesConfig: cloneStages(run.stagesConfig),
  agentModelIds: [...run.agentModelIds],
  stages: run.stages.map((stage) => ({ ...stage })),
  final: run.final ? { ...run.final } : undefined,
})

export const dedupe = (items: string[]) => [...new Set(items)]

export const createWorkflowId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `workflow_${Date.now()}`
}

export const createStageId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `stage_${Date.now()}`
}

export const createRunId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `run_${Date.now()}`
}

export const createStageResultId = (
  runId: string,
  stageId: string,
  modelId: string,
  index: number,
) => `${runId}:${stageId}:${modelId}:${index}`

export const slugifyStageId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

export const updateRunStages = (
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

export const updateRunFinal = (
  runs: PipelineRun[],
  runId: string,
  updater: (final: FinalResult) => FinalResult,
) =>
  runs.map((run) => {
    if (run.id !== runId || !run.final) return run
    return {
      ...run,
      final: updater(run.final),
    }
  })

export const isAgentStage = (stage: StageConfig) => stage.kind === 'agent'
export const isSynthesisStage = (stage: StageConfig) => stage.kind === 'synthesis'
export const isReviewStage = (stage: StageConfig) => stage.kind === 'review'

export const getStageStatus = (results: StageResult[]): StageStatus | undefined => {
  if (results.length === 0) return undefined
  if (results.some((result) => result.status === 'error')) return 'error'
  if (results.some((result) => result.status === 'running')) return 'running'
  if (results.every((result) => result.status === 'complete')) return 'complete'
  return 'pending'
}

export const getRequestCount = (enabledStages: StageConfig[], agentCount: number) =>
  enabledStages.reduce((count, stage) => {
    if (isReviewStage(stage)) return count + 1
    return count + (isAgentStage(stage) ? agentCount : 1)
  }, 0)

export const getStageKind = (stage: StageConfig): StageKind => {
  if (stage.kind) return stage.kind
  if (stage.id === 'synthesis') return 'synthesis'
  if (stage.id === 'review') return 'review'
  return 'agent'
}

export const normalizeStageTemperature = (stage: StageConfig) => {
  if (typeof stage.temperature === 'number') return stage.temperature
  if (stage.kind === 'synthesis' || stage.id === 'synthesis') return 0.35
  if (stage.kind === 'review' || stage.id === 'review') return 0.2
  return 0.4
}

export const normalizeStages = (stages?: StageConfig[]) =>
  (stages ?? []).map((stage) => ({
    ...stage,
    kind: getStageKind(stage),
    temperature: normalizeStageTemperature(stage),
  }))

export const mergeTemplates = (templates: WorkflowConfig[], workflows: WorkflowConfig[]) => {
  const byId = new Map(workflows.map((workflow) => [workflow.id, workflow]))
  const mergedTemplates = templates.map((template) => byId.get(template.id) ?? template)
  const extra = workflows.filter(
    (workflow) => !templates.some((template) => template.id === workflow.id),
  )
  return [...mergedTemplates, ...extra]
}
