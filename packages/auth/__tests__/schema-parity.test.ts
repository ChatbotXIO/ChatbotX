import { diffSchema, getExpectedSchema } from "@better-auth/core/db/internal"
import { mcp } from "@better-auth/mcp"
import {
  accountModel,
  jwkModel,
  oauthAccessTokenModel,
  oauthClientAssertionModel,
  oauthClientModel,
  oauthClientResourceModel,
  oauthConsentModel,
  oauthRefreshTokenModel,
  oauthResourceModel,
  sessionModel,
  userModel,
  verificationModel,
} from "@chatbotx.io/database/schema"
import { anonymous, jwt } from "better-auth/plugins"
import { getTableColumns } from "drizzle-orm"
import { describe, expect, test } from "vitest"
import { buildMcpPluginOptions } from "../src/mcp-config"

const oauthTableNames = [
  "jwks",
  "oauthAccessToken",
  "oauthClient",
  "oauthClientAssertion",
  "oauthClientResource",
  "oauthConsent",
  "oauthRefreshToken",
  "oauthResource",
]

describe("Better Auth OAuth schema parity", () => {
  test("requires every Better Auth OAuth table that the adapter maps", () => {
    const expected = getExpectedSchema({
      account: {
        additionalFields: {
          tenantId: {
            input: false,
            required: false,
            returned: false,
            type: "string",
          },
        },
      },
      database: {} as never,
      plugins: [
        anonymous(),
        jwt(),
        mcp(buildMcpPluginOptions("https://app.example.com/mcp")),
      ],
      secret: "test-secret",
      user: {
        additionalFields: {
          mustChangePassword: {
            input: false,
            required: false,
            returned: true,
            type: "boolean",
          },
          tenantId: {
            input: false,
            required: false,
            returned: false,
            type: "string",
          },
        },
      },
    })

    const schema = {
      account: accountModel,
      jwks: jwkModel,
      oauthAccessToken: oauthAccessTokenModel,
      oauthClient: oauthClientModel,
      oauthClientAssertion: oauthClientAssertionModel,
      oauthClientResource: oauthClientResourceModel,
      oauthConsent: oauthConsentModel,
      oauthRefreshToken: oauthRefreshTokenModel,
      oauthResource: oauthResourceModel,
      session: sessionModel,
      user: userModel,
      verification: verificationModel,
    }
    const actual = Object.entries(schema).map(([name, table]) => ({
      name,
      columns: Object.values(getTableColumns(table)).map((column) => ({
        hasDefault: column.hasDefault,
        name: column.name,
        nullable: !column.notNull,
      })),
    }))

    expect(Object.keys(expected)).toEqual(
      expect.arrayContaining(oauthTableNames),
    )
    expect(diffSchema(expected, actual)).toEqual([])
  })
})
