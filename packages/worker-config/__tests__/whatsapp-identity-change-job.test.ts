import { describe, expect, test } from "vitest"
import {
  IntegrationJobAction,
  type IntegrationJobWhatsappIdentityChange,
} from "../src/queues/integration"

describe("WhatsApp identity-change integration job", () => {
  test("exposes the action and typed normalized payload", () => {
    const job = {
      type: IntegrationJobAction.whatsappIdentityChange,
      data: {
        integrationType: "whatsapp",
        integrationIdentifier: "phone-1",
        payload: {
          phoneNumberId: "phone-1",
          messageId: "wamid.1",
          change: {
            kind: "userIdChanged",
            userId: "bsuid-new",
            previousPhone: "84900000001",
            newPhone: "84900000002",
          },
        },
      },
    } satisfies IntegrationJobWhatsappIdentityChange

    expect(job.type).toBe("whatsappIdentityChange")
  })
})
