import { type DatabaseClient, db } from "../../client"

class TenantRepository {
  async findById(tenantId: string, client: DatabaseClient = db) {
    return await client.query.tenantModel.findFirst({
      where: { id: tenantId },
      columns: { id: true, ownerId: true, status: true },
    })
  }

  async findByOwner(ownerId: string, client: DatabaseClient = db) {
    return await client.query.tenantModel.findFirst({
      where: { ownerId },
      columns: { id: true, ownerId: true, status: true },
    })
  }
}

export const tenantRepository = new TenantRepository()
