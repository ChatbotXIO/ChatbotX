import type { SendFileStepSchema } from "@aha.chat/flow-config"
import { uploadAttachment } from "../api/message"
import type { ZaloAuthValue } from "../schemas/definition"
import type { MessageTemplate } from "../schemas/webhook"

export async function* convertFlowStepFile(
  auth: ZaloAuthValue,
  payload: SendFileStepSchema,
): AsyncGenerator<MessageTemplate> {
  if (!payload.url?.trim()) {
    throw new Error("File URL is required")
  }

  const {
    data: { token },
  } = await uploadAttachment(auth, "file", payload.url)

  if (!token) {
    throw new Error("Failed to upload file: No token received")
  }

  yield {
    attachment: {
      type: "file",
      payload: {
        token,
      },
    },
  }
}
