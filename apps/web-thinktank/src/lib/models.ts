import { OPENROUTER_MODELS } from '@thinktank/utils/openrouter-models'
import { AGENT_OPTIONS } from '../data/pipeline'

export const MODEL_OPTIONS = OPENROUTER_MODELS.map((model) => ({
  id: model.id,
  label: model.name,
  description: model.description,
}))

export const getAgentLabel = (modelId: string) =>
  MODEL_OPTIONS.find((option) => option.id === modelId)?.label ??
  AGENT_OPTIONS.find((option) => option.modelId === modelId)?.label ??
  modelId
