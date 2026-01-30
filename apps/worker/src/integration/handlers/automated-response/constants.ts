export const TEXT = {
  assistantFoundPrefix: "I've found some information for you:",
  followUpUserInstruction:
    "Based on the search results, please answer the customer's question in a natural and helpful way. Search results:",
  fileSearchNoResult: "No files matching the search query were found.",
  fileSearchErrorPrefix: "Error while searching files:",
  fileSearchFoundPrefix: (count: number) => `Found ${count} matching file(s):`,
  foundProductsFallbackPrefix:
    "I found some products that may be suitable for {{gender}}:",
  // MCP related texts
  jsonRpcVersion: "2.0",
  contentType: "application/json",
  bearerTokenPrefix: "Bearer ",
  unknownError: "Unknown error",
  // Follow-up instruction
  followUpInstruction:
    "Please answer my question based on the following information:",
  // File search tool descriptions
  fileSearchDescription:
    "Search uploaded files for information about products, policies, and company details. Do NOT use for greetings or casual salutations.",
  fileSearchQueryDescription: "Search keywords to find relevant information",
} as const

export const toolPrefix = {
  file: "file:",
  fn: "fn:",
  mcp: "mcp:",
} as const

export const JSON_TYPE = {
  object: "object",
  string: "string",
  number: "number",
  integer: "integer",
  boolean: "boolean",
  array: "array",
  null: "null",
} as const
export type JsonType = (typeof JSON_TYPE)[keyof typeof JSON_TYPE]

export const AUTH_TYPES = {
  TOKEN: "TOKEN",
  HEADERS: "HEADERS",
  NONE: "NONE",
} as const

export type AuthType = (typeof AUTH_TYPES)[keyof typeof AUTH_TYPES]

export const OPENAI_EMBEDDING_MODELS = {
  TEXT_EMBEDDING_3_LARGE: "text-embedding-3-large",
  TEXT_EMBEDDING_3_SMALL: "text-embedding-3-small",
  TEXT_EMBEDDING_ADA_002: "text-embedding-ada-002",
} as const

export type OpenAIEmbeddingModel =
  (typeof OPENAI_EMBEDDING_MODELS)[keyof typeof OPENAI_EMBEDDING_MODELS]

export const DEFAULT_OPENAI_EMBEDDING_MODEL =
  OPENAI_EMBEDDING_MODELS.TEXT_EMBEDDING_ADA_002

export const GEMINI_EMBEDDING_MODELS = {
  TEXT_EMBEDDING_004: "text-embedding-004",
} as const

export type GeminiEmbeddingModel =
  (typeof GEMINI_EMBEDDING_MODELS)[keyof typeof GEMINI_EMBEDDING_MODELS]

export const DEFAULT_GEMINI_EMBEDDING_MODEL =
  GEMINI_EMBEDDING_MODELS.TEXT_EMBEDDING_004

export const IMAGE_EXTENSIONS = {
  PNG: ".png",
  JPG: ".jpg",
  JPEG: ".jpeg",
  GIF: ".gif",
  WEBP: ".webp",
  SVG: ".svg",
} as const

export type ImageExtension =
  (typeof IMAGE_EXTENSIONS)[keyof typeof IMAGE_EXTENSIONS]

export const SUPPORTED_IMAGE_EXTENSIONS = [
  IMAGE_EXTENSIONS.PNG,
  IMAGE_EXTENSIONS.JPG,
  IMAGE_EXTENSIONS.JPEG,
  IMAGE_EXTENSIONS.GIF,
  IMAGE_EXTENSIONS.WEBP,
  IMAGE_EXTENSIONS.SVG,
] as const

export const DEFAULT_MAX_TOKENS = 250
export const GEMINI_MIN_TOKENS = 500
export const maxConversationHistory = 100

export const TOOL_RESULT_PREFIX = "Tool "
export const TOOL_RESULT_SUFFIX = " result: "

export const MAGIC_NUMBERS = {
  ZERO_MESSAGE_COUNT: 0,
} as const
