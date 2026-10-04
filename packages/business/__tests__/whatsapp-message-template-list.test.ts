// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const findMany = vi.fn(async () => [])
const fakeDb = {
  query: { whatsappMessageTemplateModel: { findMany } },
}

vi.mock("@chatbotx.io/database/client", () => ({
  db: fakeDb,
  eq: vi.fn(),
  inArray: vi.fn(),
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  whatsappMessageTemplateModel: {},
}))

const { whatsappMessageTemplateService } = await import(
  "../src/whatsapp-message-template/service"
)

beforeEach(() => {
  findMany.mockClear()
})

describe("whatsappMessageTemplateService.list", () => {
  test("filters by status when one is given", async () => {
    await whatsappMessageTemplateService.list({
      where: { workspaceId: "ws-1", status: "APPROVED" },
    })

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "APPROVED" }),
      }),
    )
  })

  test("returns every status when none is given", async () => {
    await whatsappMessageTemplateService.list({
      where: { workspaceId: "ws-1" },
    })

    const [{ where }] = findMany.mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ]
    expect(where.status).toBeUndefined()
  })
})
