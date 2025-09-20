export const TEXT = {
    assistantFoundPrefix: "I've found some information for you:",
    followUpUserInstruction:
        "Dựa trên kết quả tìm kiếm thông tin, hãy trả lời câu hỏi của khách hàng một cách tự nhiên và hữu ích. Kết quả tìm kiếm:",
    fileSearchNoResult: "Không tìm thấy file nào phù hợp với từ khóa tìm kiếm.",
    fileSearchErrorPrefix: "Lỗi khi tìm kiếm file:",
    fileSearchFoundPrefix: (count: number) => `Tìm thấy ${count} file(s) phù hợp:`,
    foundProductsFallbackPrefix:
        "Dạ em đã tìm thấy một số sản phẩm phù hợp cho {{gender}}:",
    // MCP related texts
    jsonRpcVersion: "2.0",
    contentType: "application/json",
    bearerTokenPrefix: "Bearer ",
    unknownError: "Unknown error",
    // Follow-up instruction
    followUpInstruction: "Hãy trả lời câu hỏi của tôi dựa trên thông tin sau:",
    // File search tool descriptions
    fileSearchDescription: "Tìm kiếm thông tin trong file upload về sản phẩm, chính sách, thông tin công ty. KHÔNG sử dụng cho lời chào hay khi khách hàng chỉ chào hỏi.",
    fileSearchQueryDescription: "Từ khóa tìm kiếm để tìm thông tin liên quan",
} as const

export const ROLES = {
    user: "user" as const,
    assistant: "assistant" as const,
    system: "system" as const,
}

export const TOOL_PREFIX = {
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
export type JsonType = typeof JSON_TYPE[keyof typeof JSON_TYPE]

export const AI_PROVIDERS = {
    OPENAI: "openAI",
    GEMINI: "gemini",
} as const

export type AIProvider = typeof AI_PROVIDERS[keyof typeof AI_PROVIDERS]

export const AUTH_TYPES = {
    TOKEN: "TOKEN",
    HEADERS: "HEADERS",
    NONE: "NONE",
} as const

export type AuthType = typeof AUTH_TYPES[keyof typeof AUTH_TYPES]

export const OPENAI_EMBEDDING_MODELS = {
    TEXT_EMBEDDING_3_LARGE: "text-embedding-3-large",
    TEXT_EMBEDDING_3_SMALL: "text-embedding-3-small",
    TEXT_EMBEDDING_ADA_002: "text-embedding-ada-002",
} as const

export type OpenAIEmbeddingModel = typeof OPENAI_EMBEDDING_MODELS[keyof typeof OPENAI_EMBEDDING_MODELS]

export const DEFAULT_OPENAI_EMBEDDING_MODEL = OPENAI_EMBEDDING_MODELS.TEXT_EMBEDDING_ADA_002

export const IMAGE_EXTENSIONS = {
    PNG: ".png",
    JPG: ".jpg",
    JPEG: ".jpeg",
    GIF: ".gif",
    WEBP: ".webp",
    SVG: ".svg",
} as const

export type ImageExtension = typeof IMAGE_EXTENSIONS[keyof typeof IMAGE_EXTENSIONS]

export const SUPPORTED_IMAGE_EXTENSIONS = [
    IMAGE_EXTENSIONS.PNG,
    IMAGE_EXTENSIONS.JPG,
    IMAGE_EXTENSIONS.JPEG,
    IMAGE_EXTENSIONS.GIF,
    IMAGE_EXTENSIONS.WEBP,
    IMAGE_EXTENSIONS.SVG,
] as const


