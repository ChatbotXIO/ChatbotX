import type {
  WizardFormValues,
  WizardMessagingAdChannel,
} from "../components/create-ad-wizard/wizard-form-schema"
import type { CreateMessagingAdRequest } from "../schema/wizard"

/**
 * A `datetime-local` input yields a bare `"YYYY-MM-DDTHH:mm"` with NO timezone
 * offset. Sent unchanged, Meta would parse it in the ad account's timezone (or
 * reject it), so the user's wall-clock choice could schedule at the wrong
 * instant. Reinterpret it in the user's own timezone (how the picker presented
 * it) and emit a full UTC ISO instant, which Meta accepts unambiguously.
 */
function toMetaScheduleTime(local: string | undefined): string | undefined {
  if (!local) {
    return
  }
  const date = new Date(local)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function buildWelcomeMessage(
  values: WizardFormValues,
): CreateMessagingAdRequest["creative"]["welcomeMessage"] {
  if (values.welcomeMessageType === "default") {
    return { type: "default" }
  }
  if (values.welcomeMessageType === "single") {
    return { type: "single", message: values.welcomeMessageSingle }
  }
  return {
    type: "templates",
    templates: values.welcomeMessageTemplates.map((template) => ({
      heading: template.heading || undefined,
      message: template.message,
    })),
  }
}

/**
 * Maps the flat RHF form model to the oRPC `createMessagingAd` payload. Every
 * enumerable value here already came from a select/multi-select option (see
 * `wizard-form-schema.ts`), never free text — this function only reshapes,
 * it never has to guess/parse a user-typed enum value.
 */
export function buildCreateMessagingAdRequest(
  values: WizardFormValues,
  meta: {
    workspaceId: string
    channel: WizardMessagingAdChannel
    integrationId: string
  },
): CreateMessagingAdRequest {
  // Meta's `special_ad_categories` is an array; empty selection maps to the
  // `["NONE"]` sentinel (Meta rejects an empty array).
  const specialAdCategories = values.specialAdCategories.length
    ? values.specialAdCategories
    : ["NONE"]

  return {
    workspaceId: meta.workspaceId,
    channel: meta.channel,
    integrationId: meta.integrationId,
    whatsappPageIntegrationId:
      meta.channel === "whatsapp"
        ? values.whatsappPageIntegrationId || undefined
        : undefined,
    adAccountId: values.adAccountId,
    name: values.name,
    campaign: {
      specialAdCategories:
        specialAdCategories as CreateMessagingAdRequest["campaign"]["specialAdCategories"],
      specialAdCategoryCountry: values.specialAdCategoryCountry.length
        ? values.specialAdCategoryCountry
        : undefined,
    },
    adSet: {
      dailyBudgetMinorUnits: values.dailyBudgetMinorUnits,
      targeting: {
        countries: values.countries,
        ageMin: values.ageMin ? Number(values.ageMin) : undefined,
        ageMax: values.ageMax ? Number(values.ageMax) : undefined,
        genders: values.genders.length
          ? (values.genders.map(Number) as (1 | 2)[])
          : undefined,
      },
      startTime: toMetaScheduleTime(values.startTime),
      endTime: toMetaScheduleTime(values.endTime),
    },
    creative: {
      media:
        values.mediaKind === "image"
          ? {
              kind: "image",
              imageHash: values.imageHash,
              link: values.imageLink,
              message: values.imageMessage || undefined,
              headline: values.imageHeadline || undefined,
              description: values.imageDescription || undefined,
              caption: values.imageCaption || undefined,
            }
          : {
              kind: "video",
              videoId: values.videoId,
              thumbnailImageHash: values.videoThumbnailHash || undefined,
              title: values.videoTitle || undefined,
              message: values.videoMessage || undefined,
              linkDescription: values.videoLinkDescription || undefined,
            },
      welcomeMessage: buildWelcomeMessage(values),
    },
  }
}
