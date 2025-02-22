import { prisma } from "@ahachat.ai/database"

export default (flowId: string, contactId: string) => {
  try {
    const flow = prisma.flow.findFirstOrThrow({ where: { id: flowId } })
    // todo Get conversation and send message flow
  } catch (e) {
    console.log("StartFlow error ", e)
  }
}
