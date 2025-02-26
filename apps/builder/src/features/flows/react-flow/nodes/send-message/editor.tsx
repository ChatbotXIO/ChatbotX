import { FormInput } from "@/components/form-input"
import { SingleSelect } from "@/components/single-select"
import { Button } from "@/components/ui/button"
import { Form, TriggerFormInitially } from "@/components/ui/form"
import { Separator } from "@/components/ui/separator"
import {
  Sortable,
  SortableDragHandle,
  SortableItem,
} from "@/components/ui/sortable"
import { EditButtonDialog } from "@/features/flows/react-flow/blocks/button/components/edit-button-dialog"
import { CountCharacterEditor } from "@/features/flows/react-flow/blocks/count-character/editor"
import { FormatDateEditor } from "@/features/flows/react-flow/blocks/format-date/editor"
import { GenerateRandomCodeEditor } from "@/features/flows/react-flow/blocks/generate-random-code/editor"
import { GetDataFromJsonEditor } from "@/features/flows/react-flow/blocks/get-data-from-json/editor"
import { MarkEmailVerifiedBlockEditor } from "@/features/flows/react-flow/blocks/mark-email-verified/editor"
import { OpenAIAnalyzeImageEditor } from "@/features/flows/react-flow/blocks/open-ai-analyze-image/editor"
import { OpenAIDeleteMessageHistoryEditor } from "@/features/flows/react-flow/blocks/open-ai-delete-message-history/editor"
import { OpenAIGenerateImageEditor } from "@/features/flows/react-flow/blocks/open-ai-generate-image/editor"
import { OpenAIGenerateTextAdvancedEditor } from "@/features/flows/react-flow/blocks/open-ai-generate-text-advanced/editor"
import { OpenAIGenerateTextAgentEditor } from "@/features/flows/react-flow/blocks/open-ai-generate-text-agent/editor"
import { OpenAIGenerateTextAssistantEditor } from "@/features/flows/react-flow/blocks/open-ai-generate-text-assistant/editor"
import { OpenAIGenerateTextEditor } from "@/features/flows/react-flow/blocks/open-ai-generate-text/editor"
import { OpenAISpeechToTextEditor } from "@/features/flows/react-flow/blocks/open-ai-speech-to-text/editor"
import { OpenAITextToSpeechEditor } from "@/features/flows/react-flow/blocks/open-ai-text-to-speech/editor"
import { OptInEmailBlockEditor } from "@/features/flows/react-flow/blocks/opt-in-email/editor"
import { OptOutEmailBlockEditor } from "@/features/flows/react-flow/blocks/opt-out-email/editor"
import { SendAudioBlockEditor } from "@/features/flows/react-flow/blocks/send-audio/editor"
import { SendCardBlockEditor } from "@/features/flows/react-flow/blocks/send-card/editor"
import { SendCarouselBlockEditor } from "@/features/flows/react-flow/blocks/send-carousel/editor"
import { SendImageBlockEditor } from "@/features/flows/react-flow/blocks/send-image/editor"
import { SendVideoBlockEditor } from "@/features/flows/react-flow/blocks/send-video/editor"
import { generateDefaultValue } from "@/features/flows/react-flow/blocks/utils"
import { cn } from "@/lib/utils"
import { zodResolver } from "@hookform/resolvers/zod"
import { createId } from "@paralleldrive/cuid2"
import { type Node, useReactFlow } from "@xyflow/react"
import cloneDeep from "lodash.clonedeep"
import { CopyIcon, MoveVerticalIcon, XIcon } from "lucide-react"
import React, { type ReactNode, useCallback, useEffect, useState } from "react"
import { useFieldArray, useForm } from "react-hook-form"
import { ActionType, disabledCopyActionTypes } from "../../action-type"
import { ErrorAlert } from "../../blocks/error-alert"
import { SendTextBlockEditor } from "../../blocks/send-text/editor"
import { messageTypeLabels } from "../../types"
import { getAllIds } from "../../utils"
import { type SendMessageNodeSchema, sendMessageNodeSchema } from "./schema"
import SendMessageEditorAction from "./send-message-editor-action"

export interface BlockEditorProps {
  key: string
  parentName: string
}

export const actionsBlockEditor: Partial<
  Record<ActionType, (props: BlockEditorProps) => ReactNode>
> = {
  [ActionType.OpenAIGenerateText]: ({ key, parentName }) => (
    <OpenAIGenerateTextEditor key={key} parentName={parentName} />
  ),
  [ActionType.OpenAIGenerateTextAgent]: ({ key, parentName }) => (
    <OpenAIGenerateTextAgentEditor key={key} parentName={parentName} />
  ),
  [ActionType.OpenAIGenerateTextAdvanced]: ({ key, parentName }) => (
    <OpenAIGenerateTextAdvancedEditor key={key} parentName={parentName} />
  ),
  [ActionType.OpenAIGenerateTextAssistant]: ({ key, parentName }) => (
    <OpenAIGenerateTextAssistantEditor key={key} parentName={parentName} />
  ),
  [ActionType.OpenAIGenerateImage]: ({ key, parentName }) => (
    <OpenAIGenerateImageEditor key={key} parentName={parentName} />
  ),
  [ActionType.OpenAIAnalyzeImage]: ({ key, parentName }) => (
    <OpenAIAnalyzeImageEditor key={key} parentName={parentName} />
  ),
  [ActionType.OpenAISpeechToText]: ({ key, parentName }) => (
    <OpenAISpeechToTextEditor key={key} parentName={parentName} />
  ),
  [ActionType.OpenAITextToSpeech]: ({ key, parentName }) => (
    <OpenAITextToSpeechEditor key={key} parentName={parentName} />
  ),
  [ActionType.OpenAIDeleteMessageHistory]: ({ key, parentName }) => (
    <OpenAIDeleteMessageHistoryEditor key={key} parentName={parentName} />
  ),
  [ActionType.MarkEmailVerified]: ({ key }) => (
    <MarkEmailVerifiedBlockEditor key={key} />
  ),
  [ActionType.OptInEmail]: ({ key }) => <OptInEmailBlockEditor key={key} />,
  [ActionType.OptOutEmail]: ({ key }) => <OptOutEmailBlockEditor key={key} />,

  // Tools
  [ActionType.GetDataFromJson]: ({ key, parentName }) => (
    <GetDataFromJsonEditor key={key} parentName={parentName} />
  ),
  [ActionType.FormatDate]: ({ key, parentName }) => (
    <FormatDateEditor key={key} parentName={parentName} />
  ),
  [ActionType.RandomCode]: ({ key, parentName }) => (
    <GenerateRandomCodeEditor key={key} parentName={parentName} />
  ),
  [ActionType.CountCharacters]: ({ key, parentName }) => (
    <CountCharacterEditor key={key} parentName={parentName} />
  ),
}

export default function SendMessageNodeEditor({
  activeNode,
}: {
  activeNode: Node<SendMessageNodeSchema["data"]>
}) {
  const maps: Partial<
    Record<ActionType, (props: BlockEditorProps) => ReactNode>
  > = {
    [ActionType.SendText]: ({ key, parentName }) => (
      <SendTextBlockEditor
        key={key}
        parentName={parentName}
        onEditButton={(name: string) => openEditButton(name)}
      />
    ),
    [ActionType.SendImage]: ({ key, parentName }) => (
      <SendImageBlockEditor key={key} parentName={parentName} />
    ),
    [ActionType.SendCard]: ({ key, parentName }) => (
      <SendCardBlockEditor
        key={key}
        parentName={parentName}
        onEditButton={(name: string) => openEditButton(name)}
      />
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
    ...actionsBlockEditor,
  }

  const { setNodes, setEdges } = useReactFlow()

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

  const form = useForm<SendMessageNodeSchema["data"]>({
    resolver: zodResolver(sendMessageNodeSchema.shape.data),
    defaultValues: activeNode.data,
    mode: "onBlur",
  })
  const { control, getValues, watch } = form

  useEffect(() => {
    const { unsubscribe } = watch((value) => {
      onChange(value)
    })
    return () => unsubscribe()
  }, [watch, onChange])

  const { fields, append, move, remove, insert } = useFieldArray({
    control,
    name: "blocks",
  })

  const [parentNameBlockButton, setParentNameBlockButton] = useState<string>("")
  const [openedEditButton, setOpenedEditButton] = useState<boolean>(false)

  const openEditButton = (parentName: string) => {
    setParentNameBlockButton(parentName)
    setOpenedEditButton(true)
  }

  const closeEditButton = () => {
    setParentNameBlockButton("")
    setOpenedEditButton(false)
  }

  const onClickAction = (name: ActionType) => {
    const value = generateDefaultValue(name)
    if (value) {
      append(value)
    }
  }

  const onCopyBlock = (index: number) => {
    const values = getValues(`blocks.${index}`)
    if (values) {
      insert(index + 1, { ...cloneDeep(values), id: createId() })
    }
  }

  const onRemoveBlock = (index: number) => {
    const block = getValues(`blocks.${index}`)
    const handlerIds = getAllIds(block)

    setEdges((edges) => {
      return edges.filter(
        (edge) =>
          !handlerIds.includes(edge.targetHandle ?? "") &&
          !handlerIds.includes(edge.sourceHandle ?? ""),
      )
    })

    remove(index)
  }

  return (
    <Form {...form}>
      <FormInput name={"messageType"} label="Message Type">
        <SingleSelect name={"messageType"} options={messageTypeLabels} />
      </FormInput>

      <Separator />

      <div className="flex flex-col flex-1 gap-2 my-2">
        <Sortable
          value={fields}
          onMove={({ activeIndex, overIndex }) => move(activeIndex, overIndex)}
          overlay={<div className="w-full h-32 rounded-sm bg-primary/10" />}
        >
          <div className="flex w-full flex-col gap-4">
            {(fields as SendMessageNodeSchema["data"]["blocks"]).map(
              (field, index) => (
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
                        "flex-1 break-all",
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
                        onClick={() => onRemoveBlock(index)}
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
                      {!disabledCopyActionTypes.includes(field.actionType) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0"
                          onClick={() => onCopyBlock(index)}
                        >
                          <CopyIcon className="size-4" aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  </div>
                </SortableItem>
              ),
            )}
          </div>
        </Sortable>
      </div>

      <SendMessageEditorAction onClick={onClickAction} />
      {openedEditButton && (
        <EditButtonDialog
          activeNode={activeNode}
          parentName={parentNameBlockButton}
          open={openedEditButton}
          onOpenChange={closeEditButton}
        />
      )}

      <TriggerFormInitially form={form} />
    </Form>
  )
}
