export type StageKind = 'agent' | 'synthesis' | 'review'

export type StageConfig = {
  id: string
  label: string
  enabled: boolean
  systemPrompt: string
  temperature: number
  kind: StageKind
}

export type StageStatus = 'pending' | 'running' | 'complete' | 'error'

export type StageRequest = {
  model: string
  temperature: number
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
}

export type StageResponse = {
  id?: string
  model?: string
  created?: number
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
  cost?: number | null
}

export type StageResult = {
  id: string
  stageId: string
  stageLabel: string
  modelId: string
  agentLabel: string
  systemPrompt: string
  status: StageStatus
  startedAt?: string
  completedAt?: string
  durationMs?: number
  output?: string
  error?: string
  request?: StageRequest
  response?: StageResponse
}

export type FinalResult = {
  id: string
  label: string
  modelId: string
  agentLabel?: string
  systemPrompt: string
  status: StageStatus
  startedAt?: string
  completedAt?: string
  durationMs?: number
  output?: string
  error?: string
  request?: StageRequest
  response?: StageResponse
}

export type PipelineRun = {
  id: string
  workflowId: string
  stagesConfig: StageConfig[]
  agentModelIds: string[]
  synthesisModelId: string
  reviewModelId: string
  problem: string
  createdAt: string
  stages: StageResult[]
  final?: FinalResult
}

export type WorkflowConfig = {
  id: string
  name: string
  description?: string
  stages: StageConfig[]
}

export type StoredState = {
  apiKey: string
  baseUrl: string
  problem: string
  stages: StageConfig[]
  agentModelIds: string[]
  synthesisModelId: string
  reviewModelId: string
  finalModelId?: string
  retryEnabled?: boolean
  retryThreshold?: number
  theme?: 'light' | 'dark'
  runs: PipelineRun[]
  selectedRunId?: string
  workflows?: WorkflowConfig[]
  selectedWorkflowId?: string
}
