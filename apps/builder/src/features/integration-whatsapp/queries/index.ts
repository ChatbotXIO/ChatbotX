import { prisma } from "@aha.chat/database"
import type { IntegrationWhatsappWhereInput } from "@aha.chat/database/types"
import type { IntegrationWhatsappResource } from "../schemas"

export const listIntegrationWhatsapps = async ({
  where,
}: {
  where: IntegrationWhatsappWhereInput
}): Promise<{ data: IntegrationWhatsappResource[] }> => {
  const data = await prisma.integrationWhatsapp.findMany({
    where,
    orderBy: {
      createdAt: "asc",
    },
  })

  return { data }
}

export const findIntegrationWhatsapp = async ({
  where,
}: {
  where: IntegrationWhatsappWhereInput
}): Promise<IntegrationWhatsappResource> => {
  return await prisma.integrationWhatsapp.findFirstOrThrow({
    where,
  })
}
