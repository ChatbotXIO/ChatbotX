import type { PostIssueCode } from "@chatbotx.io/utils/post-publishing"
import type { SocialContentType } from "@chatbotx.io/utils/social-account"
import { useTranslations } from "next-intl"

/** Static keys, so the i18n guard checks each one exists in every locale source. */
export const useIssueMessages = (): Record<PostIssueCode, string> => {
  const t = useTranslations()
  return {
    accountDisconnected: t("composer.issues.accountDisconnected"),
    accountNeedsReauth: t("composer.issues.accountNeedsReauth"),
    contentTypeDisabled: t("composer.issues.contentTypeDisabled"),
    contentTypeNotSupported: t("composer.issues.contentTypeNotSupported"),
    destinationInactive: t("composer.issues.destinationInactive"),
    destinationNotFound: t("composer.issues.destinationNotFound"),
    inboxDisconnected: t("composer.issues.inboxDisconnected"),
    inboxNeedsReconnect: t("composer.issues.inboxNeedsReconnect"),
    publishPermissionMissing: t("composer.issues.publishPermissionMissing"),
    linkNotSupported: t("composer.issues.linkNotSupported"),
    linkRequired: t("composer.issues.linkRequired"),
    mediaFormatNotSupported: t("composer.issues.mediaFormatNotSupported"),
    mediaKindNotAllowed: t("composer.issues.mediaKindNotAllowed"),
    mediaTooFew: t("composer.issues.mediaTooFew"),
    mediaTooLarge: t("composer.issues.mediaTooLarge"),
    mediaTooLong: t("composer.issues.mediaTooLong"),
    mediaTooMany: t("composer.issues.mediaTooMany"),
    mediaTooShort: t("composer.issues.mediaTooShort"),
    firstCommentNotSupported: t("composer.issues.firstCommentNotSupported"),
    optionsInvalid: t("composer.issues.optionsInvalid"),
    partTextRequired: t("composer.issues.partTextRequired"),
    partTextTooLong: t("composer.issues.partTextTooLong"),
    partsNotSupported: t("composer.issues.partsNotSupported"),
    textRequired: t("composer.issues.textRequired"),
    textTooLong: t("composer.issues.textTooLong"),
    tooManyLinks: t("composer.issues.tooManyLinks"),
    tooManyParts: t("composer.issues.tooManyParts"),
  }
}

export const useContentTypeLabels = (): Record<SocialContentType, string> => {
  const t = useTranslations()
  return {
    carousel: t("composer.contentTypes.carousel"),
    image: t("composer.contentTypes.image"),
    link: t("composer.contentTypes.link"),
    reel: t("composer.contentTypes.reel"),
    story: t("composer.contentTypes.story"),
    text: t("composer.contentTypes.text"),
    video: t("composer.contentTypes.video"),
  }
}
