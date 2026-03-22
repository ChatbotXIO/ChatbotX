import type { SendFileStepSchema } from "@aha.chat/flow-config"
import type { SendFlowStepProps } from "@aha.chat/sdk"
import { uploadAttachment } from "../api/message"
import type { ZaloAuthValue } from "../schemas/definition"
import type { MessageTemplate } from "../schemas/webhook"

export async function* convertFlowStepFile(
  props: SendFlowStepProps<ZaloAuthValue, SendFileStepSchema>,
): AsyncGenerator<MessageTemplate> {
  const {
    data: { step },
  } = props
  if (!step.url?.trim()) {
    throw new Error("File URL is required")
  }

  const {
    data: { token },
  } = await uploadAttachment(props.ctx.auth, "file", step.url)

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
