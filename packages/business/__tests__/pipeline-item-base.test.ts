// @vitest-environment node

import { db } from "@chatbotx.io/database/client"
import { DrizzleQueryError } from "drizzle-orm/errors"
import { afterEach, describe, expect, test, vi } from "vitest"
import { PipelineItemBaseService } from "../src/pipeline/item-base.service"

/** Exposes the protected `mutate` the item services share. */
class Probe extends PipelineItemBaseService {
  run() {
    return this.mutate(() => Promise.resolve("done"))
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("PipelineItemBaseService.mutate", () => {
  test("a row deleted between the existence check and the write is a 404", async () => {
    vi.spyOn(db, "transaction").mockRejectedValue(
      new DrizzleQueryError("insert", [], { code: "23503" } as Error),
    )

    await expect(new Probe().run()).rejects.toMatchObject({
      httpStatusCode: 404,
    })
  })

  test("any other database failure propagates unchanged so a job retries", async () => {
    const timeout = new DrizzleQueryError("insert", [], {
      code: "57014",
    } as Error)
    vi.spyOn(db, "transaction").mockRejectedValue(timeout)

    await expect(new Probe().run()).rejects.toBe(timeout)
  })
})
