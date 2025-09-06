export type BaseAIModel = {
  value: string
  label: string
}

export type AIModelCapabilities = BaseAIModel & {
  imageInput: boolean
  audioInput: boolean
  objectGeneration: boolean
  toolUsage: boolean
}
