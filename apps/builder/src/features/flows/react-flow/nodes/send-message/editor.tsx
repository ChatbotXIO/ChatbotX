import { cn } from "@/components/lib/utils"
import { Button } from "@/components/ui/button"
import { Form, TriggerFormInitially } from "@/components/ui/form"
import { Separator } from "@/components/ui/separator"
import {
  Sortable,
  SortableDragHandle,
  SortableItem,
} from "@/components/ui/sortable"
import { generateDefaultFn } from "@/features/flows/react-flow/blocks/utils"
import { zodResolver } from "@hookform/resolvers/zod"
import { createId } from "@paralleldrive/cuid2"
import type { Node } from "@xyflow/react"
import cloneDeep from "lodash.clonedeep"
import { CopyIcon, MoveVerticalIcon, XIcon } from "lucide-react"
import { useEffect } from "react"
import { useFieldArray, useForm } from "react-hook-form"
import { ActionType, disabledCopyActionTypes } from "../../action-type"
import { DynamicBlockEditor } from "../../blocks"
import { ErrorAlert } from "../../blocks/error-alert"
import { useFlowStore } from "../../stores/flow-store-provider"
import { type SendMessageNodeSchema, sendMessageNodeSchema } from "./schema"
import SendMessageEditorAction from "./send-message-editor-action"
import { InboxSelect } from "@/features/inboxes/inbox-select"

export function SendMessageNodeEditor({
  activeNode,
}: {
  activeNode: Node<SendMessageNodeSchema["data"]>
}) {
  const { updateNode, removeBlock } = useFlowStore((state) => state)

  const form = useForm<SendMessageNodeSchema["data"]>({
    resolver: zodResolver(sendMessageNodeSchema.shape.data),
    defaultValues: {
      ...activeNode.data,
    },
    mode: "onBlur",
  })
  const { control, getValues, watch } = form

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    const { unsubscribe } = watch((value) => {
      updateNode(
        activeNode.id,
        value as unknown as SendMessageNodeSchema["data"],
      )
      // onChange(value)
    })
    return () => unsubscribe()
  }, [watch, activeNode.id])

  // @ts-ignore
  const { fields, append, move, remove, insert } = useFieldArray({
    control,
    name: "blocks",
  })

  const onClickAction = (name: ActionType) => {
    const value = generateDefaultFn(name)
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
    removeBlock(block.id)
    remove(index)
  }

  return (
    <Form {...form}>
      <InboxSelect name={"messageType"} />

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
                      <DynamicBlockEditor
                        type={field.actionType}
                        key={field.id}
                        parentName={`blocks.${index}`}
                      />
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

      <TriggerFormInitially form={form} />
    </Form>
  )
}
