"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { RadioGroupField } from "@chatbotx.io/ui/components/form/radio-group-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@chatbotx.io/ui/components/ui/form"
import { TagsInputField } from "@chatbotx.io/ui/components/ui/muhammada86/tags-input-field"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { InfoIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import type { UseFormReturn } from "react-hook-form"
import { useWatch } from "react-hook-form"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import { useAIAgentStore } from "@/features/ai-agents/provider/ai-agent-store-context"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import type { CreateIgCommentRequest, IgCommentVariant } from "../schema/action"
import { SelectInstagramPostsDialog } from "./select-instagram-posts-dialog"

type IgCommentFormValues = CreateIgCommentRequest

type IgCommentFormProps = {
  form: UseFormReturn<IgCommentFormValues>
  variant: IgCommentVariant
  onSubmit: (e: React.FormEvent) => void
  isSubmitting: boolean
  onCancel: () => void
  submitLabel: string
}

export function IgCommentForm({
  form,
  variant,
  onSubmit,
  isSubmitting,
  onCancel,
  submitLabel,
}: IgCommentFormProps) {
  const t = useTranslations()
  const flowOptions = useFlowSelectOptions()
  const aiAgents = useAIAgentStore((state) => state.aiAgents)
  const aiAgentOptions = aiAgents.map((agent) => ({
    label: agent.name,
    value: String(agent.id),
  }))

  const [selectPostsOpen, setSelectPostsOpen] = useState(false)

  const postType = useWatch({ control: form.control, name: "post.type" })
  const postValue = useWatch({ control: form.control, name: "post.value" })

  const privateReplyType = useWatch({
    control: form.control,
    name: "privateReply.type",
  })
  const publicReplyType = useWatch({
    control: form.control,
    name: "publicReply.type",
  })
  const includeKeywordsType = useWatch({
    control: form.control,
    name: "includeKeywords.type",
  })
  const replyAfterType = useWatch({
    control: form.control,
    name: "replyAfter.type",
  })
  const hideCommentsKeywords = useWatch({
    control: form.control,
    name: "hideComments.hasKeywords",
  })

  const replyTypeOptions = [
    { label: t("instagramCommentAutomation.replyType.text"), value: "text" },
    { label: t("instagramCommentAutomation.replyType.flow"), value: "flow" },
    {
      label: t("instagramCommentAutomation.replyType.AIAgent"),
      value: "AIAgent",
    },
    { label: t("instagramCommentAutomation.replyType.none"), value: "none" },
  ]

  const postTypeOptions = [
    { label: t("instagramCommentAutomation.postType.all"), value: "all" },
    {
      label: t("instagramCommentAutomation.postType.specificPosts"),
      value: "postIds",
    },
  ]

  const includeKeywordsTypeOptions = [
    { label: t("instagramCommentAutomation.keywordsType.all"), value: "all" },
    {
      label: t("instagramCommentAutomation.keywordsType.equal"),
      value: "equal",
    },
    {
      label: t("instagramCommentAutomation.keywordsType.contain"),
      value: "contain",
    },
  ]

  const replyAfterTypeOptions = [
    {
      label: t("instagramCommentAutomation.replyAfterType.immediately"),
      value: "immediately",
    },
    {
      label: t("instagramCommentAutomation.replyAfterType.seconds"),
      value: "seconds",
    },
    {
      label: t("instagramCommentAutomation.replyAfterType.minutes"),
      value: "minutes",
    },
    {
      label: t("instagramCommentAutomation.replyAfterType.hours"),
      value: "hours",
    },
    {
      label: t(
        "instagramCommentAutomation.replyAfterType.randomWithin3Minutes",
      ),
      value: "randomWithin3Minutes",
    },
    {
      label: t(
        "instagramCommentAutomation.replyAfterType.randomWithin5Minutes",
      ),
      value: "randomWithin5Minutes",
    },
    {
      label: t(
        "instagramCommentAutomation.replyAfterType.randomWithin10Minutes",
      ),
      value: "randomWithin10Minutes",
    },
    {
      label: t(
        "instagramCommentAutomation.replyAfterType.randomWithin20Minutes",
      ),
      value: "randomWithin20Minutes",
    },
    {
      label: t(
        "instagramCommentAutomation.replyAfterType.randomWithin30Minutes",
      ),
      value: "randomWithin30Minutes",
    },
    {
      label: t(
        "instagramCommentAutomation.replyAfterType.randomWithin60Minutes",
      ),
      value: "randomWithin60Minutes",
    },
  ]

  const showCommentsAfterOptions = [
    {
      label: t("instagramCommentAutomation.showCommentsAfter.none"),
      value: "none",
    },
    { label: "6h", value: "6h" },
    { label: "12h", value: "12h" },
    { label: "1d", value: "1d" },
    { label: "2d", value: "2d" },
    { label: "3d", value: "3d" },
    { label: "4d", value: "4d" },
    { label: "5d", value: "5d" },
    { label: "6d", value: "6d" },
    { label: "7d", value: "7d" },
    { label: "8d", value: "8d" },
    { label: "9d", value: "9d" },
    { label: "10d", value: "10d" },
  ]

  const needsReplyAfterValue = ["seconds", "minutes", "hours"].includes(
    replyAfterType,
  )

  return (
    <form className="m-auto w-full max-w-200 space-y-6" onSubmit={onSubmit}>
      <InputField label={t("fields.name.label")} name="name" required />

      <Card>
        <CardHeader>
          <CardTitle>
            {t("instagramCommentAutomation.card.targeting")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 space-y-4">
          <RadioGroupField
            description={t(
              "instagramCommentAutomation.trackCommentsOnDescription",
            )}
            descriptionType="tooltip"
            label={t("instagramCommentAutomation.trackCommentsOn")}
            name="post.type"
            options={postTypeOptions}
            orientation="horizontal"
            required
          />

          {postType === "postIds" && (
            <>
              <Button
                onClick={() => setSelectPostsOpen(true)}
                type="button"
                variant="outline"
              >
                {t("instagramCommentAutomation.chooseSpecificPosts")}
                {postValue.length > 0 && ` (${postValue.length})`}
              </Button>
              <SelectInstagramPostsDialog
                onChange={(ids) =>
                  form.setValue("post.value", ids, { shouldValidate: true })
                }
                onOpenChange={setSelectPostsOpen}
                open={selectPostsOpen}
                value={postValue}
              />
            </>
          )}

          <div className="flex flex-col gap-2 space-y-2">
            <RadioGroupField
              description={t(
                "instagramCommentAutomation.privateReplyDescription",
              )}
              descriptionType="tooltip"
              label={t("instagramCommentAutomation.privateReply")}
              name="privateReply.type"
              options={replyTypeOptions}
              orientation="horizontal"
              required
            />
            {privateReplyType === "text" && (
              <TiptapEditorField
                channels={["instagram"]}
                label={t("instagramCommentAutomation.replyMessage")}
                name="privateReply.value"
                placeholder={t(
                  "instagramCommentAutomation.replyMessagePlaceholder",
                )}
                required
              />
            )}
            {privateReplyType === "flow" && (
              <ComboboxField
                emptyText={t("actions.noRecordFound")}
                label={t("fields.flow.label")}
                name="privateReply.value"
                options={flowOptions}
                placeholder={t("actions.pleaseSelect")}
                required
              />
            )}
            {privateReplyType === "AIAgent" && (
              <ComboboxField
                emptyText={t("actions.noRecordFound")}
                label={t("fields.aiAgent.label")}
                name="privateReply.value"
                options={aiAgentOptions}
                placeholder={t("actions.pleaseSelect")}
                required
              />
            )}
          </div>

          <div className="flex flex-col gap-2 space-y-2">
            <RadioGroupField
              description={t(
                "instagramCommentAutomation.publicReplyDescription",
              )}
              descriptionType="tooltip"
              label={t("instagramCommentAutomation.publicReply")}
              name="publicReply.type"
              options={replyTypeOptions}
              orientation="horizontal"
              required
            />
            {publicReplyType === "text" && (
              <TiptapEditorField
                channels={["instagram"]}
                label={t("instagramCommentAutomation.replyMessage")}
                name="publicReply.value"
                placeholder={t(
                  "instagramCommentAutomation.replyMessagePlaceholder",
                )}
                required
              />
            )}
            {publicReplyType === "flow" && (
              <ComboboxField
                emptyText={t("actions.noRecordFound")}
                label={t("fields.flow.label")}
                name="publicReply.value"
                options={flowOptions}
                placeholder={t("actions.pleaseSelect")}
                required
              />
            )}
            {publicReplyType === "AIAgent" && (
              <ComboboxField
                emptyText={t("actions.noRecordFound")}
                label={t("fields.aiAgent.label")}
                name="publicReply.value"
                options={aiAgentOptions}
                placeholder={t("actions.pleaseSelect")}
                required
              />
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("instagramCommentAutomation.card.filters")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2">
            <SelectField
              description={t(
                "instagramCommentAutomation.includeKeywordsTypeDescription",
              )}
              descriptionType="tooltip"
              label={t("instagramCommentAutomation.includeKeywordsType")}
              name="includeKeywords.type"
              options={includeKeywordsTypeOptions}
            />
            {includeKeywordsType !== "all" && (
              <div className="w-full">
                <FormField
                  control={form.control}
                  name="includeKeywords.value"
                  render={() => (
                    <FormItem>
                      <FormLabel>
                        {t("instagramCommentAutomation.includeKeywords")}
                      </FormLabel>
                      <FormControl>
                        <TagsInputField
                          name="includeKeywords.value"
                          placeholder={t(
                            "instagramCommentAutomation.keywordsPlaceholder",
                          )}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
          </div>

          <FormField
            control={form.control}
            name="excludeKeywords"
            render={() => (
              <FormItem>
                <FormLabel className="flex items-center gap-1">
                  {t("instagramCommentAutomation.excludeKeywords")}
                  <Tooltip>
                    <TooltipTrigger
                      render={() => (
                        <InfoIcon className="size-3.5 cursor-help text-muted-foreground" />
                      )}
                    />
                    <TooltipContent className="max-w-sm">
                      {t(
                        "instagramCommentAutomation.excludeKeywordsDescription",
                      )}
                    </TooltipContent>
                  </Tooltip>
                </FormLabel>
                <FormControl>
                  <TagsInputField
                    name="excludeKeywords"
                    placeholder={t(
                      "instagramCommentAutomation.keywordsPlaceholder",
                    )}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-3 border-t pt-4">
            <SwitchField
              description={t(
                "instagramCommentAutomation.options.replyToNewContactsOnlyDescription",
              )}
              descriptionType="tooltip"
              label={t(
                "instagramCommentAutomation.options.replyToNewContactsOnly",
              )}
              name="options.replyToNewContactsOnly"
              required
            />
            <SwitchField
              description={t(
                "instagramCommentAutomation.options.replyOncePerUserPerPostDescription",
              )}
              descriptionType="tooltip"
              label={t(
                "instagramCommentAutomation.options.replyOncePerUserPerPost",
              )}
              name="options.replyOncePerUserPerPost"
              required
            />
            {/* Instagram Business (Instagram Login) has no likeComment API — the
                option is hidden entirely rather than shown disabled, matching
                the same treatment for every other unsupported capability. */}
            {variant === "instagramFacebook" && (
              <SwitchField
                description={t(
                  "instagramCommentAutomation.options.likeUserCommentDescription",
                )}
                descriptionType="tooltip"
                label={t("instagramCommentAutomation.options.likeUserComment")}
                name="options.likeUserComment"
                required
              />
            )}
            <SwitchField
              description={t(
                "instagramCommentAutomation.options.replyToUsersWhoCommentedOnOtherPostsDescription",
              )}
              descriptionType="tooltip"
              label={t(
                "instagramCommentAutomation.options.replyToUsersWhoCommentedOnOtherPosts",
              )}
              name="options.replyToUsersWhoCommentedOnOtherPosts"
              required
            />
            <SwitchField
              description={t(
                "instagramCommentAutomation.options.ignoreCommentRepliesDescription",
              )}
              descriptionType="tooltip"
              label={t(
                "instagramCommentAutomation.options.ignoreCommentReplies",
              )}
              name="options.ignoreCommentReplies"
              required
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {t("instagramCommentAutomation.card.replyTiming")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SelectField
            label={t("instagramCommentAutomation.replyAfter")}
            name="replyAfter.type"
            options={replyAfterTypeOptions}
            required
          />
          {needsReplyAfterValue && (
            <InputField
              label={t("instagramCommentAutomation.replyAfterValue")}
              min={1}
              name="replyAfter.value"
              type="number"
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {t("instagramCommentAutomation.card.hideComments")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SwitchField
            label={t("instagramCommentAutomation.hideComments.all")}
            name="hideComments.all"
            required
          />
          <SwitchField
            label={t("instagramCommentAutomation.hideComments.hasPhoneNumber")}
            name="hideComments.hasPhoneNumber"
            required
          />
          {/* hasImage/hasVideo depend on attachment-type detection, which is
              only implemented for Messenger today — hidden for both Instagram
              variants rather than shown as a dead toggle. */}
          <SwitchField
            label={t("instagramCommentAutomation.hideComments.hasLink")}
            name="hideComments.hasLink"
            required
          />
          <SwitchField
            label={t("instagramCommentAutomation.hideComments.hasKeywords")}
            name="hideComments.hasKeywords"
            required
          />
          {hideCommentsKeywords && (
            <FormField
              control={form.control}
              name="hideComments.keywords"
              render={() => (
                <FormItem>
                  <FormLabel>
                    {t("instagramCommentAutomation.hideComments.keywords")}
                  </FormLabel>
                  <FormControl>
                    <TagsInputField
                      name="hideComments.keywords"
                      placeholder={t(
                        "instagramCommentAutomation.keywordsPlaceholder",
                      )}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <SelectField
            label={t(
              "instagramCommentAutomation.hideComments.showCommentsAfter",
            )}
            name="hideComments.showCommentsAfter"
            options={showCommentsAfterOptions}
            required
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} type="button" variant="ghost">
          {t("actions.cancel")}
        </Button>
        <Button
          disabled={!form.formState.isValid || isSubmitting}
          type="submit"
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
