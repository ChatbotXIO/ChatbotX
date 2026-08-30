import { tagContract } from "@chatbotx.io/api-contract/tag"
import { OpenAPIGenerator } from "@orpc/openapi"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import { describe, expect, test } from "vitest"

const openAPIGenerator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
})

/**
 * Guards the public v1 tags contract (packages/api-contract/src/tag) against
 * silent breaking changes. A contract package's whole point is to be a
 * stable artifact independent of implementation churn — MCP tool names are
 * derived from `operationId`, and Postman/CLI consumers hard-code paths and
 * schemas — so a diff here on an unrelated PR is a signal to stop and check
 * whether the break is intentional (and needs a version bump / changelog
 * entry) before merging.
 *
 * Generated from `tagContract` directly (not the implemented
 * `tagWorkspaceTokenAPIs`) so this test never needs a real database
 * connection: a contract carries every field the OpenAPI generator reads
 * (route, input, output, errors) with zero business/database imports.
 */
describe("public v1 tags contract spec", () => {
  test("matches the committed snapshot", async () => {
    const spec = await openAPIGenerator.generate(tagContract, {
      info: { title: "ChatbotX", version: "0.0.1" },
    })

    expect(spec.paths?.["/v1/tags"]).toBeDefined()
    expect(spec).toMatchSnapshot()
  })
})
