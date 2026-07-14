import { beforeEach, describe, expect, test, vi } from "vitest"

const state = {
  auth: { authType: "custom", apiKey: "secret-key" },
  fields: {} as Record<string, string>,
}

const runAction = vi.fn(async () => ({ job_id: "job-secret" }))
const errorLog = vi.fn()
const infoLog = vi.fn()

function makeSendGridActionResult(action: string) {
  if (action === "checkImportJob") {
    return {
      status: "completed",
      results: {
        requested_count: 1,
        created_count: 1,
        updated_count: 0,
        errored_count: 0,
      },
    }
  }

  return { job_id: "job-secret" }
}

vi.mock("@chatbotx.io/business", () => ({
  buildContext: vi.fn(async ({ integration }: { integration: unknown }) => ({
    auth: state.auth,
    integration,
  })),
  integrationSendGridService: {
    findByWorkspaceIdOrFail: vi.fn(async () => ({ auth: "encrypted" })),
  },
}))

vi.mock("@chatbotx.io/encryption", () => ({
  encryptedDataSchema: { parse: vi.fn((value: unknown) => value) },
  encryptUtils: { decryptObject: vi.fn(async () => state.auth) },
}))

vi.mock("@chatbotx.io/integration-sendgrid", () => ({
  SendGridApiError: class extends Error {},
  sendGridAuthSchema: {},
  integration: { runAction },
}))

vi.mock("../src/integration/handlers/contact-field-map", () => ({
  getContactFieldMap: vi.fn(async () => state.fields),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: errorLog, info: infoLog },
}))

const { addSendGridContact } = await import(
  "../src/integration/handlers/sendgrid-handler"
)

const createProps = () =>
  ({
    conversation: {
      id: "conversation-1",
      workspaceId: "workspace-1",
      contactId: "contact-1",
    },
    step: {
      id: "step-1",
      listId: "list-1",
      emailField: "email",
      phoneField: "phone",
      mergeFields: [{ contactFieldId: "company", sendGridField: "field-1" }],
    },
  }) as Parameters<typeof addSendGridContact>[0]

beforeEach(() => {
  state.fields = {
    email: " Person@Example.COM ",
    phone: " phone-value ",
    first_name: " Ada ",
    last_name: " Lovelace ",
    company: " Analytical Engines ",
  }
  vi.clearAllMocks()
  runAction.mockImplementation(async (action: string) =>
    makeSendGridActionResult(action),
  )
})

describe("addSendGridContact", () => {
  test("normalizes and sends the exact accepted mutation once", async () => {
    await expect(addSendGridContact(createProps())).resolves.toEqual({
      status: "success",
      result: null,
    })
    expect(runAction).toHaveBeenCalledWith("addOrUpdateContact", {
      ctx: expect.any(Object),
      props: {
        list_ids: ["list-1"],
        contacts: [
          {
            email: "person@example.com",
            first_name: "Ada",
            last_name: "Lovelace",
            phone_number: "phone-value",
            custom_fields: { "field-1": "Analytical Engines" },
          },
        ],
      },
    })
    expect(runAction).toHaveBeenCalledWith("checkImportJob", {
      ctx: expect.any(Object),
      props: { jobId: "job-secret" },
    })
    const logs = JSON.stringify(infoLog.mock.calls)
    expect(logs).not.toContain("job-secret")
    expect(logs).not.toContain("person@example.com")
    expect(logs).not.toContain("secret-key")
  })

  test("omits list_ids when listId is absent", async () => {
    const props = createProps()
    props.step.listId = undefined
    await addSendGridContact(props)
    const [, { props: sentProps }] = runAction.mock.calls[0] as [
      string,
      { props: Record<string, unknown> },
    ]
    expect(sentProps).not.toHaveProperty("list_ids")
  })

  test("omits phone_number when phoneField is absent", async () => {
    const props = createProps()
    props.step.phoneField = undefined
    await addSendGridContact(props)
    const [, { props: sentProps }] = runAction.mock.calls[0] as [
      string,
      { props: { contacts: Record<string, unknown>[] } },
    ]
    expect(sentProps.contacts[0]).not.toHaveProperty("phone_number")
  })

  test("omits phone_number when phone field value is blank", async () => {
    state.fields.phone = "   "
    await addSendGridContact(createProps())
    const [, { props: sentProps }] = runAction.mock.calls[0] as [
      string,
      { props: { contacts: Record<string, unknown>[] } },
    ]
    expect(sentProps.contacts[0]).not.toHaveProperty("phone_number")
  })

  test("omits custom_fields when all mapping values are blank", async () => {
    state.fields.company = "   "
    await addSendGridContact(createProps())
    const [, { props: sentProps }] = runAction.mock.calls[0] as [
      string,
      { props: { contacts: Record<string, unknown>[] } },
    ]
    expect(sentProps.contacts[0]).not.toHaveProperty("custom_fields")
  })

  test("splits full_name when first_name and last_name are absent", async () => {
    state.fields = {
      email: "person@example.com",
      full_name: " Grace Murray Hopper ",
    }
    await addSendGridContact(createProps())
    const [, { props: sentProps }] = runAction.mock.calls[0] as [
      string,
      { props: { contacts: Record<string, unknown>[] } },
    ]
    expect(sentProps.contacts[0]).toMatchObject({
      first_name: "Grace",
      last_name: "Murray Hopper",
    })
  })

  test("returns error without calling SendGrid when email is empty", async () => {
    state.fields.email = " "
    await expect(addSendGridContact(createProps())).resolves.toEqual({
      status: "error",
      errorMessage: "SendGrid contact email is empty",
      result: null,
    })
    expect(runAction).not.toHaveBeenCalled()
  })

  test("routes to error when integration rejects on malformed accepted response", async () => {
    runAction.mockRejectedValueOnce(
      new Error("Validation failed: invalid job_id"),
    )
    await expect(addSendGridContact(createProps())).resolves.toMatchObject({
      status: "error",
      errorMessage: "Validation failed: invalid job_id",
    })
    expect(runAction).toHaveBeenCalledTimes(1)
  })

  test("routes provider failure to error with no PII logs", async () => {
    runAction.mockRejectedValueOnce(new Error("provider failed"))
    await expect(addSendGridContact(createProps())).resolves.toMatchObject({
      status: "error",
      errorMessage: "provider failed",
    })
    expect(runAction).toHaveBeenCalledTimes(1)
    const logs = JSON.stringify(errorLog.mock.calls)
    expect(logs).not.toContain("person@example.com")
    expect(logs).not.toContain("phone-value")
    expect(logs).not.toContain("Analytical Engines")
    expect(logs).not.toContain("secret-key")
  })

  test("single attempt only — does not retry on 429", async () => {
    runAction.mockRejectedValueOnce(new Error("rate limited"))
    await addSendGridContact(createProps())
    expect(runAction).toHaveBeenCalledTimes(1)
  })
})
