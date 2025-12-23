import { useEffect, useRef, useState } from 'react'
import { requestStage } from '../lib/openrouter'
import {
  cloneRun,
  createRunId,
  createStageResultId,
  isAgentStage,
  isReviewStage,
  isSynthesisStage,
  updateRunFinal,
  updateRunStages,
} from '../lib/pipeline-utils'
import type { PipelineRun, StageConfig, StageResult } from '../lib/types'

const MAX_RUNS = 20

export const usePipelineRunner = ({
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
  initialRuns,
  initialSelectedRunId,
  onApplyRun,
}: {
  apiKey: string
  baseUrl: string
  stages: StageConfig[]
  agentModelIds: string[]
  synthesisModelId: string
  reviewModelId: string
  problem: string
  retryEnabled: boolean
  retryThreshold: number
  selectedWorkflowId: string
  getAgentLabel: (modelId: string) => string
  initialRuns: PipelineRun[]
  initialSelectedRunId?: string
  onApplyRun?: (run: PipelineRun) => void
}) => {
  const [runs, setRuns] = useState<PipelineRun[]>(initialRuns)
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(initialSelectedRunId)
  const [viewedRun, setViewedRun] = useState<PipelineRun | null>(null)
  const [selectedResult, setSelectedResult] = useState<StageResult | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetViewAsText, setSheetViewAsText] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null)
  const [runElapsedMs, setRunElapsedMs] = useState(0)
  const appliedRunIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!selectedRunId) return
    const run = runs.find((item) => item.id === selectedRunId)
    if (!run || appliedRunIdRef.current === run.id) return

    appliedRunIdRef.current = run.id
    onApplyRun?.(run)
  }, [onApplyRun, runs, selectedRunId])

  useEffect(() => {
    if (!selectedRunId) {
      setViewedRun(null)
      return
    }
    const run = runs.find((item) => item.id === selectedRunId)
    setViewedRun(run ? cloneRun(run) : null)
  }, [runs, selectedRunId])

  useEffect(() => {
    if (!selectedRunId) return
    setSelectedResult(null)
    setSheetOpen(false)
    setSheetViewAsText(false)
  }, [selectedRunId])

  useEffect(() => {
    if (!isRunning || runStartedAt == null) return
    const interval = window.setInterval(() => {
      setRunElapsedMs(Date.now() - runStartedAt)
    }, 1000)
    return () => window.clearInterval(interval)
  }, [isRunning, runStartedAt])

  const resetRunState = () => {
    setSelectedResult(null)
    setSheetOpen(false)
    setSheetViewAsText(false)
    setIsRunning(false)
    setRunStartedAt(null)
    setRunElapsedMs(0)
  }

  const clearHistory = () => {
    setRuns([])
    setSelectedRunId(undefined)
    resetRunState()
  }

  const handleViewResult = (result: StageResult) => {
    setSelectedResult(result)
    setSheetOpen(true)
  }

  const clearSelectedResult = () => {
    setSelectedResult(null)
  }

  const handleRun = async () => {
    if (isRunning) return

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

    const enabledStages = stages.filter((stage) => stage.enabled)
    const reviewStage = [...enabledStages].reverse().find((stage) => isReviewStage(stage))

    const runId = createRunId()
    const createdAt = new Date().toISOString()
    const runStages: StageResult[] = enabledStages.flatMap((stage) => {
      if (isReviewStage(stage)) return []
      if (isAgentStage(stage)) {
        return agentModelIds.map((modelId, index) => ({
          id: createStageResultId(runId, stage.id, modelId, index),
          stageId: stage.id,
          stageLabel: stage.label,
          modelId,
          agentLabel: getAgentLabel(modelId),
          systemPrompt: stage.systemPrompt,
          status: 'pending' as const,
        }))
      }
      if (isSynthesisStage(stage)) {
        const stageResultId = createStageResultId(runId, stage.id, synthesisModelId, 0)
        return [
          {
            id: stageResultId,
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
      workflowId: selectedWorkflowId,
      stagesConfig: stages.map((stage) => ({ ...stage })),
      agentModelIds: [...agentModelIds],
      synthesisModelId,
      reviewModelId,
      problem: problem.trim(),
      createdAt,
      stages: runStages,
      final: reviewStage
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

    const executionStages = enabledStages.filter((stage) => !isReviewStage(stage))

    for (const stageConfig of executionStages) {
      if (isAgentStage(stageConfig)) {
        const stageEntries = agentModelIds.map((modelId, index) => ({
          modelId,
          stageResultId: createStageResultId(runId, stageConfig.id, modelId, index),
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
                `### ${stageConfig.label} (${getAgentLabel(entry.modelId)})\n${content}`,
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

      if (isSynthesisStage(stageConfig)) {
        const stageResultId = createStageResultId(runId, stageConfig.id, synthesisModelId, 0)
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

          priorOutputs.push(`### ${stageConfig.label}\n${content}`)
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

    if (!errorOccurred && reviewStage && newRun.final) {
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

  return {
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
  }
}
