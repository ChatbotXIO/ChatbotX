import {
  postCommentScopes,
  postTrackingChannels,
} from "@chatbotx.io/database/partials"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useFormContext } from "react-hook-form"
import { ChannelPostValueField } from "@/features/contact-filter/components/contact-filter-condition-dialog"
import { useInboxOptionsForChannels } from "@/features/inboxes/provider/inbox-hook"

/** "Any page or account" in the picker; stored as null. */
const ANY = ""

/**
 * What a post-comment condition listens to: one page or account (empty = any),
 * and any post, picked posts, or only posts published from Posts. The picked
 * posts live in `value.channelPostIds`, the scope in `value.scope`.
 */
export const PostCommentCondition = ({
  parentName,
}: {
  parentName: string
}) => {
  const t = useTranslations()
  const form = useFormContext()
  const inboxes = useInboxOptionsForChannels(postTrackingChannels)
  const sourceName = `${parentName}.sourceId`
  const scopeName = `${parentName}.value.scope`
  const postsName = `${parentName}.value.channelPostIds`
  const inboxId: string | null | undefined = form.watch(sourceName)
  const scope: string | undefined = form.watch(scopeName)

  // A saved page that is no longer listed is shown as such, never as "any":
  // the condition still holds it.
  const inboxOptions = useMemo(
    () => [
      { value: ANY, label: t("trigger.conditions.anyInbox") },
      ...inboxes,
      ...(inboxId && !inboxes.some((inbox) => inbox.value === inboxId)
        ? [{ value: inboxId, label: t("trigger.conditions.unavailableInbox") }]
        : []),
    ],
    [inboxId, inboxes, t],
  )
  const scopeOptions = useMemo(
    () => [
      {
        value: postCommentScopes.enum.any,
        label: t("trigger.conditions.postScope.any"),
      },
      {
        value: postCommentScopes.enum.selected,
        label: t("trigger.conditions.postScope.selected"),
      },
      {
        value: postCommentScopes.enum.publishedFromPosts,
        label: t("trigger.conditions.postScope.publishedFromPosts"),
      },
    ],
    [t],
  )

  // Posts of the previous page can never match the new one (the evaluator ANDs
  // the two), so they are dropped. "Any page" keeps them, they stay valid.
  const onInboxPicked = (value: string) => {
    if (value !== ANY && value !== (inboxId ?? ANY)) {
      form.setValue(postsName, [], { shouldDirty: true })
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ComboboxField
        emptyText={t("actions.noRecordFound")}
        name={sourceName}
        options={inboxOptions}
        placeholder={t("trigger.conditions.anyInbox")}
        popoverClassName="w-[var(--anchor-width)]"
        triggerValueChange={onInboxPicked}
      />
      <SelectField name={scopeName} options={scopeOptions} />
      {scope === postCommentScopes.enum.selected ? (
        <ChannelPostValueField
          inboxId={inboxId || undefined}
          name={postsName}
        />
      ) : null}
    </div>
  )
}
