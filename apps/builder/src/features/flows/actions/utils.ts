import { type Flow, prisma } from "@ahachat.ai/database"
import { FlowException } from "../schemas/exception"

export const ensureFlowIdIsExists = async (
  id: string,
  chatbotId: string,
): Promise<Flow> => {
  const flow = await prisma.flow.findFirst({
    where: {
      chatbotId,
      id,
    },
  })

  if (!flow) {
    throw new FlowException("Flow does not exists.")
  }

  return flow
}
