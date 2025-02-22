"use client"

import { FormInput } from "@/components/form-input"
import { SingleSelect } from "@/components/single-select"
import { Button } from "@/components/ui/button"
import { DateTimePicker } from "@/components/ui/date-picker"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Form } from "@/components/ui/form"
import { createBroadcastAction } from "@/features/broadcasts/actions/create-broadcast-action"
import { EstimatedContact } from "@/features/broadcasts/estimated-contact"
import { createBroadcastSchema } from "@/features/broadcasts/schemas/create-broadcast-schema"
import { WhatsappOption } from "@/features/broadcasts/whatsapp-option"
import { QueryMatchEnum } from "@/features/contacts/filter/schema"
import { FlowSelect } from "@/features/flows/flow-select"
import { callAPI } from "@/lib/swr"
import { BroadcastType, type Inbox } from "@ahachat.ai/database"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { T, useTranslate } from "@tolgee/react"
import { add } from "date-fns"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import React, { useState } from "react"
import { toast } from "sonner"

interface BroadcastsTableProps {
  chatbotId: string
}

type ScheduleType = "Now" | "Schedule"

export function CreateBroadcastDialog({ chatbotId }: BroadcastsTableProps) {
  const { t } = useTranslate()
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const params = useParams<{ chatbotId: string }>()

  const url = `/api/chatbots/${params.chatbotId}/inboxes?perPage=9999`
  const { data } = callAPI(url)
  const inboxes = [
    ...((data as { data: Inbox[] })?.data ?? []).map((v) => ({
      label: v.inboxType,
      value: v.inboxType,
    })),
    {
      label: "Omnichannel",
      value: BroadcastType.Omnichannel,
    },
  ] as { value: BroadcastType; label: string }[]

  const [scheduleType, setScheduleType] = useState<ScheduleType>("Now")
  const [selectedType, setSelectedType] = useState<boolean>(true)

  const scheduleOptions = [
    { value: "Now", label: t("common.now") },
    { value: "Schedule", label: t("common.scheduleForLater") },
  ]

  const {
    form,
    handleSubmitWithAction,
    resetFormAndAction,
    form: { setValue, watch },
  } = useHookFormAction(
    createBroadcastAction.bind(null, chatbotId),
    zodResolver(createBroadcastSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success("Broadcast created successfully")

          setOpen(false)
          resetFormAndAction()
          setSelectedType(false)
          setScheduleType("Now")
          router.refresh()
        },
        onError: ({ error }) => {
          error.serverError && toast.error(error.serverError)
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          conditions: {
            match: QueryMatchEnum.AND,
            conditions: [],
          },
        },
      },
      errorMapProps: {},
    },
  )

  const onChangeBroadcastType = (type: BroadcastType) => {
    setValue("broadcastType", type)
    setValue("conditions.conditions", [])
    switch (type) {
      case BroadcastType.Omnichannel:
        setSelectedType(true)
        break
      default:
        setSelectedType(false)
        break
    }
  }

  const handleSubmitForm = async () => {
    const check = await form.trigger()
    if (check) {
      await handleSubmitWithAction()
    }
  }

  const broadcastType = watch("broadcastType")

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          <T keyName="broadcasts.addBtn" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("broadcasts.create.title")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form onSubmit={handleSubmitForm} className="flex-1 space-y-4">
              <FormInput
                name="broadcastType"
                label={t("channels.select")}
                isRequired={true}
              >
                <SingleSelect
                  name="broadcastType"
                  placeholder="Please select"
                  options={inboxes}
                  onValueChange={(type: BroadcastType) =>
                    onChangeBroadcastType(type)
                  }
                />
              </FormInput>
              {!selectedType && broadcastType === BroadcastType.Whatsapp && (
                <WhatsappOption
                  name="conditions.conditions.0"
                  onSelect={() => {
                    setSelectedType(true)
                  }}
                />
              )}
              {broadcastType && selectedType && (
                <>
                  <FlowSelect
                    name="flowId"
                    label={t("broadcasts.flowId")}
                    isRequired={true}
                  />
                  <FormInput
                    name="scheduleType"
                    label={t("broadcasts.scheduleSendMessage")}
                    isRequired={true}
                  >
                    <SingleSelect
                      options={scheduleOptions}
                      onValueChange={(value) =>
                        setScheduleType(value as ScheduleType)
                      }
                      defaultValue="Now"
                      name="scheduleType"
                    />
                  </FormInput>
                  {scheduleType === "Schedule" && (
                    <DateTimePicker
                      granularity="minute"
                      displayFormat={{ hour24: "yyyy-MM-dd HH:mm" }}
                      value={new Date()}
                      disabled={(date: Date) =>
                        date < add(new Date(), { minutes: 15 })
                      }
                      onChange={(value) => {
                        setValue(
                          "schedulesAt",
                          (value ?? new Date()).toISOString(),
                        )
                      }}
                    />
                  )}
                </>
              )}

              <DialogFooter className="justify-between">
                <div className="w-full flex justify-between items-center">
                  <div>
                    {broadcastType && selectedType && (
                      <EstimatedContact
                        chatbotId={chatbotId}
                        filter={form.getValues("conditions")}
                      />
                    )}
                  </div>
                  <div className="flex gap-2">
                    <DialogClose asChild>
                      <Button type="button" variant="secondary">
                        Close
                      </Button>
                    </DialogClose>
                    <Button
                      type="submit"
                      disabled={
                        !form.formState.isValid || form.formState.isSubmitting
                      }
                    >
                      {form.formState.isSubmitting && (
                        <Loader2Icon className="animate-spin" />
                      )}
                      {t("common.confirm-btn")}
                    </Button>
                  </div>
                </div>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
