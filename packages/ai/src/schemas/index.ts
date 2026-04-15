export * from "./ai-model"
export * from "./extenstions"
export * from "./mcp"

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[]

export type JsonObject = { [key: string]: JsonValue }
