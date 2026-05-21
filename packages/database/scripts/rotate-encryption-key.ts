/**
 * Re-encrypts all Credential rows from the previous key to the current key.
 *
 * Usage:
 *   pnpm --filter @chatbotx.io/database rotate:encryption-key [--dry-run]
 *
 * Required env vars:
 *   ENCRYPTION_KEY      — the new (target) key hex
 *   ENCRYPTION_KEY_ID   — the new key's ID (e.g. "k2")
 *   ENCRYPTION_KEY_PREV — the previous key hex (used to decrypt existing rows)
 *
 * Workflow:
 *   1. Generate a new key:  openssl rand -hex 32
 *   2. Set ENCRYPTION_KEY_PREV=<old value of ENCRYPTION_KEY>
 *   3. Set ENCRYPTION_KEY=<new hex> and ENCRYPTION_KEY_ID=<new id>
 *   4. Run this script (--dry-run first to see row counts)
 *   5. Once complete, remove ENCRYPTION_KEY_PREV from env
 */
import { encryptUtils } from "@chatbotx.io/encryption"
import { eq } from "drizzle-orm"
import type { z } from "zod"
import { db } from "../src/client"
import {
  type CredentialByType,
  type CredentialType,
  credentialEncryptedSchema,
  credentialSchemas,
} from "../src/partials/credential"
import { platformCredentialModel } from "../src/schema/platform-credential"

const isDryRun = process.argv.includes("--dry-run")
const activeKid = process.env.ENCRYPTION_KEY_ID ?? "default"

const main = async (): Promise<void> => {
  if (!process.env.ENCRYPTION_KEY_PREV) {
    console.error(
      "Error: ENCRYPTION_KEY_PREV must be set to the previous encryption key.",
    )
    process.exit(1)
  }

  const rows = await db.select().from(platformCredentialModel)

  const toRotate = rows.filter((row) => {
    const result = credentialEncryptedSchema.safeParse(row.value)
    return result.success && result.data.kid !== activeKid
  })

  console.log(
    `Found ${toRotate.length} of ${rows.length} rows to rotate → kid="${activeKid}".`,
  )

  if (isDryRun) {
    console.log("Dry run — no changes written.")
    return
  }

  let rotated = 0
  let errors = 0

  for (const row of toRotate) {
    try {
      const blob = credentialEncryptedSchema.parse(row.value)
      const type = row.type as CredentialType
      const aad = row.userId
        ? `user:${row.userId}:${type}:${row.livemode}`
        : `platform:${type}:${row.livemode}`
      const schema = credentialSchemas[type] as unknown as z.ZodType<
        CredentialByType[CredentialType]
      >

      const config = await encryptUtils.decryptObject(blob, schema, aad)
      const newValue = await encryptUtils.encryptObject(config, aad)

      await db
        .update(platformCredentialModel)
        .set({ value: newValue })
        .where(eq(platformCredentialModel.id, row.id))

      rotated++
    } catch (error) {
      console.error(
        `[id:${row.id} userId:${row.userId ?? "platform"} type:${row.type}] Failed:`,
        error,
      )
      errors++
    }
  }

  console.log(`Rotation complete: ${rotated} rotated, ${errors} errors.`)
  if (errors > 0) {
    process.exit(1)
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Rotation failed:", error)
    process.exit(1)
  })
