import type { FlowNode, NodeType } from "@aha.chat/flow-config"
import {
  buttonStepDefaultFn,
  disabledCopyActionTypes,
  StepType,
} from "@aha.chat/flow-config"
import { TriggerFormInitially } from "@aha.chat/ui/components/form/form-trigger-initially"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import { Form } from "@aha.chat/ui/components/ui/form"
import {
  Sortable,
  SortableContent,
  SortableItem,
  SortableItemHandle,
} from "@aha.chat/ui/components/ui/sortable"
import { cn } from "@aha.chat/ui/lib/utils"
import { zodResolver } from "@hookform/resolvers/zod"
import { createId } from "@paralleldrive/cuid2"
import { useReactFlow } from "@xyflow/react"
import { CopyIcon, MoveVerticalIcon, PlusIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { memo, useCallback, useEffect, useMemo, useState } from "react"
import {
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form"
import { funnel } from "remeda"
import RecursiveDropdownMenu from "../components/recursive-dropdown-menu"
import { useMenuData } from "../contexts/menu-data-context"
import { allSteps, DynamicStepEditor } from "../steps"
import { ButtonStepEditor } from "../steps/button/editor"
import { ErrorAlert } from "../steps/error-alert"
import { useStepStore } from "../stores/step-store-provider"
import { allNodesConfig } from "./node-config"
import type { MenuItem } from "./types"

type NodeEditorProps = {
  nodeId: string
  nodeType: NodeType
  nodeDetails: FlowNode["data"]["details"]
}

const NodeEditorQuickReplies = () => {
  const t = useTranslations()
  const { control } = useFormContext()

  const {
    fields: quickReplies,
    append: appendQuickReply,
    move: moveQuickReply,
  } = useFieldArray({
    control,
    name: "quickReplies",
  })

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Sortable
        getItemValue={(item) => item.id}
        onMove={({ activeIndex, overIndex }) =>
          moveQuickReply(activeIndex, overIndex)
        }
        value={quickReplies}
      >
        <SortableContent asChild>
          <div className="contents gap-2">
            {quickReplies.map((field, index) => (
              <SortableItem asChild key={field.id} value={field.id}>
                <ButtonStepEditor parentName={`quickReplies.${index}`} />
              </SortableItem>
            ))}
          </div>
        </SortableContent>
      </Sortable>
      <Button
        onClick={() =>
          appendQuickReply(
            buttonStepDefaultFn({
              label: `${t("fields.quickReply.label")} #${quickReplies.length + 1}`,
            }),
          )
        }
        type="button"
        variant="dashed"
      >
        <PlusIcon />
        {t("fields.quickReply.label")}
      </Button>
    </div>
  )
}

const NodeEditorMenu = memo(
  ({
    nodeType,
    onClick,
  }: {
    nodeType: NodeType
    onClick: (menuItem: MenuItem) => void
  }) => {
    const t = useTranslations()
    const menuData = useMenuData()
    const beforeStep = useWatch({ name: "beforeStep" })

    const [nodeMenus, setNodeMenus] = useState<MenuItem[]>([])

    useEffect(() => {
      const nodeConfig = nodeType ? allNodesConfig[nodeType]?.(t) : null
      if (nodeConfig) {
        setNodeMenus(nodeConfig.menus(t, { ...menuData, beforeStep }))
      } else {
        setNodeMenus([])
      }
    }, [nodeType, t, menuData, beforeStep])

    return (
      nodeMenus.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <PlusIcon />
              {t("actions.create")}
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent className="w-full">
            <RecursiveDropdownMenu data={nodeMenus} onClick={onClick} />
          </DropdownMenuContent>
        </DropdownMenu>
      )
    )
  },
)

export const NodeEditor = memo((props: NodeEditorProps) => {
  const { nodeId, nodeType, nodeDetails } = props

  const t = useTranslations()
  const nodeConfig = nodeType ? allNodesConfig[nodeType]?.(t) : null
  const validator = nodeConfig?.validator.shape.data.shape.details

  const { getNodes, updateNodeData } = useReactFlow()
  const { updatedButtonData, onChangeButtonData } = useStepStore(
    (state) => state,
  )

  const targetNode = useMemo(() => {
    const allNodes = getNodes()
    return allNodes.find((node) => node.id === nodeId)
  }, [nodeId, getNodes])

  // biome-ignore lint/suspicious/noExplicitAny: wip - complex node data types
  const form = useForm<any>({
    // biome-ignore lint/suspicious/noExplicitAny: wip - validator can be undefined
    resolver: validator ? zodResolver(validator as any) : undefined,
    defaultValues: {
      ...nodeDetails,
    },
    mode: "onChange",
  })

  const { control, getValues, setValue } = form
  const {
    fields: stepFields,
    append: appendStep,
    move: moveStep,
    remove: removeStep,
    insert: insertStep,
  } = useFieldArray({
    control,
    name: "steps",
  })

  const allValues = useWatch({ control })
  const debounceUpdateNodeData = useMemo(
    () =>
      funnel(
        () => {
          if (nodeId && targetNode) {
            updateNodeData(nodeId, {
              ...targetNode.data,
              details: allValues,
            })
          }
        },
        { minQuietPeriodMs: 500 },
      ),
    [updateNodeData, nodeId, targetNode, allValues],
  )

  useEffect(() => {
    debounceUpdateNodeData.call()
  }, [debounceUpdateNodeData])

  // useEffect(() => {
  // if (nodeId && targetNode) {
  //   updateNodeData(nodeId, {
  //     ...targetNode.data,
  //     details: debouncedValue,
  //   })
  // }
  // }, [debouncedValue, nodeId, targetNode, updateNodeData])

  useEffect(() => {
    if (updatedButtonData) {
      const targetButtonPath = updatedButtonData.path.replace(
        "data.details.",
        "",
      )
      if (updatedButtonData.data) {
        setValue(targetButtonPath, updatedButtonData.data)
      } else {
        const parts = targetButtonPath.split(".")
        const position = parts.pop()
        const buttonGroupPath = parts.join(".")

        if (position) {
          const buttons = getValues(buttonGroupPath)
          buttons.splice(Number.parseInt(position, 10), 1)
          setValue(buttonGroupPath, Object.values(buttons))
        }
      }

      // reset updatedButtonData
      onChangeButtonData(null)
      //   setOpenNodeDetailSheet(false)
    }
  }, [updatedButtonData, getValues, onChangeButtonData, setValue])

  const onAddStep = useCallback(
    (menuItem: MenuItem) => {
      if (menuItem.stepType) {
        const newStep = allSteps[menuItem.stepType]?.defaultFn(menuItem.props)
        if (newStep) {
          appendStep(newStep)
        }
      }
    },
    [appendStep],
  )

  // biome-ignore lint/suspicious/noExplicitAny: wip
  const replaceIds = (data: any): any => {
    if (typeof data === "object" && data !== null) {
      if (Array.isArray(data)) {
        return data.map((item) => replaceIds(item))
      }

      // biome-ignore lint/suspicious/noExplicitAny: wip
      const newData: any = {}
      for (const key in data) {
        if (key === "id") {
          newData[key] = createId()
        } else {
          newData[key] = replaceIds(data[key])
        }
      }
      return newData
    }
    return data
  }

  const onCopyStep = (index: number) => {
    // biome-ignore lint/suspicious/noExplicitAny: wip - dynamic field path
    const values = getValues(`details.steps.${index}` as any)
    if (values) {
      insertStep(index + 1, replaceIds(values))
    }
  }

  const onRemoveStep = (index: number) => {
    removeStep(index)
  }

  return (
    <Form {...form}>
      {"beforeStep" in nodeDetails && nodeDetails.beforeStep && (
        <DynamicStepEditor
          parentName="beforeStep"
          type={
            (
              nodeDetails as {
                beforeStep: { stepType: StepType }
              }
            ).beforeStep.stepType
          }
        />
      )}

      <div className="my-2 flex flex-1 flex-col gap-2">
        <Sortable
          getItemValue={(item) => item.id}
          onMove={({ activeIndex, overIndex }) =>
            moveStep(activeIndex, overIndex)
          }
          value={stepFields}
        >
          <SortableContent asChild>
            <div className="flex w-full flex-col gap-4">
              {stepFields.map((field, index) => (
                <SortableItem asChild key={field.id} value={field.id}>
                  <div
                    className={cn(
                      "flex items-center gap-2",
                      // biome-ignore lint/suspicious/noExplicitAny: wip
                      (field as any).stepType === StepType.sendCarousel
                        ? "relative"
                        : "",
                    )}
                  >
                    {/* biome-ignore lint/suspicious/noExplicitAny: wip - dynamic form errors */}
                    {(form.formState.errors as any).steps ? (
                      <ErrorAlert
                        message={
                          JSON.stringify(form.formState.errors)
                          // typeof form.formState.errors.steps?.[index]?.message ===
                          //   "object"
                          //   ? ((
                          //     form.formState.errors.steps?.[index]?.message as {
                          //       message: string
                          //     }
                          //   ).message as string)
                          //   : ""
                        }
                      />
                    ) : (
                      <div className="w-4">{"\u00A0"}</div>
                    )}
                    <div
                      className={cn(
                        "break-word flex-1",
                        // biome-ignore lint/suspicious/noExplicitAny: wip
                        (field as any).stepType === StepType.sendCarousel
                          ? "overflow-hidden"
                          : "",
                      )}
                    >
                      <DynamicStepEditor
                        key={field.id}
                        parentName={`steps.${index}`}
                        // biome-ignore lint/suspicious/noExplicitAny: wip
                        type={(field as any).stepType}
                      />
                    </div>
                    <div className="flex flex-col">
                      <Button
                        className="size-8 shrink-0"
                        onClick={() => onRemoveStep(index)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <XIcon aria-hidden="true" className="size-4" />
                      </Button>

                      <SortableItemHandle asChild>
                        <Button className="size-8" size="icon" variant="ghost">
                          <MoveVerticalIcon className="h-4 w-4" />
                        </Button>
                      </SortableItemHandle>
                      {!disabledCopyActionTypes.includes(
                        // biome-ignore lint/suspicious/noExplicitAny: wip
                        (field as any).stepType,
                      ) && (
                        <Button
                          className="size-8 shrink-0"
                          onClick={() => onCopyStep(index)}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <CopyIcon aria-hidden="true" className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </SortableItem>
              ))}
            </div>
          </SortableContent>
        </Sortable>
      </div>

      {"quickReplies" in nodeDetails && nodeDetails.quickReplies && (
        <NodeEditorQuickReplies />
      )}

      <NodeEditorMenu nodeType={nodeType} onClick={onAddStep} />

      <TriggerFormInitially form={form} />
    </Form>
  )
})
