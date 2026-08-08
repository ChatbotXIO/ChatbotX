import { z } from "zod"

export const rootFolderId = "0"

export const folderTypes = z.enum([
  "tag",
  "flow",
  "customField",
  "automatedResponse",
  "trigger",
  "webhook",
  "sequence",
  "emailTopic",
  "fbComment",
  "igComment",
  "igStory",
  "outboundAutomatedResponse",
])
export type FolderType = z.infer<typeof folderTypes>
