"use client"

import {
  BroadcastSchedulesType,
  BroadcastSubaction,
  type InboxType,
} from "@aha.chat/database/types"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import { DateTimePicker } from "@aha.chat/ui/components/ui/date-picker"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { add } from "date-fns"
import { Loader2Icon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { use, useState } from "react"
import { toast } from "sonner"
import { createBroadcastAction } from "@/features/broadcasts/actions/create-broadcast.action"
import { createBroadcastRequest } from "@/features/broadcasts/schemas/create-broadcast-schema"
import { FlowSelect } from "../flows/flow-select"
import type { listInboxes } from "../inboxes/queries"
import { InboxTypeSelect } from "./components/inbox-type-select"

export function CreateBroadcastForm({
  chatbotId,
  promises,
}: {
  chatbotId: string
  promises: Promise<Awaited<ReturnType<typeof listInboxes>>>
}) {
  const t = useTranslations()

  const [hasInboxType, setHasInboxType] = useState(false)
  const [hasSubAction, setHasSubAction] = useState(false)
  const [schedulesType, _setSchedulesType] =
    useState<BroadcastSchedulesType | null>(null)

  const { data } = use(promises)
  const inboxTypes = data.map((inbox) => inbox.inboxType)
  const schedulesOptions = [
    {
      value: "NOW",
      label: "Now",
    },
    {
      value: "FUTURE",
      label: "Schedule for later (All simultaneously)",
    },
  ]

  const {
    form,
    handleSubmitWithAction,
    resetFormAndAction,
    form: { setValue },
  } = useHookFormAction(
    createBroadcastAction.bind(null, chatbotId),
    zodResolver(createBroadcastRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.createSuccess", {
              feature: t("fields.broadcast.label"),
            }),
          )
          resetFormAndAction()
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
          conditions: [],
        },
      },
      errorMapProps: {},
    },
  )

  const onSelectInboxType = (inboxType: InboxType | null) => {
    setHasInboxType(true)
    setValue("inboxType", inboxType)

    if (inboxType === null) {
      setHasSubAction(true)
      setValue("subaction", BroadcastSubaction.allContacts)
    }
  }

  return (
    <div className="flex justify-center">
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

              {hasInboxType && hasSubAction && (
                <>
                  <FlowSelect
                    label={t("fields.flowToSend.label")}
                    name="flowId"
                    required={true}
                  />

                  <SelectField
                    defaultValue="Now"
                    label={t("broadcasts.scheduleSendMessage")}
                    name="schedulesType"
                    // onValueChange={(value) =>
                    //   setSchedulesType(value as BroadcastSchedulesType)
                    // }
                    options={schedulesOptions}
                  />

                  {schedulesType === BroadcastSchedulesType.future && (
                    <DateTimePicker
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
    </div>
  )
}
