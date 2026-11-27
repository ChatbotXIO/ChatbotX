import { type DatabaseClient, db } from "../../client"
import type { OAuthClientModel } from "../../types"

class OAuthClientRepository {
  async findByClientId(
    clientId: string,
    tx: DatabaseClient = db,
  ): Promise<OAuthClientModel | null> {
    const row = await tx.query.oauthClientModel.findFirst({
      where: { clientId },
    })

    return row ?? null
  }
}

export const oauthClientRepository = new OAuthClientRepository()
