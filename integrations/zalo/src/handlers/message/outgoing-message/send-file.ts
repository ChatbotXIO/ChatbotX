import type { SendFileStepSchema } from "@chatbotx.io/flow-config"
import type { SendFlowStepProps } from "@chatbotx.io/sdk"
import { uploadAttachment } from "../../../api/message"
import type { ZaloAuthValue } from "../../../schema/definition"
import type { MessageTemplate } from "../../../schema/webhook"

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
