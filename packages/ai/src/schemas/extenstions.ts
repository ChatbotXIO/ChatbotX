import z from "zod"

export const allowableKnowledgeExtensionsMap = () => {
  return {
    "text/plain": [".txt"],
    "application/pdf": [".pdf"],
    "text/markdown": [".md"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
      ".docx",
    ],
  }
}

export const getAllowableKnowledgeExtensions = () => {
  return Object.values(allowableKnowledgeExtensionsMap()).flat().join(",")
}

export const supportedImageExtensions = z.enum([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
])
export type SupportedImageExtension = z.infer<typeof supportedImageExtensions>
