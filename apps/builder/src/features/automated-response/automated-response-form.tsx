"use client"

import { FormInput } from "@/components/form-input"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Form,
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import type { AutomatedResponse, Flow } from "@prisma/client"
import { T, useTranslate } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import { Trash } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { type Control, useFieldArray, useFormContext } from "react-hook-form"
import { toast } from "sonner"
import { createAutomatedResponseAction } from "./actions/create-automated-response-action"
import { updateAutomatedResponseAction } from "./actions/update-automated-response-action"
import {
  type AutomatedResponseReply,
  type CreateAutomatedResponseSchema,
  ReplyType,
  createAutomatedResponseSchema,
} from "./schemas/create-automated-responses-schema"

const AutomatedResponseReplyFlowForm = ({
  label,
  index,
  removeRepliesField,
  flows,
}: {
  index: number
  label?: string
  removeRepliesField: (index: number) => void
  flows: Flow[]
}) => {
  const { getValues, setValue } = useFormContext()
  const name = `replies.${index}.flowId`
  const [hideTrash, setHideTrash] = useState(true)

  return (
    <>
      <div
        className="relative"
        onMouseEnter={() => setHideTrash(false)}
        onMouseLeave={() => setHideTrash(true)}
      >
        <div
          onClick={() => removeRepliesField(index)}
          onKeyUp={() => {}}
          hidden={hideTrash}
          aria-hidden="true"
          className={`absolute right-0 cursor-pointer ${index === 0 ? "top-7" : "top-1"}`}
        >
          <Trash />
        </div>
        <FormItem>
          {label && <FormLabel className="flex gap-1">{label}</FormLabel>}
          <Select
            onValueChange={(e) => setValue(name, e)}
            defaultValue={getValues(name)}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={"Select a flow"} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {flows.map((flow) => (
                <SelectItem key={flow.id} value={flow.id}>
                  {flow.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <FormMessage />
        </FormItem>
      </div>
    </>
  )
}

const AutomatedResponseReplyMessageForm = ({
  index,
  label,
  control,
  removeRepliesField,
}: {
  index: number
  label?: string
  control: Control<CreateAutomatedResponseSchema>
  removeRepliesField: (index: number) => void
}) => {
  const { fields: urlFields, append } = useFieldArray({
    control: control,
    name: `replies.${index}.buttons`,
  })

  const addLink = () => {
    append({ url: "", label: "" })
  }

  const [hideTrash, setHideTrash] = useState(true)

  return (
    <>
      <div
        className="relative"
        onMouseEnter={() => setHideTrash(false)}
        onMouseLeave={() => setHideTrash(true)}
      >
        <div
          onClick={() => removeRepliesField(index)}
          onKeyUp={() => {}}
          hidden={hideTrash}
          className={`absolute right-0 cursor-pointer ${index === 0 ? "top-10" : "top-4"}`}
          aria-hidden="true"
        >
          <Trash />
        </div>
        <FormInput
          name={`replies.${index}.answer`}
          label={label}
          placeholder="Type a message"
          inputType="textarea"
        />

        {urlFields.map((field, bIndex) => {
          return (
            <div
              key={`replies.${index}.buttons.${field.id}`}
              className="flex mt-3 px-4"
            >
              <FormInput
                name={`replies.${index}.buttons.${bIndex}.label`}
                placeholder="Button label"
                label={""}
              />
              <div className="flex-1 ml-2">
                <FormInput
                  name={`replies.${index}.buttons.${bIndex}.url`}
                  placeholder="https://www.example.com"
                  label={""}
                />
              </div>
            </div>
          )
        })}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              addLink()
            }}
          >
            <T keyName="automatedResponse.addLink" />
          </button>
        </div>
      </div>
    </>
  )
}

export function CreateAutomatedResponseForm({
  chatbotId,
  folderId,
  flows,
  onSubmitted,
  onCancelled,
}: {
  chatbotId: string
  folderId: string | null
  onSubmitted?: () => void
  onCancelled?: () => void
  flows: Flow[]
}) {
  const { t } = useTranslate()
  const router = useRouter()

  const {
    form,
    handleSubmitWithAction,
    form: { control },
  } = useHookFormAction(
    createAutomatedResponseAction.bind(null, chatbotId, null, folderId),
    zodResolver(createAutomatedResponseSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success("Automated Response created successfully")

          onSubmitted?.()
          router.push(`/chatbots/${chatbotId}/automated-responses`)
        },
        onError: ({ error }) => {
          error.serverError && toast.error(error.serverError)
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          keyword: "",
          replies: [],
        },
      },
      errorMapProps: {},
    },
  )

  const {
    fields,
    append,
    remove: removeRepliesField,
  } = useFieldArray({
    control,
    name: "replies",
  })

  const onAddedBotReplies = (type: ReplyType) => {
    if (type === ReplyType.Message) {
      append({
        type,
        answer: "",
        buttons: [],
      })
    } else {
      append({ type, flowId: "" })
    }
  }

  return (
    <Form {...form}>
      <form
        key="automatedResponse.create"
        onSubmit={(e) => {
          handleSubmitWithAction(e)
        }}
        method="POST"
        className="flex-1 space-y-4"
      >
        <FormInput
          name="keyword"
          label={t("automatedResponse.keyword")}
          placeholder="Hello"
        />

        {fields.map((field, index) => {
          const label = index === 0 ? t("automatedResponse.botResponse") : ""
          return (
            <>
              <div key={`replies.${field.id}`}>
                {field.type === ReplyType.Message ? (
                  <AutomatedResponseReplyMessageForm
                    removeRepliesField={removeRepliesField}
                    control={control}
                    index={index}
                    label={label}
                    {...field}
                  />
                ) : (
                  <AutomatedResponseReplyFlowForm
                    removeRepliesField={removeRepliesField}
                    index={index}
                    label={label}
                    flows={flows}
                    {...field}
                  />
                )}
              </div>
            </>
          )
        })}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <T keyName="automatedResponse.addReplies" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => onAddedBotReplies(ReplyType.Message)}
              >
                <T keyName="automatedResponse.textMessage" />
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onAddedBotReplies(ReplyType.Flow)}
              >
                <T keyName="automatedResponse.flow" />
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              router.push(`/chatbots/${chatbotId}/automated-responses`)
            }
          >
            {t("common.cancel-btn")}
          </Button>
          <Button type="submit">
            {form.formState.isSubmitting && (
              <Loader2Icon className="animate-spin" />
            )}
            {t("common.confirm-btn")}
          </Button>
        </div>
      </form>
    </Form>
  )
}

export function EditAutomatedResponseForm({
  data,
  flows,
  chatbotId,
  onSubmitted,
  onCancelled,
}: {
  data: AutomatedResponse
  chatbotId: string
  onSubmitted?: () => void
  onCancelled?: () => void
  flows: Flow[]
}) {
  const { t } = useTranslate()
  const router = useRouter()

  const {
    form,
    handleSubmitWithAction,
    form: { control },
  } = useHookFormAction(
    updateAutomatedResponseAction.bind(null, data.id),
    zodResolver(createAutomatedResponseSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success("Automated Response updated successfully")

          onSubmitted?.()
        },
        onError: ({ error }) => {
          error.serverError && toast.error(error.serverError)
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: { ...data, replies: JSON.parse(data.replies as string) },
      },
      errorMapProps: {},
    },
  )

  const {
    fields,
    append,
    remove: removeRepliesField,
  } = useFieldArray({
    control,
    name: "replies",
  })

  const onAddedBotReplies = (type: ReplyType) => {
    if (type === ReplyType.Message) {
      append({
        type,
        answer: "",
        buttons: [],
      })
    } else {
      append({ type, flowId: "" })
    }
  }

  return (
    <Form {...form}>
      <form
        key="automatedResponse.update"
        onSubmit={(e) => {
          handleSubmitWithAction(e)
        }}
        method="POST"
        className="flex-1 space-y-4"
      >
        <FormInput
          name="keyword"
          label={t("automatedResponse.keyword")}
          placeholder="Hello"
        />

        {fields.map((field, index) => {
          const label = index === 0 ? t("automatedResponse.botResponse") : ""
          return (
            <>
              <div key={`replies.${field.id}`}>
                {(field as AutomatedResponseReply).type ===
                ReplyType.Message ? (
                  <AutomatedResponseReplyMessageForm
                    removeRepliesField={removeRepliesField}
                    control={control}
                    index={index}
                    label={label}
                    {...field}
                  />
                ) : (
                  <AutomatedResponseReplyFlowForm
                    removeRepliesField={removeRepliesField}
                    index={index}
                    label={label}
                    flows={flows}
                    {...field}
                  />
                )}
              </div>
            </>
          )
        })}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <T keyName="automatedResponse.addReplies" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => onAddedBotReplies(ReplyType.Message)}
              >
                <T keyName="automatedResponse.textMessage" />
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onAddedBotReplies(ReplyType.Flow)}
              >
                <T keyName="automatedResponse.flow" />
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              router.push(`/chatbots/${chatbotId}/automated-responses`)
            }
          >
            {t("common.cancel-btn")}
          </Button>
          <Button type="submit">
            {form.formState.isSubmitting && (
              <Loader2Icon className="animate-spin" />
            )}
            {t("common.confirm-btn")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
