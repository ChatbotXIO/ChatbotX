export const MIME_TYPE_MAP: Record<string, string> = {
  msg: "application/vnd.ms-outlook",
  eml: "message/rfc822",
  properties: "text/plain",
  vtt: "text/vtt",
  mdx: "text/markdown",
  markdown: "text/markdown",
  md: "text/markdown",
  xml: "application/xml",
  htm: "text/html",
  html: "text/html",
  txt: "text/plain",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
}

export const getMimeTypeFromFile = (file: File): string => {
  const fallbackMimeType = "application/octet-stream"

  const fileMimeType = file.type?.trim()
  if (fileMimeType) {
    return fileMimeType
  }

  const extension = file.name.split(".").pop()?.toLowerCase() || ""
  return MIME_TYPE_MAP[extension] || fallbackMimeType
}


