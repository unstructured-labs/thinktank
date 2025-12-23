import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  DEFAULT_AGENT_MODEL_IDS,
  DEFAULT_REVIEW_MODEL_ID,
  DEFAULT_SYNTHESIS_MODEL_ID,
} from '../data/pipeline'
import {
  cloneDefaultStages,
  createStageResultId,
  dedupe,
  mergeTemplates,
  normalizeStages,
} from '../lib/pipeline-utils'
import { loadStoredState, saveStoredState } from '../lib/storage'
import type { StoredState, WorkflowConfig } from '../lib/types'

const SAVE_DEBOUNCE_MS = 500
const FALLBACK_RUNS_LIMIT = 5

const isQuotaExceeded = (error: unknown) => {
  if (!error || typeof error !== 'object') return false
  const name = (error as { name?: string }).name
  const code = (error as { code?: number }).code
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014
  )
}

const stripRunDetails = (runs: StoredState['runs']) =>
  runs.map((run) => ({
    ...run,
    stages: run.stages.map((stage) => ({
      ...stage,
      output: undefined,
      error: undefined,
      request: undefined,
      response: undefined,
    })),
    final: run.final
      ? {
          ...run.final,
          output: undefined,
          error: undefined,
          request: undefined,
          response: undefined,
        }
      : undefined,
  }))

const normalizeStoredState = (
  state: StoredState | null,
  {
    templateWorkflows,
    defaultWorkflowId,
    getAgentLabel,
    defaultRetryThreshold,
  }: {
    templateWorkflows: WorkflowConfig[]
    defaultWorkflowId: string
    getAgentLabel: (modelId: string) => string
    defaultRetryThreshold: number
  },
): StoredState | null => {
  if (!state) return null

  const normalizedStages = normalizeStages(state.stages)
  const normalizedRuns =
    state.runs?.map((run) => ({
      ...run,
      workflowId: run.workflowId ?? state.selectedWorkflowId ?? defaultWorkflowId,
      stagesConfig: normalizeStages(run.stagesConfig ?? state.stages),
      agentModelIds: run.agentModelIds ?? state.agentModelIds ?? DEFAULT_AGENT_MODEL_IDS,
      synthesisModelId:
        run.synthesisModelId ?? state.synthesisModelId ?? DEFAULT_SYNTHESIS_MODEL_ID,
      reviewModelId: run.reviewModelId ?? state.reviewModelId ?? DEFAULT_REVIEW_MODEL_ID,
      stages: run.stages.map((stage, index) => ({
        ...stage,
        id: createStageResultId(run.id, stage.stageId, stage.modelId, index),
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

  const normalizedWorkflows = mergeTemplates(
    templateWorkflows,
    state.workflows && state.workflows.length > 0
      ? state.workflows.map((workflow) => ({
          ...workflow,
          description: workflow.description ?? undefined,
          stages: normalizeStages(workflow.stages),
        }))
      : [
          {
            id: defaultWorkflowId,
            name: 'Default pipeline',
            description: 'Baseline multi-stage workflow for structured solutions.',
            stages: normalizedStages.length > 0 ? normalizedStages : cloneDefaultStages(),
          },
        ],
  )
  const normalizedSelectedWorkflowId =
    state.selectedWorkflowId ?? normalizedWorkflows[0]?.id ?? defaultWorkflowId
  const selectedWorkflowStages =
    normalizedWorkflows.find((workflow) => workflow.id === normalizedSelectedWorkflowId)?.stages ??
    normalizedStages

  return {
    ...state,
    agentModelIds:
      state.agentModelIds && state.agentModelIds.length > 0
        ? dedupe(state.agentModelIds)
        : DEFAULT_AGENT_MODEL_IDS,
    synthesisModelId: state.synthesisModelId ?? DEFAULT_SYNTHESIS_MODEL_ID,
    reviewModelId: state.reviewModelId ?? state.finalModelId ?? DEFAULT_REVIEW_MODEL_ID,
    retryEnabled: state.retryEnabled ?? true,
    retryThreshold: state.retryThreshold ?? defaultRetryThreshold,
    theme: state.theme ?? 'light',
    runs: normalizedRuns,
    workflows: normalizedWorkflows,
    selectedWorkflowId: normalizedSelectedWorkflowId,
    stages: selectedWorkflowStages.length > 0 ? selectedWorkflowStages : cloneDefaultStages(),
  }
}

export const useLocalStorageState = ({
  templateWorkflows,
  defaultWorkflowId,
  getAgentLabel,
  defaultRetryThreshold,
}: {
  templateWorkflows: WorkflowConfig[]
  defaultWorkflowId: string
  getAgentLabel: (modelId: string) => string
  defaultRetryThreshold: number
}) => {
  const stored = useMemo(
    () =>
      normalizeStoredState(loadStoredState(), {
        templateWorkflows,
        defaultWorkflowId,
        getAgentLabel,
        defaultRetryThreshold,
      }),
    [defaultRetryThreshold, defaultWorkflowId, getAgentLabel, templateWorkflows],
  )
  const timeoutRef = useRef<number | null>(null)

  const persistState = useCallback((state: StoredState) => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = window.setTimeout(() => {
      try {
        saveStoredState(state)
      } catch (error) {
        if (!isQuotaExceeded(error)) throw error

        const trimmedRuns = state.runs.slice(0, FALLBACK_RUNS_LIMIT)
        const trimmedState = {
          ...state,
          runs: trimmedRuns,
        }

        try {
          saveStoredState(trimmedState)
        } catch (nestedError) {
          if (!isQuotaExceeded(nestedError)) throw nestedError
          saveStoredState({
            ...trimmedState,
            runs: stripRunDetails(trimmedRuns),
          })
        }
      }
    }, SAVE_DEBOUNCE_MS)
  }, [])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return { stored, persistState }
}
