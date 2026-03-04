export type Variables = {
  workflow: Record<string, Variable>
  contact: Record<string, Variable>
  conversation: Record<string, Variable>
}

export type Variable = {
  id?: string
  name: string
  type:
    | "string"
    | "number"
    | "boolean"
    | "date"
    | "array"
    | "object"
    | "image"
    | "file"
    | "email"
    | "phone"
  value:
    | string
    | number
    | boolean
    | Date
    | string[]
    | Record<string, unknown>
    | File
    | null
    | undefined
}

export const initVariables = (): Variables => {
  return {
    conversation: {},
    workflow: {},
    contact: {},
  }
}
