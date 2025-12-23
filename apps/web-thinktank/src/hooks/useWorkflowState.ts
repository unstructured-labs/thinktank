import { useCallback, useMemo, useRef, useState } from 'react'
import { cloneStages, createStageId, createWorkflowId, slugifyStageId } from '../lib/pipeline-utils'
import type { StageConfig, StageKind, WorkflowConfig } from '../lib/types'

const createEmptyWorkflowStage = (kind: StageKind = 'agent') => ({
  id: createStageId(),
  name: '',
  prompt: '',
  kind,
})

export const useWorkflowState = ({
  initialStages,
  initialWorkflows,
  initialSelectedWorkflowId,
}: {
  initialStages: StageConfig[]
  initialWorkflows: WorkflowConfig[]
  initialSelectedWorkflowId: string
}) => {
  const [stages, setStages] = useState<StageConfig[]>(initialStages.map((stage) => ({ ...stage })))
  const [workflows, setWorkflows] = useState<WorkflowConfig[]>(initialWorkflows)
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(initialSelectedWorkflowId)
  const [workflowSheetOpen, setWorkflowSheetOpen] = useState(false)
  const [workflowName, setWorkflowName] = useState('')
  const [workflowDescription, setWorkflowDescription] = useState('')
  const [workflowStages, setWorkflowStages] = useState<
    Array<{ id: string; name: string; prompt: string; kind: StageKind }>
  >([])
  const skipWorkflowSyncRef = useRef(false)

  const selectedWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === selectedWorkflowId),
    [selectedWorkflowId, workflows],
  )

  const syncStagesToWorkflow = useCallback(
    (nextStages: StageConfig[]) => {
      if (!selectedWorkflowId) return
      if (skipWorkflowSyncRef.current) {
        skipWorkflowSyncRef.current = false
        return
      }
      setWorkflows((prev) =>
        prev.map((workflow) =>
          workflow.id === selectedWorkflowId ? { ...workflow, stages: nextStages } : workflow,
        ),
      )
    },
    [selectedWorkflowId],
  )

  const selectWorkflow = (workflowId: string) => {
    const workflow = workflows.find((item) => item.id === workflowId)
    if (!workflow) return
    setSelectedWorkflowId(workflowId)
    setStages(cloneStages(workflow.stages))
  }

  const applyWorkflowFromRun = (workflowId: string | undefined, nextStages: StageConfig[]) => {
    skipWorkflowSyncRef.current = true
    if (workflowId && workflowId !== selectedWorkflowId) {
      setSelectedWorkflowId(workflowId)
    }
    setStages(cloneStages(nextStages))
  }

  const resetWorkflowDraft = () => {
    setWorkflowName('')
    setWorkflowDescription('')
    setWorkflowStages([createEmptyWorkflowStage('agent')])
  }

  const handleWorkflowStageUpdate = (
    stageId: string,
    updates: Partial<{ name: string; prompt: string; kind: StageKind }>,
  ) => {
    setWorkflowStages((prev) =>
      prev.map((stage) => (stage.id === stageId ? { ...stage, ...updates } : stage)),
    )
  }

  const handleWorkflowStageAdd = () => {
    setWorkflowStages((prev) => [...prev, createEmptyWorkflowStage('agent')])
  }

  const handleWorkflowStageRemove = (stageId: string) => {
    setWorkflowStages((prev) => prev.filter((stage) => stage.id !== stageId))
  }

  const handleSaveWorkflow = () => {
    const trimmedName = workflowName.trim()
    if (!trimmedName) {
      return { ok: false, reason: 'missing-name' as const }
    }
    if (workflowStages.length === 0) {
      return { ok: false, reason: 'missing-stages' as const }
    }

    const missingStage = workflowStages.find((stage) => !stage.name.trim() || !stage.prompt.trim())
    if (missingStage) {
      return { ok: false, reason: 'missing-stage-details' as const }
    }

    const usedIds = new Set<string>()
    const stagesToSave: StageConfig[] = workflowStages.map((stage) => {
      const baseId = slugifyStageId(stage.name) || createStageId()
      let stageId = baseId
      let suffix = 2
      while (usedIds.has(stageId)) {
        stageId = `${baseId}-${suffix}`
        suffix += 1
      }
      usedIds.add(stageId)
      return {
        id: stageId,
        label: stage.name.trim(),
        enabled: true,
        systemPrompt: stage.prompt.trim(),
        temperature: stage.kind === 'review' ? 0.2 : stage.kind === 'synthesis' ? 0.35 : 0.4,
        kind: stage.kind,
      }
    })

    const newWorkflow: WorkflowConfig = {
      id: createWorkflowId(),
      name: trimmedName,
      description: workflowDescription.trim() || undefined,
      stages: stagesToSave,
    }

    setWorkflows((prev) => [newWorkflow, ...prev])
    setSelectedWorkflowId(newWorkflow.id)
    setStages(cloneStages(stagesToSave))
    setWorkflowSheetOpen(false)
    resetWorkflowDraft()

    return { ok: true, workflow: newWorkflow }
  }

  return {
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
    setWorkflowStages,
    selectWorkflow,
    applyWorkflowFromRun,
    syncStagesToWorkflow,
    resetWorkflowDraft,
    handleWorkflowStageUpdate,
    handleWorkflowStageAdd,
    handleWorkflowStageRemove,
    handleSaveWorkflow,
  }
}
