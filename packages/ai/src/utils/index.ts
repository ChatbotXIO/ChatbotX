export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[]

export type JsonObject = { [key: string]: JsonValue }

export const getAIFileExtensionsAccept = () => {
  return {
    "text/plain": [".txt"],
    "application/pdf": [".pdf"],
    "text/markdown": [".md"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
      ".docx",
    ],
  }
}

export * from "../core/stream"
