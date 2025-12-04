import { prisma } from "@aha.chat/database"

export async function updateAIAgentDefault(
  chatbotId: string,
  parsedInput: { defaultAgentId: string | null },
) {
  await prisma.$transaction(async (tx) => {
    await tx.aIAgent.updateMany({
      where: { chatbotId },
      data: { isDefault: false },
    })
    if (parsedInput.defaultAgentId) {
      await tx.aIAgent.update({
        where: { id: parsedInput.defaultAgentId },
        data: { isDefault: true },
      })
    }
  })
}
