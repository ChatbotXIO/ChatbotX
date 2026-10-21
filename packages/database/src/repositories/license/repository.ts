import { db, eq } from "../../client"
import { licenseModel } from "../../schema"

class LicenseRepository {
  async findTokenByLicenseId(licenseId: string): Promise<string | undefined> {
    const [row] = await db
      .select({ token: licenseModel.token })
      .from(licenseModel)
      .where(eq(licenseModel.licenseId, licenseId))
      .limit(1)

    return row?.token
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
