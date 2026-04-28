import { pgEnum } from "drizzle-orm/pg-core"
import {
  contentTypes,
  fileTypes,
  messageTypes,
  senderTypes,
} from "../../../partials"

export const senderType = pgEnum(
  "senderType",
  senderTypes.options as [string, ...string[]],
)

export const messageType = pgEnum(
  "messageType",
  messageTypes.options as [string, ...string[]],
)

export const contentType = pgEnum(
  "contentType",
  contentTypes.options as [string, ...string[]],
)

export const fileType = pgEnum(
  "fileType",
  fileTypes.options as [string, ...string[]],
)
