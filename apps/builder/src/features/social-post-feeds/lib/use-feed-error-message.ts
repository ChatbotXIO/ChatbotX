import { ORPCError } from "@orpc/client"
import { useTranslations } from "next-intl"

const API_ERROR_CODES = [
  "feedUrlTaken",
  "feedCheckCooldown",
  "feedCheckInProgress",
  "feedFetchRateLimited",
  "feedPreviewRateLimited",
  "feedNotParseable",
  "feedUnreachable",
  "feedTestRateLimited",
  "feedHasNoItems",
] as const

/** A problem with the feed address itself, shown under the address field. */
export type FeedUrlProblem = {
  message: string
  suggestedUrl: string | null
}

const suggestedUrlOf = (data: unknown): string | null => {
  if (typeof data === "object" && data !== null && "suggestedUrl" in data) {
    const { suggestedUrl } = data
    return typeof suggestedUrl === "string" ? suggestedUrl : null
  }
  return null
}

/** The message for a failed feed call: a known code is translated, anything else shows the server's text. */
export const useFeedErrorMessage = () => {
  const t = useTranslations()
  /** The address problem an error stands for, or null when it is about something else. */
  const urlProblemOf = (error: Error): FeedUrlProblem | null => {
    if (
      error instanceof ORPCError &&
      (error.code === "feedNotParseable" || error.code === "feedUnreachable")
    ) {
      return {
        message: t(`posts.feeds.apiError.${error.code}`),
        suggestedUrl: suggestedUrlOf(error.data),
      }
    }
    return null
  }
  const message = (error: Error): string => {
    if (error instanceof ORPCError) {
      const known = API_ERROR_CODES.find((code) => code === error.code)
      if (known) {
        return t(`posts.feeds.apiError.${known}`)
      }
    }
    return error.message
  }
  return Object.assign(message, { urlProblemOf })
}
