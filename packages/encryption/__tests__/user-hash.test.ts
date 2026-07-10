import { createHmac } from "node:crypto"
import { describe, expect, test } from "vitest"
import { env } from "../src/keys"
import { signUserHash } from "../src/user-hash"

describe("user hash signature", () => {
  test("signUserHash signs source and contact inbox ids deterministically", async () => {
    const expected = createHmac(
      "sha256",
      Buffer.from(env.ENCRYPTION_KEY, "hex"),
    )
      .update("source-1:contact-inbox-1")
      .digest("hex")

    const params = {
      sourceId: "source-1",
      contactInboxId: "contact-inbox-1",
    }

    await expect(signUserHash(params)).resolves.toBe(expected)
    await expect(signUserHash(params)).resolves.toBe(await signUserHash(params))
  })
})
