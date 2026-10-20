import { db, eq } from "../../client"
import { licenseModel } from "../../schema"
import type { LicenseModel } from "../../types"

class LicenseRepository {
  async findByLicenseId(licenseId: string): Promise<LicenseModel | undefined> {
    const [row] = await db
      .select()
      .from(licenseModel)
      .where(eq(licenseModel.licenseId, licenseId))
      .limit(1)

    return row
  }

  async upsert(props: {
    licenseId: string
    token: string
    expiresAt: Date
  }): Promise<void> {
    await db
      .insert(licenseModel)
      .values(props)
      .onConflictDoUpdate({
        target: licenseModel.licenseId,
        set: {
          token: props.token,
          expiresAt: props.expiresAt,
          updatedAt: new Date(),
        },
      })
  }
}

export const licenseRepository = new LicenseRepository()
