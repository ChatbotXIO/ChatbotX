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
import { useAIAgentStore } from "@/features/ai-agents/provider/ai-agent-store-context"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import type { CreateFbCommentRequest } from "../schema/action"
import { SelectPostsDialog } from "./select-posts-dialog"

type FbCommentFormValues = CreateFbCommentRequest

type FbCommentFormProps = {
  form: UseFormReturn<FbCommentFormValues>
  onSubmit: (e: React.FormEvent) => void
  isSubmitting: boolean
  onCancel: () => void
  submitLabel: string
}

export function FbCommentForm({
  form,
  onSubmit,
  isSubmitting,
  onCancel,
  submitLabel,
}: FbCommentFormProps) {
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
    { label: t("facebookCommentAutomation.replyType.text"), value: "text" },
    { label: t("facebookCommentAutomation.replyType.flow"), value: "flow" },
    {
      label: t("facebookCommentAutomation.replyType.AIAgent"),
      value: "AIAgent",
    },
    { label: t("facebookCommentAutomation.replyType.none"), value: "none" },
  ]

  const postTypeOptions = [
    { label: t("facebookCommentAutomation.postType.all"), value: "all" },
    {
      label: t("facebookCommentAutomation.postType.specificPosts"),
      value: "postIds",
    },
  ]

  const includeKeywordsTypeOptions = [
    { label: t("facebookCommentAutomation.keywordsType.all"), value: "all" },
    {
      label: t("facebookCommentAutomation.keywordsType.equal"),
      value: "equal",
    },
    {
      label: t("facebookCommentAutomation.keywordsType.contain"),
      value: "contain",
    },
  ]

  const replyAfterTypeOptions = [
    {
      label: t("facebookCommentAutomation.replyAfterType.immediately"),
      value: "immediately",
    },
    {
      label: t("facebookCommentAutomation.replyAfterType.seconds"),
      value: "seconds",
    },
    {
      label: t("facebookCommentAutomation.replyAfterType.minutes"),
      value: "minutes",
    },
    {
      label: t("facebookCommentAutomation.replyAfterType.hours"),
      value: "hours",
    },
    {
      label: t("facebookCommentAutomation.replyAfterType.randomWithin3Minutes"),
      value: "randomWithin3Minutes",
    },
    {
      label: t("facebookCommentAutomation.replyAfterType.randomWithin5Minutes"),
      value: "randomWithin5Minutes",
    },
    {
      label: t(
        "facebookCommentAutomation.replyAfterType.randomWithin10Minutes",
      ),
      value: "randomWithin10Minutes",
    },
    {
      label: t(
        "facebookCommentAutomation.replyAfterType.randomWithin20Minutes",
      ),
      value: "randomWithin20Minutes",
    },
    {
      label: t(
        "facebookCommentAutomation.replyAfterType.randomWithin30Minutes",
      ),
      value: "randomWithin30Minutes",
    },
    {
      label: t(
        "facebookCommentAutomation.replyAfterType.randomWithin60Minutes",
      ),
      value: "randomWithin60Minutes",
    },
  ]

  const showCommentsAfterOptions = [
    {
      label: t("facebookCommentAutomation.showCommentsAfter.none"),
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
          <CardTitle>{t("facebookCommentAutomation.card.targeting")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 space-y-4">
          <RadioGroupField
            description={t(
              "facebookCommentAutomation.trackCommentsOnDescription",
            )}
            descriptionType="tooltip"
            label={t("facebookCommentAutomation.trackCommentsOn")}
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
                {t("facebookCommentAutomation.chooseSpecificPosts")}
                {postValue.length > 0 && ` (${postValue.length})`}
              </Button>
              <SelectPostsDialog
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
                "facebookCommentAutomation.privateReplyDescription",
              )}
              descriptionType="tooltip"
              label={t("facebookCommentAutomation.privateReply")}
              name="privateReply.type"
              options={replyTypeOptions}
              orientation="horizontal"
              required
            />
            {privateReplyType === "text" && (
              <InputField
                label={t("facebookCommentAutomation.replyMessage")}
                name="privateReply.value"
                placeholder={t(
                  "facebookCommentAutomation.replyMessagePlaceholder",
                )}
                required
              />
            )}
            {privateReplyType === "flow" && (
              <ComboboxField
                label={t("fields.flow.label")}
                name="privateReply.value"
                options={flowOptions}
                required
              />
            )}
            {privateReplyType === "AIAgent" && (
              <ComboboxField
                label={t("fields.aiAgent.label")}
                name="privateReply.value"
                options={aiAgentOptions}
                required
              />
            )}
          </div>

          <div className="flex flex-col gap-2 space-y-2">
            <RadioGroupField
              description={t(
                "facebookCommentAutomation.publicReplyDescription",
              )}
              descriptionType="tooltip"
              label={t("facebookCommentAutomation.publicReply")}
              name="publicReply.type"
              options={replyTypeOptions}
              orientation="horizontal"
              required
            />
            {publicReplyType === "text" && (
              <InputField
                label={t("facebookCommentAutomation.replyMessage")}
                name="publicReply.value"
                placeholder={t(
                  "facebookCommentAutomation.replyMessagePlaceholder",
                )}
                required
              />
            )}
            {publicReplyType === "flow" && (
              <ComboboxField
                label={t("fields.flow.label")}
                name="publicReply.value"
                options={flowOptions}
                required
              />
            )}
            {publicReplyType === "AIAgent" && (
              <ComboboxField
                label={t("fields.aiAgent.label")}
                name="publicReply.value"
                options={aiAgentOptions}
                required
              />
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("facebookCommentAutomation.card.filters")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2">
            <SelectField
              description={t(
                "facebookCommentAutomation.includeKeywordsTypeDescription",
              )}
              descriptionType="tooltip"
              label={t("facebookCommentAutomation.includeKeywordsType")}
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
                        {t("facebookCommentAutomation.includeKeywords")}
                      </FormLabel>
                      <FormControl>
                        <TagsInputField
                          name="includeKeywords.value"
                          placeholder={t(
                            "facebookCommentAutomation.keywordsPlaceholder",
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
                  {t("facebookCommentAutomation.excludeKeywords")}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="size-3.5 cursor-help text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      {t(
                        "facebookCommentAutomation.excludeKeywordsDescription",
                      )}
                    </TooltipContent>
                  </Tooltip>
                </FormLabel>
                <FormControl>
                  <TagsInputField
                    name="excludeKeywords"
                    placeholder={t(
                      "facebookCommentAutomation.keywordsPlaceholder",
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
                "facebookCommentAutomation.options.replyToNewContactsOnlyDescription",
              )}
              descriptionType="tooltip"
              label={t(
                "facebookCommentAutomation.options.replyToNewContactsOnly",
              )}
              name="options.replyToNewContactsOnly"
              required
            />
            <SwitchField
              description={t(
                "facebookCommentAutomation.options.replyOncePerUserPerPostDescription",
              )}
              descriptionType="tooltip"
              label={t(
                "facebookCommentAutomation.options.replyOncePerUserPerPost",
              )}
              name="options.replyOncePerUserPerPost"
              required
            />
            <SwitchField
              description={t(
                "facebookCommentAutomation.options.likeUserCommentDescription",
              )}
              descriptionType="tooltip"
              label={t("facebookCommentAutomation.options.likeUserComment")}
              name="options.likeUserComment"
              required
            />
            <SwitchField
              description={t(
                "facebookCommentAutomation.options.replyToUsersWhoCommentedOnOtherPostsDescription",
              )}
              descriptionType="tooltip"
              label={t(
                "facebookCommentAutomation.options.replyToUsersWhoCommentedOnOtherPosts",
              )}
              name="options.replyToUsersWhoCommentedOnOtherPosts"
              required
            />
            <SwitchField
              description={t(
                "facebookCommentAutomation.options.ignoreCommentRepliesDescription",
              )}
              descriptionType="tooltip"
              label={t(
                "facebookCommentAutomation.options.ignoreCommentReplies",
              )}
              name="options.ignoreCommentReplies"
              required
            />
            <SwitchField
              description={t(
                "facebookCommentAutomation.options.trackUserTagsDescription",
              )}
              descriptionType="tooltip"
              label={t("facebookCommentAutomation.options.trackUserTags")}
              name="options.trackUserTags"
              required
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {t("facebookCommentAutomation.card.replyTiming")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SelectField
            label={t("facebookCommentAutomation.replyAfter")}
            name="replyAfter.type"
            options={replyAfterTypeOptions}
            required
          />
          {needsReplyAfterValue && (
            <InputField
              label={t("facebookCommentAutomation.replyAfterValue")}
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
            {t("facebookCommentAutomation.card.hideComments")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SwitchField
            label={t("facebookCommentAutomation.hideComments.all")}
            name="hideComments.all"
            required
          />
          <SwitchField
            label={t("facebookCommentAutomation.hideComments.hasPhoneNumber")}
            name="hideComments.hasPhoneNumber"
            required
          />
          <SwitchField
            label={t("facebookCommentAutomation.hideComments.hasImage")}
            name="hideComments.hasImage"
            required
          />
          <SwitchField
            label={t("facebookCommentAutomation.hideComments.hasVideo")}
            name="hideComments.hasVideo"
            required
          />
          <SwitchField
            label={t("facebookCommentAutomation.hideComments.hasLink")}
            name="hideComments.hasLink"
            required
          />
          <SwitchField
            label={t("facebookCommentAutomation.hideComments.hasKeywords")}
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
                    {t("facebookCommentAutomation.hideComments.keywords")}
                  </FormLabel>
                  <FormControl>
                    <TagsInputField
                      name="hideComments.keywords"
                      placeholder={t(
                        "facebookCommentAutomation.keywordsPlaceholder",
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
              "facebookCommentAutomation.hideComments.showCommentsAfter",
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
