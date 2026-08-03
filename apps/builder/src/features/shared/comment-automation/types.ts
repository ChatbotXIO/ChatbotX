// Deliberately not importing FBCommentResource/IgCommentResource — both are
// structurally identical selections over the same underlying table, so this
// narrower shape lets fb-comments and ig-comments share these dialogs without
// either feature importing from the other.
export type CommentAutomationRow = {
  id: string
  workspaceId: string
  name: string
  startTime: string | null
  endTime: string | null
}

export type CommentAutomationTranslationNamespace =
  | "facebookCommentAutomation"
  | "instagramCommentAutomation"
  | "instagramStoryAutomation"
