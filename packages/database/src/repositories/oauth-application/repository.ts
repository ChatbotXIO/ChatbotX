import { type DatabaseClient, db } from "../../client"
import type { OAuthApplicationModel } from "../../types"

class OAuthApplicationRepository {
  async findByClientId(
    clientId: string,
    tx: DatabaseClient = db,
  ): Promise<OAuthApplicationModel | null> {
    const row = await tx.query.oauthApplicationModel.findFirst({
      where: { clientId },
    })

    return row ?? null
  }
}

export const oauthApplicationRepository = new OAuthApplicationRepository()
