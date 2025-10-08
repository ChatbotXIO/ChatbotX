import type { SendFileStepSchema } from "@aha.chat/flow-config"
import { uploadAttachment } from "../api/message"
import type { ZaloAuthValue } from "../schemas/definition"
import type { MessageTemplate } from "../schemas/webhook"

export async function* convertFlowStepFile(
  auth: ZaloAuthValue,
  payload: SendFileStepSchema,
): AsyncGenerator<MessageTemplate> {
  const {
    data: { token },
  } = await uploadAttachment(auth, "file", payload.url)

  yield {
    attachment: {
      type: "file",
      payload: {
        token: token as string,
      },
    },
  }
}
