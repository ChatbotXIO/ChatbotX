export const AI_FILE_EXTENSIONS = [
  "pdf",
  "md",
  "mdx",
  "docx",
  "doc",
  "txt",
  "csv",
  "xlsx",
  "xls",
  "html",
  "htm",
  "xml",
  "vtt",
  "properties",
  "eml",
  "msg",
  "markdown",
] as const

export const AI_FILE_ACCEPT = AI_FILE_EXTENSIONS.map(
  (extension) => `.${extension}`,
).join(",")
