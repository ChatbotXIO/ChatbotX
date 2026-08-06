import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test, vi } from "vitest"
import { liftDecompressionLimit } from "../src/timescale"

describe("liftDecompressionLimit", () => {
  test("issues SET LOCAL with the exact TimescaleDB GUC name", async () => {
    const execute = vi.fn().mockResolvedValue(undefined)

    // Only `execute` is used; a minimal stub stands in for the client.
    await liftDecompressionLimit({ execute } as never)

    expect(execute).toHaveBeenCalledOnce()

    const rendered = new PgDialect().sqlToQuery(execute.mock.calls[0][0]).sql
    // The GUC name must match TimescaleDB's registered parameter exactly —
    // `_per_dml_transaction`, not the non-existent `_per_dml_operation`, which
    // would raise "unrecognized configuration parameter" at runtime.
    expect(rendered).toBe(
      "SET LOCAL timescaledb.max_tuples_decompressed_per_dml_transaction = 0",
    )
  })
})
