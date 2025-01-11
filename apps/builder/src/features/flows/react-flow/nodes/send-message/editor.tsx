import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
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
import { Separator } from "@/components/ui/separator"
import {
  Sortable,
  SortableDragHandle,
  SortableItem,
} from "@/components/ui/sortable"
import { ErrorAlert } from "@/features/flows/react-flow/blocks/error-alert"
import { SendAudioBlockEditor } from "@/features/flows/react-flow/blocks/send-audio/editor"
import { sendAudioBlockDefaultValue } from "@/features/flows/react-flow/blocks/send-audio/schema"
import { SendCardBlockEditor } from "@/features/flows/react-flow/blocks/send-card/editor"
import { sendCardBlockDefaultValue } from "@/features/flows/react-flow/blocks/send-card/schema"
import { SendCarouselBlockEditor } from "@/features/flows/react-flow/blocks/send-carousel/editor"
import { sendCarouselBlockDefaultValue } from "@/features/flows/react-flow/blocks/send-carousel/schema"
import { SendImageBlockEditor } from "@/features/flows/react-flow/blocks/send-image/editor"
import { sendImageBlockDefaultValue } from "@/features/flows/react-flow/blocks/send-image/schema"
import { SendVideoBlockEditor } from "@/features/flows/react-flow/blocks/send-video/editor"
import { sendVideoBlockDefaultValue } from "@/features/flows/react-flow/blocks/send-video/schema"
import { cn } from "@/lib/utils"
import { zodResolver } from "@hookform/resolvers/zod"
import { createId } from "@paralleldrive/cuid2"
import { useTranslate } from "@tolgee/react"
import { type Node, useReactFlow } from "@xyflow/react"
import cloneDeep from "lodash.clonedeep"
import { CopyIcon, MoveVerticalIcon, XIcon } from "lucide-react"
import { type ReactNode, useCallback, useEffect } from "react"
import { useFieldArray, useForm } from "react-hook-form"
import { ActionType } from "../../action-type"
import { SendTextBlockEditor } from "../../blocks/send-text/editor"
import { sendTextBlockDefaultValue } from "../../blocks/send-text/schema"
import { type SendMessageNodeSchema, sendMessageNodeSchema } from "./schema"
import SendMessageEditorAction from "./send-message-editor-action"

const maps: Record<
  ActionType,
  (props: { key: string; parentName: string }) => ReactNode
> = {
  [ActionType.SendText]: ({ key, parentName }) => (
    <SendTextBlockEditor key={key} parentName={parentName} />
  ),
  [ActionType.SendImage]: ({ key, parentName }) => (
    <SendImageBlockEditor key={key} parentName={parentName} />
  ),
  [ActionType.SendCard]: ({ key, parentName }) => (
    <SendCardBlockEditor key={key} parentName={parentName} />
  ),
  [ActionType.SendVideo]: ({ key, parentName }) => (
    <SendVideoBlockEditor key={key} parentName={parentName} />
  ),
  [ActionType.SendAudio]: ({ key, parentName }) => (
    <SendAudioBlockEditor key={key} parentName={parentName} />
  ),
  [ActionType.SendCarousel]: ({ key, parentName }) => (
    <SendCarouselBlockEditor key={key} parentName={`${parentName}.cards`} />
  ),
}

export default function SendMessageNodeEditor({
  activeNode,
}: { activeNode: Node<SendMessageNodeSchema> }) {
  const { t } = useTranslate()

  const { setNodes } = useReactFlow()
  const onChange = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    (data: any) => {
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id === activeNode.id) {
            return {
              ...node,
              data: {
                ...node.data,
                ...data,
              },
            }
          }
          return node
        }),
      )
    },
    [activeNode, setNodes],
  )

  const { control, getValues, watch, ...form } = useForm<SendMessageNodeSchema>(
    {
      resolver: zodResolver(sendMessageNodeSchema),
      defaultValues: activeNode.data,
    },
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    const { unsubscribe } = watch((value) => {
      onChange(value)
    })
    return () => unsubscribe()
  }, [watch])

  const { fields, append, move, update, remove, insert } = useFieldArray({
    control,
    name: "blocks",
  })

  const onClickAction = (name: ActionType) => {
    switch (name) {
      case ActionType.SendText:
        append(sendTextBlockDefaultValue())
        break
      case ActionType.SendImage:
        append(sendImageBlockDefaultValue())
        break
      case ActionType.SendCard:
        append(sendCardBlockDefaultValue())
        break
      case ActionType.SendCarousel:
        append(sendCarouselBlockDefaultValue(2))
        break
      case ActionType.SendVideo:
        append(sendVideoBlockDefaultValue())
        break
      case ActionType.SendAudio:
        append(sendAudioBlockDefaultValue())
        break
      case ActionType.SendFile:
        append(sendAudioBlockDefaultValue())
        break
    }
  }

  const onCopy = (index: number) => {
    const values = getValues(`blocks.${index}`)
    if (values) {
      insert(index + 1, { ...cloneDeep(values), id: createId() })
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  const onSubmit = (data: any) => {
    console.log("Form Data:", data)
  }

  return (
    <>
      <Form {...form} getValues={getValues} control={control} watch={watch}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <FormField
            control={control}
            name="messageType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t("flows.SendMessageNodeViewer.channel")}
                </FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select channel" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Omnichannel">Omnichannel</SelectItem>
                    <SelectItem value="Messenger">Messenger</SelectItem>
                    <SelectItem value="Whatsapp">Whatsapp</SelectItem>
                    <SelectItem value="Webchat">Webchat</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <Separator />

          <div className="flex flex-col flex-1 gap-2 my-2">
            <Sortable
              value={fields}
              onMove={({ activeIndex, overIndex }) =>
                move(activeIndex, overIndex)
              }
              overlay={<div className="w-full h-32 rounded-sm bg-primary/10" />}
            >
              <div className="flex w-full flex-col gap-4">
                {fields.map((field, index) => (
                  <SortableItem key={field.id} value={field.id} asChild>
                    <div
                      className={cn(
                        "flex gap-2 items-center",
                        field.actionType === ActionType.SendCarousel
                          ? "relative"
                          : "",
                      )}
                    >
                      {form.formState.errors.blocks?.[index] ? (
                        <ErrorAlert
                          message={
                            typeof form.formState.errors.blocks?.[index]
                              ?.message === "object"
                              ? ((
                                  form.formState.errors.blocks?.[index]
                                    ?.message as { message: string }
                                ).message as string)
                              : ""
                          }
                        />
                      ) : (
                        <div className="w-4">{"\u00A0"}</div>
                      )}
                      <div
                        className={cn(
                          "flex-1",
                          field.actionType === ActionType.SendCarousel
                            ? "overflow-hidden"
                            : "",
                        )}
                      >
                        {field.actionType in ActionType
                          ? maps[field.actionType as ActionType]({
                              key: field.id,
                              parentName: `blocks.${index}`,
                            })
                          : null}
                      </div>
                      <div className="flex flex-col">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0"
                          onClick={() => remove(index)}
                        >
                          <XIcon className="size-4" aria-hidden="true" />
                        </Button>
                        <SortableDragHandle
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0"
                        >
                          <MoveVerticalIcon
                            className="size-4"
                            aria-hidden="true"
                          />
                        </SortableDragHandle>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0"
                          onClick={() => onCopy(index)}
                        >
                          <CopyIcon className="size-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  </SortableItem>
                ))}
              </div>
            </Sortable>
          </div>

          <Button>Test Form Submit</Button>

          <SendMessageEditorAction onClick={onClickAction} />
        </form>
      </Form>
    </>
  )
}
