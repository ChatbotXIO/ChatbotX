import { describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// whatsappMessageTemplateRepository.syncForIntegration — reconciles the
// locally-cached WhatsApp message templates for an integration against
// Meta's list: deletes stale rows, updates existing ones, inserts new ones.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  inArray: vi.fn((column: unknown, values: unknown[]) => ({
    inArray: [column, values],
  })),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
  createId: vi.fn(() => "new-id"),
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: mocks.createId,
}))

vi.mock("../src/client", () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
    delete: mocks.del,
  },
  eq: mocks.eq,
  inArray: mocks.inArray,
}))

vi.mock("../src/schema", () => ({
  whatsappMessageTemplateModel: {
    id: "id",
    sourceId: "sourceId",
    integrationWhatsappId: "integrationWhatsappId",
    name: "name",
    language: "language",
    category: "category",
    status: "status",
    components: "components",
  },
}))

const { whatsappMessageTemplateRepository } = await import(
  "../src/repositories/whatsapp-message-template/repository"
)

function selectChain(finalResult: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => Promise.resolve(finalResult)),
  }
  return builder
}

function mutationChain() {
  const builder = {
    values: vi.fn(() => Promise.resolve(undefined)),
    set: vi.fn(() => builder),
    where: vi.fn(() => Promise.resolve(undefined)),
  }
  return builder
}

describe("whatsappMessageTemplateRepository.syncForIntegration", () => {
  test("deletes stale templates, updates existing ones, inserts new ones", async () => {
    mocks.select.mockReturnValue(
      selectChain([
        { id: "tpl_stale", sourceId: "src_stale" },
        { id: "tpl_existing", sourceId: "src_existing" },
      ]),
    )
    const deleteBuilder = mutationChain()
    const updateBuilder = mutationChain()
    const insertBuilder = mutationChain()
    mocks.del.mockReturnValue(deleteBuilder)
    mocks.update.mockReturnValue(updateBuilder)
    mocks.insert.mockReturnValue(insertBuilder)

    const tx = {
      select: mocks.select,
      insert: mocks.insert,
      update: mocks.update,
      delete: mocks.del,
    } as unknown as Parameters<
      typeof whatsappMessageTemplateRepository.syncForIntegration
    >[1]

    await whatsappMessageTemplateRepository.syncForIntegration(
      {
        integrationWhatsappId: "iw_1",
        templates: [
          {
            id: "src_existing",
            name: "Existing Template",
            language: "en_US",
            category: "UTILITY",
            status: "APPROVED",
            components: [],
          },
          {
            id: "src_new",
            name: "New Template",
            language: "en_US",
            category: "MARKETING",
            status: "PENDING",
            components: [],
          },
        ],
      },
      tx,
    )

    expect(mocks.del).toHaveBeenCalled()
    expect(mocks.inArray).toHaveBeenCalledWith("id", ["tpl_stale"])

    expect(updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Existing Template",
        status: "APPROVED",
      }),
    )

    expect(insertBuilder.values).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "new-id",
        name: "New Template",
        sourceId: "src_new",
        integrationWhatsappId: "iw_1",
      }),
    ])
  })

  test("opens its own transaction when tx is omitted", async () => {
    const transactionSpy = vi.fn(
      async (callback: (client: unknown) => Promise<unknown>) => {
        const client = {
          select: mocks.select,
          insert: mocks.insert,
          update: mocks.update,
          delete: mocks.del,
        }
        return await callback(client)
      },
    )

    mocks.select.mockReturnValue(selectChain([]))
    mocks.insert.mockReturnValue(mutationChain())

    vi.doMock("../src/client", () => ({
      db: {
        select: mocks.select,
        insert: mocks.insert,
        update: mocks.update,
        delete: mocks.del,
        transaction: transactionSpy,
      },
      eq: mocks.eq,
      inArray: mocks.inArray,
    }))
    vi.resetModules()

    const { whatsappMessageTemplateRepository: freshRepository } = await import(
      "../src/repositories/whatsapp-message-template/repository"
    )

    await freshRepository.syncForIntegration({
      integrationWhatsappId: "iw_1",
      templates: [],
    })

    expect(transactionSpy).toHaveBeenCalledOnce()
  })
})
