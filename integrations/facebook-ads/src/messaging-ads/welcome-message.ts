import type { PageWelcomeMessage, PageWelcomeMessageTemplate } from "./types"

/** Meta's "series of up to 5 template messages" welcome-message A/B set cap. */
export const MAX_WELCOME_MESSAGE_TEMPLATES = 5

function buildQuickReplies(quickReplies?: { title: string }[]) {
  return quickReplies?.length
    ? quickReplies.map((reply) => ({ title: reply.title }))
    : undefined
}

function buildSingleMessagePayload(
  message: string,
  quickReplies?: { title: string }[],
) {
  return {
    type: "VISUAL_EDITOR",
    version: 1,
    landing_screen_type: "welcome_message",
    media_type: "text",
    text_format: {
      customer_action_type: "VISUAL_EDITOR_CUSTOMER_ACTIONS",
      content: {
        title: message,
        quick_replies: buildQuickReplies(quickReplies),
      },
    },
  }
}

function buildTemplatePayload(template: PageWelcomeMessageTemplate) {
  return {
    type: "VISUAL_EDITOR",
    version: 1,
    landing_screen_type: "welcome_message",
    media_type: "text",
    text_format: {
      customer_action_type: "VISUAL_EDITOR_CUSTOMER_ACTIONS",
      content: {
        ...(template.heading ? { title: template.heading } : {}),
        message: template.message,
        quick_replies: buildQuickReplies(template.quickReplies),
      },
    },
  }
}

/**
 * Assembles the `page_welcome_message` string value sent in `object_story_spec`.
 *
 * // Phase 0 confirm (out/plan/ctm-ctid-ads-manager.md "Ad Creative"; CTWA
 * delta out/plan/ctwa-ads-manager.md "Ad creative"): this JSON shape is
 * pinned from Meta's public "Filling out Page Welcome Message" guide
 * structure, NOT verified against a live v23.0 create call. In particular the
 * "up to 5 templates" test-set encoding (a JSON array under the same key vs.
 * a nested `test_variants` field) is an assumption pending Phase 0 — this
 * function is the ONE place to correct it, and `__tests__/welcome-message.test.ts`
 * pins the current assumed output so a Phase-0 correction shows as an
 * intentional, reviewable test diff rather than a silent behavior change.
 *
 * `type: "default"` returns `undefined` — Meta applies its own default
 * welcome text (CTWA default: "Hello! Can I get more info on this?") when the
 * field is omitted, so there is nothing to send.
 */
export function buildPageWelcomeMessage(
  welcomeMessage: PageWelcomeMessage,
): string | undefined {
  if (welcomeMessage.type === "default") {
    return
  }

  if (welcomeMessage.type === "single") {
    return JSON.stringify(
      buildSingleMessagePayload(
        welcomeMessage.message,
        welcomeMessage.quickReplies,
      ),
    )
  }

  const templates = welcomeMessage.templates.slice(
    0,
    MAX_WELCOME_MESSAGE_TEMPLATES,
  )
  if (templates.length === 1) {
    return JSON.stringify(
      buildTemplatePayload(templates[0] as PageWelcomeMessageTemplate),
    )
  }
  return JSON.stringify(templates.map(buildTemplatePayload))
}
