import { decisionRepository } from "@chatbotx.io/database/repositories"
import type {
  DecisionConnectionModel,
  DecisionProfileModel,
} from "@chatbotx.io/database/types"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { DecisionProfileForm } from "./contracts"
import { decisionProfileService } from "./profile-service"

const form: DecisionProfileForm = {
  connectionId: "10",
  decision: {
    instructions: "Classify the current customer intent.",
    options: [
      { description: "The customer wants to buy.", value: "purchase" },
      { description: "No other intent applies.", value: "other" },
    ],
    type: "choice",
  },
  model: "jev-1.13.0",
  name: "Customer intent",
  status: "enabled",
  thresholdConfig: null,
}

const connection = {
  id: form.connectionId,
  modelCatalog: [form.model],
} as DecisionConnectionModel
const profile = { id: "11" } as DecisionProfileModel

afterEach(() => vi.restoreAllMocks())

describe("DecisionProfileService", () => {
  test("creates a profile after separating workspace metadata from the strict form", async () => {
    vi.spyOn(
      decisionRepository,
      "findConnectionByIdForWorkspace",
    ).mockResolvedValue(connection)
    const createProfile = vi
      .spyOn(decisionRepository, "createProfile")
      .mockResolvedValue(profile)

    await expect(
      decisionProfileService.create({ ...form, workspaceId: "1" }),
    ).resolves.toBe(profile)

    expect(createProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: form.connectionId,
        name: form.name,
        workspaceId: "1",
      }),
    )
  })

  test("updates a profile after separating id and workspace metadata from the strict form", async () => {
    vi.spyOn(
      decisionRepository,
      "findProfileByIdForWorkspace",
    ).mockResolvedValue(profile)
    vi.spyOn(
      decisionRepository,
      "findConnectionByIdForWorkspace",
    ).mockResolvedValue(connection)
    const updateProfile = vi
      .spyOn(decisionRepository, "updateProfileForWorkspace")
      .mockResolvedValue(profile)

    await expect(
      decisionProfileService.update({
        ...form,
        id: profile.id,
        workspaceId: "1",
      }),
    ).resolves.toBe(profile)

    expect(updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ id: profile.id, workspaceId: "1" }),
    )
  })

  test("rejects a published flow mapping for a question outside the profile contract", async () => {
    vi.spyOn(
      decisionRepository,
      "findProfileByIdForWorkspace",
    ).mockResolvedValue({
      ...profile,
      contract: {
        inputs: [{ key: "currentMessage", required: true }],
        questions: [
          {
            instructions: "Classify the current customer intent.",
            key: "result",
            label: "Customer intent",
            options: [
              {
                description: "The customer wants to buy.",
                label: "Purchase",
                value: "purchase",
              },
              {
                description: "No other intent applies.",
                label: "Other",
                value: "other",
              },
            ],
            type: "choice",
          },
        ],
      },
    } as DecisionProfileModel)
    vi.spyOn(decisionRepository, "listCustomFieldTypesByIds").mockResolvedValue(
      [
        { id: "12", type: "shortText" },
        { id: "13", type: "shortText" },
      ] as never,
    )

    await expect(
      decisionProfileService.assertFlowReferencesPublishable({
        nodes: [
          {
            data: {
              details: {
                steps: [
                  {
                    contextCustomFieldIds: ["12"],
                    fieldMappings: [
                      {
                        customFieldId: "13",
                        customFieldType: "shortText",
                        questionKey: "stale_question",
                        value: "choice",
                      },
                    ],
                    id: "14",
                    profileId: "11",
                    states: [
                      { id: "15", stateType: "success" },
                      { id: "16", stateType: "skip" },
                      { id: "17", stateType: "error" },
                    ],
                    stepType: "evaluateDecision",
                  },
                ],
              },
            },
          },
        ] as never,
        workspaceId: "1",
      }),
    ).rejects.toThrow(
      "Evaluate Decision mapping is invalid for its Profile or custom field",
    )
  })
})
