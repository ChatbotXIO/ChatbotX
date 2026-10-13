import {
  chooseChannelStepDefaultFn,
  openWebsiteStepDefaultFn,
  type SendMessageNodeSchema,
  sendTextStepDefaultFn,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"

/** Default welcome text for a friend arriving via a referral link (editable in Flow Builder). */
export const LEADERBOARD_WELCOME_TEXT =
  "Hi {{first_name}}! 👋 {{referral_name}} invited you to join the leaderboard. Tap below to see the ranking and start earning points."

/**
 * One "Send Message" start node: the welcome text plus a button opening the
 * public leaderboard page (the URL carries `{{leaderboard_view_token}}`, so
 * the friend lands on their own personal bar). Same shape as the appointment
 * calendar's default booking flows.
 */
export function buildLeaderboardWelcomeNode(input: {
  text: string
  buttonLabel: string
  viewUrl: string
}): SendMessageNodeSchema {
  return {
    id: createId(),
    position: { x: 100, y: 300 },
    measured: { width: 288, height: 100 },
    type: "sendMessage",
    data: {
      name: "Start",
      isStartNode: true,
      details: {
        beforeStep: chooseChannelStepDefaultFn(),
        steps: [
          {
            ...sendTextStepDefaultFn({ text: input.text }),
            buttons: [
              {
                id: createId(),
                label: input.buttonLabel,
                buttonType: "openWebsite",
                beforeStep: {
                  ...openWebsiteStepDefaultFn(),
                  url: input.viewUrl,
                },
                steps: [],
              },
            ],
          },
        ],
        quickReplies: [],
      },
    },
  }
}
