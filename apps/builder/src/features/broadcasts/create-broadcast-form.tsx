"use client"

import {
  BroadcastSchedulesType,
  BroadcastSubaction,
  type InboxType,
  type MessengerTag,
} from "@aha.chat/database/types"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import { DateTimePicker } from "@aha.chat/ui/components/ui/date-picker"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { add } from "date-fns"
import { Loader2Icon, PlusIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { use, useMemo, useState } from "react"
import { useWatch } from "react-hook-form"
import { toast } from "sonner"
import { createBroadcastAction } from "@/features/broadcasts/actions/create-broadcast.action"
import { createBroadcastRequest } from "@/features/broadcasts/schemas/create-broadcast-schema"
import { FlowSelect } from "../flows/flow-select"
import type { listInboxes } from "../inboxes/queries"
import { InboxTypeSelect } from "./components/inbox-type-select"
import { ConditionsDialog } from "./conditions-dialog"
import type { Condition } from "./schemas/conditions-schema"
import { SelectMessengerTags } from "./select-messenger-tags"
import { SelectSubAction } from "./select-sub-action"

export function CreateBroadcastForm({
  chatbotId,
  promises,
}: {
  chatbotId: string
  promises: Promise<Awaited<ReturnType<typeof listInboxes>>>
}) {
  const t = useTranslations()
  const router = useRouter()

  const [openConditions, setOpenConditions] = useState(false)
  const [currentConditions, setCurrentConditions] = useState<Condition[]>([])
  const [hasInboxType, setHasInboxType] = useState(false)
  const [hasSubAction, setHasSubAction] = useState(false)
  const [hasMessengerTag, setHasMessengerTag] = useState(false)

  const { data } = use(promises)
  const inboxTypes = data.map((inbox) => inbox.inboxType)
  const schedulesOptions = [
    {
      value: BroadcastSchedulesType.now,
      label: t("now"),
    },
    {
      value: BroadcastSchedulesType.future,
      label: t("schedule_for_later"),
    },
  ]

  const {
    form,
    handleSubmitWithAction,
    form: { control, getValues, setValue },
  } = useHookFormAction(
    createBroadcastAction.bind(null, chatbotId),
    zodResolver(createBroadcastRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.createdSuccess", {
              feature: t("fields.broadcast.label"),
            }),
          )
          router.push(`/chatbots/${chatbotId}/broadcasts`)
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          inboxType: null,
          flowId: "",
          subaction: BroadcastSubaction.allContacts,
          messengerTag: null,
          schedulesType: BroadcastSchedulesType.now,
          schedulesAt: null,
          conditions: [],
        },
      },
      errorMapProps: {},
    },
  )
  const watchedSchedulesType = useWatch({ control, name: "schedulesType" })
  const watchedSubAction = useWatch({ control, name: "subaction" })
  const watchedInboxType = useWatch({ control, name: "inboxType" })

  const showSelectSubAction = useMemo(
    () => hasInboxType && !hasSubAction,
    [hasInboxType, hasSubAction],
  )

  const showSelectMessengerTag = useMemo(
    () =>
      hasInboxType &&
      hasSubAction &&
      !hasMessengerTag &&
      watchedSubAction === "allContacts",
    [hasInboxType, hasSubAction, hasMessengerTag, watchedSubAction],
  )

  const showFlow = useMemo(() => {
    if (!(hasInboxType && hasSubAction)) {
      return false
    }

    if (
      watchedInboxType === "messenger" &&
      watchedSubAction === "allContacts"
    ) {
      return hasMessengerTag
    }

    return true
  }, [
    hasInboxType,
    hasSubAction,
    hasMessengerTag,
    watchedInboxType,
    watchedSubAction,
  ])

  const onSelectInboxType = (inboxType: InboxType | null) => {
    setHasInboxType(true)
    setValue("inboxType", inboxType)

    if (inboxType === null) {
      setHasSubAction(true)
      setValue("subaction", BroadcastSubaction.allContacts)
    }
  }

  const onSelectSubAction = (subaction: BroadcastSubaction) => {
    setHasSubAction(true)
    setValue("subaction", subaction)
  }

  const onSelectMessengerTag = (tag: MessengerTag) => {
    setHasMessengerTag(true)
    setValue("messengerTag", tag)
  }

  // biome-ignore lint/correctness/noUnusedVariables: wip
  const renderCondition = () => (
    <>
      <div className="flex flex-col gap-1">
        {currentConditions.map((condition) => (
          <Button
            className="p-0"
            key={condition.field}
            onClick={() => setOpenConditions(true)}
            variant="ghost"
          >
            <div className="flex h-full w-full items-center gap-1 border-1 px-3 py-2 text-left">
              <div>{condition.field}</div>
              <div>{t(`condition.operators.${condition.operator}`)}</div>
              <span className="font-medium">
                {condition.value?.toString() || ""}
              </span>
            </div>
          </Button>
        ))}
      </div>
      <Button
        onClick={() => setOpenConditions(true)}
        type="button"
        variant="outline"
      >
        <PlusIcon />
        {t("condition.add")}
      </Button>
    </>
  )

  return (
    <div className="flex h-svh flex-col items-center justify-center">
      <Card className="w-5/6" key={t.name}>
        <CardContent className="py-4">
          <Form {...form}>
            <form
              className="flex-1 space-y-4"
              onSubmit={handleSubmitWithAction}
            >
              {!hasInboxType && (
                <InboxTypeSelect
                  inboxTypes={inboxTypes}
                  onSelectInboxType={onSelectInboxType}
                />
              )}

              {showSelectSubAction && (
                <SelectSubAction
                  inboxType={getValues("inboxType") as InboxType}
                  onSelectSubAction={onSelectSubAction}
                />
              )}

              {showSelectMessengerTag && (
                <SelectMessengerTags onSelectTag={onSelectMessengerTag} />
              )}

              {showFlow && (
                <>
                  <FlowSelect
                    label={t("fields.flowToSend.label")}
                    name="flowId"
                    required={true}
                  />

                  <SelectField
                    defaultValue={BroadcastSchedulesType.now}
                    label={t("broadcasts.scheduleSendMessage")}
                    name="schedulesType"
                    // onValueChange={(value) =>
                    //   setSchedulesType(value as BroadcastSchedulesType)
                    // }
                    options={schedulesOptions}
                  />

                  {watchedSchedulesType === BroadcastSchedulesType.future && (
                    <DateTimePicker
                      disabled={{
                        before: new Date(),
                      }}
                      displayFormat={{ hour24: "yyyy-MM-dd HH:mm" }}
                      granularity="minute"
                      onChange={(value) => {
                        setValue(
                          "schedulesAt",
                          (value ?? new Date()).toISOString(),
                        )
                      }}
                      value={add(new Date(), { minutes: 15 })}
                    />
                  )}

                  {/* {renderCondition()} */}

                  <div className="flex justify-end gap-2">
                    <Button asChild variant="outline">
                      <Link href={`/chatbots/${chatbotId}/broadcasts`}>
                        {t("actions.cancel")}
                      </Link>
                    </Button>

                    <Button
                      disabled={
                        !form.formState.isValid || form.formState.isSubmitting
                      }
                      type="submit"
                    >
                      {form.formState.isSubmitting && (
                        <Loader2Icon className="animate-spin" />
                      )}
                      {t("actions.confirm")}
                    </Button>
                  </div>
                </>
              )}
            </form>
          </Form>
        </CardContent>
      </Card>
      <ConditionsDialog
        onOpenChange={setOpenConditions}
        onSave={(conditions: Condition) => {
          setCurrentConditions([...currentConditions, conditions])
          setOpenConditions(false)
        }}
        open={openConditions}
      />
    </div>
  )
}
