import type { SocialPostFeedPostAs } from "@chatbotx.io/database/partials"

export type PostAsHelpKey =
  | "posts.feeds.form.postAsHelpLink"
  | "posts.feeds.form.postAsHelpPhoto"
  | "posts.feeds.form.postAsHelpText"

export type PostAsWarningKey = "posts.feeds.form.postAsTextFacebookWarning"

export type PostAsHelp = {
  /** One line: what the chosen option does. */
  effectKey: PostAsHelpKey
  /** Set when the choice loses the link card on a selected network. */
  warningKey: PostAsWarningKey | null
}

const EFFECT_KEYS: Record<SocialPostFeedPostAs, PostAsHelpKey> = {
  link: "posts.feeds.form.postAsHelpLink",
  photo: "posts.feeds.form.postAsHelpPhoto",
  text: "posts.feeds.form.postAsHelpText",
}

/** Whether a "Text only" post would reach Facebook, which builds no link card from text. */
export const warnsTextOnlyOnFacebook = (
  postAs: SocialPostFeedPostAs,
  providers: readonly string[],
): boolean => postAs === "text" && providers.includes("facebook")

/** The helper line and the optional warning for the "Post as" choice. Pure: never changes the stored value. */
export const getPostAsHelp = (
  postAs: SocialPostFeedPostAs,
  providers: readonly string[],
): PostAsHelp => ({
  effectKey: EFFECT_KEYS[postAs],
  warningKey: warnsTextOnlyOnFacebook(postAs, providers)
    ? "posts.feeds.form.postAsTextFacebookWarning"
    : null,
})
