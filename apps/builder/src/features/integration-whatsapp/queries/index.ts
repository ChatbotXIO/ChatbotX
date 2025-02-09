import { prisma } from "@ahachat.ai/database"
import type { IntegrationWhatsappResource } from "../schemas"

export const getWhastappIntegration = async ({
  chatbotId,
}: { chatbotId: string }): Promise<{
  data: IntegrationWhatsappResource | null
}> => {
  const data = await prisma.integrationWhatsapp.findFirst({
    where: {
      chatbotId,
    },
  })

  return {
    data,
  }
}
