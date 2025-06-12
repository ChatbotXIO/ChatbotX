import { prisma } from "@ahachat.ai/database"
import type { IntegrationWhatsappResource } from "../schemas"

export const getWhastappIntegration = async ({
  chatbotId,
}: { chatbotId: string }): Promise<IntegrationWhatsappResource | null> => {
  return await prisma.integrationWhatsapp.findFirst({
    where: {
      chatbotId,
    },
  })
}
