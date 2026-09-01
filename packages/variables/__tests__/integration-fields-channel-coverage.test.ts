import { channelTypes } from "@chatbotx.io/database/partials"
import type {
  ContactInboxModel,
  ContactModel,
} from "@chatbotx.io/database/types"
import { beforeEach, expect, test, vi } from "vitest"
// Deep relative import on purpose: `@chatbotx.io/database` publishes no
// `./relations` subpath, and `InboxWithIntegrations` is a type (erased at
// runtime), so the relation definitions are the only executable source of
// "which integrations an inbox can actually carry". `packages/business`'s
// `inbox-with-integrations-relations.test.ts` pins that set to be exactly what
// `InboxService.withIntegrations` eager-loads.
import { inboxRelations } from "../../database/src/relations/inbox"

/**
 * `getChannelIntegrationId` and the `page_user_name` branch in
 * `integration-fields.ts` are per-channel switches that end in `default: return
 * null`. A channel with no `case` therefore resolves to `null` forever — the
 * `me` link cannot be built and `{{page_user_name}}` renders empty — with no
 * compile error and no runtime warning.
 *
 * The matrix is derived from the inbox relation definitions, not hardcoded, so
 * a channel added without threading it through both switches fails here.
 *
 * `api` is out of scope by construction: it has no `integration*` relation on
 * `inboxModel`, so `InboxWithIntegrations` never carries an `integrationApi`
 * row for these switches to read.
 */

const {
  mockFindRecentByContactId,
  mockFindWithIntegrationsById,
  mockResolveTenantSettings,
  mockResolveWorkspaceAppUrl,
  mockSignMeLink,
  mockSystemFieldCreate,
} = vi.hoisted(() => ({
  mockFindRecentByContactId: vi.fn(),
  mockFindWithIntegrationsById: vi.fn(),
  mockResolveTenantSettings: vi.fn(),
  mockResolveWorkspaceAppUrl: vi.fn(),
  mockSignMeLink: vi.fn(),
  mockSystemFieldCreate: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: {
    findRecentByContactId: mockFindRecentByContactId,
  },
  inboxService: {
    findWithIntegrationsById: mockFindWithIntegrationsById,
  },
  resolveTenantSettings: mockResolveTenantSettings,
  resolveWorkspaceAppUrl: mockResolveWorkspaceAppUrl,
}))

vi.mock("@chatbotx.io/business/contact-locale", () => ({
  normalizeStoredTimezone: (value: string) => value,
}))

vi.mock("@chatbotx.io/business/system-field", () => ({
  systemFieldService: { create: mockSystemFieldCreate },
}))

vi.mock("@chatbotx.io/encryption/link-signature", () => ({
  signMeLink: mockSignMeLink,
}))

vi.mock("@chatbotx.io/integration-instagram", () => ({
  fetchInstagramContactProfile: vi.fn(),
  getPostDetails: vi.fn(),
}))

vi.mock("@chatbotx.io/integration-messenger", () => ({
  getPostDetails: vi.fn(),
  getUserInboxLink: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: vi.fn((_key: string, resolve: () => Promise<unknown>) =>
    resolve(),
  ),
}))

const { getIntegrationField } = await import(
  "../src/helpers/integration-fields"
)

type RelationsPart = Record<string, { relations: Record<string, unknown> }>

const toChannel = (relation: string): string => {
  const suffix = relation.slice("integration".length)
  return `${suffix.charAt(0).toLowerCase()}${suffix.slice(1)}`
}

const channelsWithInboxIntegration = Object.keys(
  (inboxRelations as unknown as RelationsPart).inboxModel.relations,
)
  .filter((relation) => relation.startsWith("integration"))
  .map((relation) => ({ channel: toChannel(relation), property: relation }))
  .sort((a, b) => a.channel.localeCompare(b.channel))

const contact = {
  id: "contact-1",
  workspaceId: "workspace-1",
  timezone: "UTC",
} as ContactModel

const buildContactInbox = (channel: string) =>
  ({
    id: "contact-inbox-1",
    channel,
    inboxId: "inbox-1",
    sourceId: "source-1",
  }) as ContactInboxModel

beforeEach(() => {
  vi.clearAllMocks()
  mockResolveTenantSettings.mockResolvedValue({
    appUrl: "https://app.example.test",
  })
  mockResolveWorkspaceAppUrl.mockResolvedValue("https://app.example.test")
  mockSystemFieldCreate.mockResolvedValue({ id: "system-field-1" })
  mockSignMeLink.mockReturnValue("signature")
})

test("the derived channel matrix is non-empty and only contains real channels", () => {
  expect(channelsWithInboxIntegration.length).toBeGreaterThan(0)

  for (const { channel } of channelsWithInboxIntegration) {
    expect(channelTypes.options, `${channel} is not a ChannelType`).toContain(
      channel,
    )
  }
})

test.each(
  channelsWithInboxIntegration,
)("page_user_name resolves the $channel integration name", async ({
  channel,
  property,
}) => {
  mockFindWithIntegrationsById.mockResolvedValue({
    id: "inbox-1",
    [property]: { id: `integration-${channel}`, name: `Name ${channel}` },
  })

  await expect(
    getIntegrationField(contact, "page_user_name", buildContactInbox(channel)),
  ).resolves.toBe(`Name ${channel}`)
})

test.each(
  channelsWithInboxIntegration,
)("getChannelIntegrationId resolves the $channel integration id for the me link", async ({
  channel,
  property,
}) => {
  mockFindWithIntegrationsById.mockResolvedValue({
    id: "inbox-1",
    [property]: { id: `integration-${channel}`, name: `Name ${channel}` },
  })

  const link = await getIntegrationField(
    contact,
    "me",
    buildContactInbox(channel),
  )

  expect(
    link,
    `getChannelIntegrationId has no "${channel}" case, so the me link cannot be built for it`,
  ).not.toBeNull()
  expect(new URL(link as string).searchParams.get("ib")).toBe(
    `integration-${channel}`,
  )
})
