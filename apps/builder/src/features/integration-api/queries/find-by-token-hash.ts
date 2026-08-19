import { db } from "@chatbotx.io/database/client"
import type { IntegrationApiModel } from "@chatbotx.io/database/types"

/** Auth-path lookup — no user session, called from the bearer-token middleware. */
export const findIntegrationApiByTokenHash = async ({
  tokenHash,
}: {
  tokenHash: string
}): Promise<IntegrationApiModel | null> =>
  (await db.query.integrationApiModel.findFirst({
    where: { tokenHash },
  })) ?? null
