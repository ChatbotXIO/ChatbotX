"use client"

import type { LeaderboardPlatform } from "@chatbotx.io/database/partials"
import { RadioGroupField } from "@chatbotx.io/ui/components/form/radio-group-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { ListChecksIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { SelectFacebookPostsDialog } from "@/features/fb-comments/components/select-facebook-posts-dialog"
import { FbCommentPostsStoreProvider } from "@/features/fb-comments/provider/fb-comment-posts-store-context"
import { SelectInstagramPostsDialog } from "@/features/ig-comments/components/select-instagram-posts-dialog"
import { IgCommentPostsStoreProvider } from "@/features/ig-comments/provider/ig-comment-posts-store-context"
import type { LeaderboardWizardInput } from "../../lib/wizard-schema"

/**
 * Messenger/Instagram scope: "All posts" or "Specific posts", the latter
 * picked with the comment-automation post picker (posts load only once the
 * picker is first opened).
 */
export function PostScopeField({
  platform,
  workspaceId,
}: {
  platform: Extract<LeaderboardPlatform, "messenger" | "instagram">
  workspaceId: string
}) {
  const t = useTranslations()
  const { control, setValue, getFieldState, formState } =
    useFormContext<LeaderboardWizardInput>()
  const postScope = useWatch({ control, name: "scope.postScope" })
  const postIds = useWatch({ control, name: "scope.postIds" }) ?? []
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const postIdsError = getFieldState("scope.postIds", formState).error

  const handleChange = (ids: string[]) =>
    setValue("scope.postIds", ids, { shouldDirty: true, shouldValidate: true })

  const openPicker = () => {
    setLoaded(true)
    setOpen(true)
  }

  const dialog =
    platform === "messenger" ? (
      <FbCommentPostsStoreProvider workspaceId={workspaceId}>
        <SelectFacebookPostsDialog
          onChange={handleChange}
          onOpenChange={setOpen}
          open={open}
          value={postIds}
        />
      </FbCommentPostsStoreProvider>
    ) : (
      <IgCommentPostsStoreProvider
        variant="instagram"
        workspaceId={workspaceId}
      >
        <SelectInstagramPostsDialog
          onChange={handleChange}
          onOpenChange={setOpen}
          open={open}
          value={postIds}
        />
      </IgCommentPostsStoreProvider>
    )

  return (
    <div className="flex flex-col gap-2">
      <RadioGroupField<LeaderboardWizardInput>
        label={t("leaderboards.wizard.postScope")}
        name="scope.postScope"
        options={[
          { label: t("leaderboards.scope.allPosts"), value: "all" },
          { label: t("leaderboards.scope.specificPosts"), value: "specific" },
        ]}
        orientation="horizontal"
      />
      {postScope === "specific" ? (
        <div className="flex flex-col gap-1">
          <Button
            className="w-fit"
            onClick={openPicker}
            type="button"
            variant="outline"
          >
            <ListChecksIcon />
            {t("leaderboards.wizard.choosePosts")}
            {postIds.length > 0
              ? ` (${t("leaderboards.scope.specificPostsCount", { count: postIds.length })})`
              : null}
          </Button>
          {postIdsError?.message ? (
            <p className="text-destructive text-sm">{postIdsError.message}</p>
          ) : null}
        </div>
      ) : null}
      {loaded ? dialog : null}
    </div>
  )
}
