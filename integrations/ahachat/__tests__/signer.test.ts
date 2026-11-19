import { describe, expect, test } from "vitest"
import {
  buildCanonicalString,
  buildSignedHeaders,
  signCanonicalString,
} from "../src/signer"
import vectors from "./signing-vectors.json"

describe("request signer (Web Crypto)", () => {
  test.each(
    vectors.vectors,
  )("matches the shared vector for $path", async (vector) => {
    const canonical = await buildCanonicalString({
      keyId: vector.keyId,
      timestamp: vector.timestamp,
      nonce: vector.nonce,
      path: vector.path,
      body: vector.body,
    })

    expect(canonical).toBe(vector.canonical)
    expect(await signCanonicalString(vectors.hashKey, canonical)).toBe(
      vector.signature,
    )
  })

  test("builds the headers with the vector's signature and no signing key", async () => {
    const [vector] = vectors.vectors
    if (!vector) {
      throw new Error("missing vector")
    }

    const headers = await buildSignedHeaders(
      {
        id: vector.keyId,
        apiKey: vectors.apiKey,
        hashKey: vectors.hashKey,
      },
      {
        path: vector.path,
        body: vector.body,
        timestamp: vector.timestamp,
        nonce: vector.nonce,
      },
    )

    expect(headers["X-Aha-Signature"]).toBe(vector.signature)
    expect(headers["X-Aha-Api-Key"]).toBe(vectors.apiKey)
    expect(Object.values(headers)).not.toContain(vectors.hashKey)
  })

  test("a tampered body or path no longer matches the signature", async () => {
    const [vector] = vectors.vectors
    if (!vector) {
      throw new Error("missing vector")
    }
    const input = {
      keyId: vector.keyId,
      timestamp: vector.timestamp,
      nonce: vector.nonce,
      path: vector.path,
      body: vector.body,
    }

    const tamperedBody = await buildCanonicalString({
      ...input,
      body: `${vector.body} `,
    })
    const tamperedPath = await buildCanonicalString({
      ...input,
      path: "/api/contact-export/users",
    })

    expect(await signCanonicalString(vectors.hashKey, tamperedBody)).not.toBe(
      vector.signature,
    )
    expect(await signCanonicalString(vectors.hashKey, tamperedPath)).not.toBe(
      vector.signature,
    )
  })
})
