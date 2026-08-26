import { describe, expect, test } from "vitest"
import {
  wizardDefaultValues,
  wizardFormSchema,
} from "@/features/ads-campaign/components/create-ad-wizard/wizard-form-schema"
import { buildCreateMessagingAdRequest } from "@/features/ads-campaign/lib/build-create-request"

const baseValues = {
  ...wizardDefaultValues,
  name: "My ad",
  adAccountId: "act_9",
  dailyBudgetMinorUnits: 2000,
  countries: ["US"],
  mediaKind: "image" as const,
  imageHash: "hash_1",
  imageLink: "https://example.com",
  welcomeMessageType: "default" as const,
}

describe("wizardFormSchema", () => {
  test("valid values pass", () => {
    expect(wizardFormSchema.safeParse(baseValues).success).toBe(true)
  })

  test("rejects when no media has been uploaded", () => {
    const result = wizardFormSchema.safeParse({
      ...baseValues,
      mediaKind: "",
      imageHash: "",
      imageLink: "",
    })
    expect(result.success).toBe(false)
  })

  test("rejects a video that has not finished processing", () => {
    const result = wizardFormSchema.safeParse({
      ...baseValues,
      mediaKind: "video",
      videoId: "vid_1",
      videoReady: false,
    })
    expect(result.success).toBe(false)
  })

  test("accepts a video once ready", () => {
    const result = wizardFormSchema.safeParse({
      ...baseValues,
      mediaKind: "video",
      videoId: "vid_1",
      videoReady: true,
    })
    expect(result.success).toBe(true)
  })

  test("rejects a single welcome message with no text", () => {
    const result = wizardFormSchema.safeParse({
      ...baseValues,
      welcomeMessageType: "single",
      welcomeMessageSingle: "",
    })
    expect(result.success).toBe(false)
  })

  test("rejects templates mode with zero templates", () => {
    const result = wizardFormSchema.safeParse({
      ...baseValues,
      welcomeMessageType: "templates",
      welcomeMessageTemplates: [],
    })
    expect(result.success).toBe(false)
  })
})

describe("buildCreateMessagingAdRequest", () => {
  test("maps an image creative", () => {
    const request = buildCreateMessagingAdRequest(baseValues, {
      workspaceId: "ws_1",
      channel: "messenger",
      integrationId: "im_1",
    })
    expect(request.creative.media).toEqual({
      kind: "image",
      imageHash: "hash_1",
      link: "https://example.com",
      message: undefined,
      headline: undefined,
      description: undefined,
      caption: undefined,
    })
    expect(request.whatsappPageIntegrationId).toBeUndefined()
  })

  test("maps a video creative", () => {
    const request = buildCreateMessagingAdRequest(
      {
        ...baseValues,
        mediaKind: "video",
        videoId: "vid_1",
        videoReady: true,
        videoTitle: "Great deal",
      },
      { workspaceId: "ws_1", channel: "messenger", integrationId: "im_1" },
    )
    expect(request.creative.media).toEqual({
      kind: "video",
      videoId: "vid_1",
      thumbnailImageHash: undefined,
      title: "Great deal",
      message: undefined,
      linkDescription: undefined,
    })
  })

  test("defaults special ad categories to NONE when nothing is selected", () => {
    const request = buildCreateMessagingAdRequest(baseValues, {
      workspaceId: "ws_1",
      channel: "messenger",
      integrationId: "im_1",
    })
    expect(request.campaign.specialAdCategories).toEqual(["NONE"])
  })

  test("includes whatsappPageIntegrationId only for the whatsapp channel", () => {
    const request = buildCreateMessagingAdRequest(
      { ...baseValues, whatsappPageIntegrationId: "im_page_1" },
      { workspaceId: "ws_1", channel: "whatsapp", integrationId: "wa_1" },
    )
    expect(request.whatsappPageIntegrationId).toBe("im_page_1")
  })

  test("converts select-backed age strings to numbers", () => {
    const request = buildCreateMessagingAdRequest(
      { ...baseValues, ageMin: "18", ageMax: "35" },
      { workspaceId: "ws_1", channel: "messenger", integrationId: "im_1" },
    )
    expect(request.adSet.targeting.ageMin).toBe(18)
    expect(request.adSet.targeting.ageMax).toBe(35)
  })

  test("maps a templates welcome message", () => {
    const request = buildCreateMessagingAdRequest(
      {
        ...baseValues,
        welcomeMessageType: "templates",
        welcomeMessageTemplates: [
          { heading: "Hi", message: "Welcome!" },
          { heading: "", message: "Need help?" },
        ],
      },
      { workspaceId: "ws_1", channel: "messenger", integrationId: "im_1" },
    )
    expect(request.creative.welcomeMessage).toEqual({
      type: "templates",
      templates: [
        { heading: "Hi", message: "Welcome!" },
        { heading: undefined, message: "Need help?" },
      ],
    })
  })
})
