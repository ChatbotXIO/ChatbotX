"use client"

import { Button } from "@/components/ui/button"
import { Form } from "@/components/ui/form"
import {
  Sortable,
  SortableDragHandle,
  SortableItem,
} from "@/components/ui/sortable"
import { ErrorAlert } from "@/features/flows/react-flow/blocks/error-alert"
import { WaitBlockEditor } from "@/features/flows/react-flow/blocks/wait/editor"
import {
  type WaitNodeSchema,
  waitNodeSchema,
} from "@/features/flows/react-flow/nodes/wait/schema"
import { zodResolver } from "@hookform/resolvers/zod"
import { createId } from "@paralleldrive/cuid2"
import { type Node, useReactFlow } from "@xyflow/react"
import cloneDeep from "lodash.clonedeep"
import { CopyIcon, MoveVerticalIcon, XIcon } from "lucide-react"
import { useCallback, useEffect } from "react"
import { useFieldArray, useForm } from "react-hook-form"

export default function WaitNodeEditor({
  activeNode,
}: {
  activeNode: Node<WaitNodeSchema["data"]>
}) {
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

  const { control, getValues, watch, ...form } = useForm<
    WaitNodeSchema["data"]
  >({
    resolver: zodResolver(waitNodeSchema.shape.data),
    defaultValues: activeNode.data,
  })

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    const { unsubscribe } = watch((value) => {
      onChange(value)
    })
    return () => unsubscribe()
  }, [watch])

  const { fields, move, remove, insert } = useFieldArray({
    control,
    name: "blocks",
  })

  const onCopy = (index: number) => {
    const values = getValues(`blocks.${index}`)
    if (values) {
      insert(index + 1, { ...cloneDeep(values), id: createId() })
    }
  }

  return (
    <>
      <Form {...form} getValues={getValues} control={control} watch={watch}>
        <div className="flex flex-col flex-1 gap-2 my-2">
          <Sortable
            value={fields}
            onMove={({ activeIndex, overIndex }) =>
              move(activeIndex, overIndex)
            }
            overlay={<div className="w-full h-32 rounded-sm bg-primary/10" />}
          >
            <div className="flex w-full flex-col gap-8">
              {fields.map((field, index) => (
                <SortableItem key={field.id} value={field.id} asChild>
                  <div className="flex gap-2 items-center">
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
                    <div className="flex-1 break-all">
                      <WaitBlockEditor parentName={`blocks.${index}`} />
                    </div>
                    <div className="flex flex-col">
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0"
                          onClick={() => remove(index)}
                        >
                          <XIcon className="size-4" aria-hidden="true" />
                        </Button>
                      )}
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
      </Form>
    </>
  )
}
