"use client"

import {
  BUTTON_LABEL_MAX,
  type ButtonStepInput,
  type ButtonStepProps,
  type ButtonType,
  buttonStepSchema,
  buttonTypes,
  type FlowNode,
  nodeTypeSchema,
  type OpenWebsiteStepSchema,
  openWebsiteStepDefaultFn,
  performActionNodeDefaultFn,
  type StartAnotherNodeStepSchema,
  type StartExternalFlowStepSchema,
  type StartExternalNodeStepSchema,
  sendMessageNodeDefaultFn,
  startAnotherNodeStepDefaultFn,
  startExternalFlowStepDefaultFn,
  startExternalNodeStepDefaultFn,
} from "@chatbotx.io/flow-config"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useReactFlow } from "@xyflow/react"
import { getProperty } from "dot-prop"
import { PlusIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form"
import { setProperty } from "@/lib/object-util"
import RecursiveDropdownMenu from "./components/recursive-dropdown-menu"
import { sendMessageEditorMenusWithButton } from "./nodes/send-message/menu"
import type { MenuItem } from "./nodes/types"
import { allSteps, DynamicStepEditor } from "./steps"
import { allButtonsConfig } from "./steps/button-config"
import { useStepStore } from "./stores/step-store-provider"

function AllButtonOptions({
  onChooseButton,
  hiddenButtonTypes,
}: {
  onChooseButton: (buttonType: ButtonType | null) => void
  hiddenButtonTypes?: ButtonType[]
}) {
  const t = useTranslations()
  const allButtons = useMemo(() => {
    const configs = allButtonsConfig(t)
    if (!hiddenButtonTypes || hiddenButtonTypes.length === 0) {
      return configs
    }
    return configs.filter(
      (buttonConfig) => !hiddenButtonTypes.includes(buttonConfig.buttonType),
    )
  }, [t, hiddenButtonTypes])

  return (
    <div className="flex flex-col gap-1.5">
      {allButtons.map((buttonConfig) => (
        <Button
          className="flex w-full justify-start gap-2"
          key={buttonConfig.buttonType}
          onClick={() => onChooseButton(buttonConfig.buttonType)}
          type="button"
          variant="outline"
        >
          <buttonConfig.icon />
          <span className="text-center">{buttonConfig.label}</span>
        </Button>
      ))}
    </div>
  )
}

function ActiveButton({
  buttonType,
  onChooseButton,
}: {
  buttonType: ButtonType
  onChooseButton: (buttonType: ButtonType | null) => void
}) {
  const t = useTranslations()
  const allButtons = useMemo(() => allButtonsConfig(t), [t])
  const activeButton = allButtons.find((bt) => bt.buttonType === buttonType)
  const { getValues } = useFormContext()
  const beforeStep = getValues("beforeStep")

  if (!activeButton) {
    return null
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 rounded border border-dashed pl-4 text-sm">
        <activeButton.icon className="size-4" />
        <span className="flex-1">{activeButton.label}</span>
        <Button
          className="hover:bg-red hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation()
            onChooseButton(null)
          }}
          type="button"
          variant="ghost"
        >
          <XIcon />
        </Button>
      </div>

      {beforeStep && (
        <DynamicStepEditor parentName="beforeStep" type={beforeStep.stepType} />
      )}
    </div>
  )
}

function ButtonSteps() {
  const t = useTranslations()
  const { control } = useFormContext()
  const { fields, append, remove } = useFieldArray({
    control,
    name: "steps",
  })

  const onAddAction = useCallback(
    (menuItem: MenuItem) => {
      if (menuItem.stepType) {
        const newStep = allSteps[menuItem.stepType]?.defaultFn(menuItem.props)
        if (newStep) {
          append(newStep)
        }
      }
    },
    [append],
  )

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="font-medium">{t("flows.additionalSteps")}</div>

      {fields.map((field, index) => (
        <div className="flex items-center gap-2" key={field.id}>
          <div className="break-word flex-1">
            <DynamicStepEditor
              parentName={`steps.${index}`}
              // biome-ignore lint/suspicious/noExplicitAny: wip
              type={(field as any).stepType}
            />
          </div>
          <Button
            className="size-8 shrink-0"
            onClick={() => remove(index)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <XIcon aria-hidden="true" className="size-4" />
          </Button>
        </div>
      ))}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="w-32" size="sm" variant="outline">
            <PlusIcon />
            {t("actions.actions")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <RecursiveDropdownMenu
            data={sendMessageEditorMenusWithButton(t)}
            onClick={onAddAction}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function ButtonEditorDialog() {
  const [activeNode, setActiveNode] = useState<FlowNode | null>(null)

  const t = useTranslations()

  const { getNodes, addNodes, setEdges, updateNodeData, screenToFlowPosition } =
    useReactFlow()

  const refreshEdge = useCallback(
    (buttonId: string, sourceNodeId: string, targetNodeId: string) => {
      setEdges((currentEdges) => [
        ...currentEdges.filter((edge) => edge.sourceHandle !== buttonId),
        {
          id: buttonId,
          source: sourceNodeId,
          target: targetNodeId,
          sourceHandle: buttonId,
          targetHandle: targetNodeId,
          type: "buttonedge",
        },
      ])
    },
    [setEdges],
  )

  const removeEdge = useCallback(
    (buttonId: string) => {
      setEdges((currentEdges) =>
        currentEdges.filter((edge) => edge.sourceHandle !== buttonId),
      )
    },
    [setEdges],
  )
  const buttonPath = useStepStore((state) => state.buttonPath)
  const setButtonPath = useStepStore((state) => state.setButtonPath)
  const openButtonEditorDialog = useStepStore(
    (state) => state.openButtonEditorDialog,
  )
  const setOpenButtonEditorDialog = useStepStore(
    (state) => state.setOpenButtonEditorDialog,
  )
  const onChangeButtonData = useStepStore((state) => state.onChangeButtonData)
  const buttonEditorConfig = useStepStore((state) => state.buttonEditorConfig)

  const form = useForm<ButtonStepInput, object, ButtonStepProps>({
    resolver: zodResolver(buttonStepSchema),
    defaultValues: {},
    mode: "onChange",
  })
  const { setValue, getValues, control } = form
  const buttonType = useWatch({ control, name: "buttonType" })
  const buttonId = useWatch({ control, name: "id" })

  // biome-ignore lint/correctness/useExhaustiveDependencies: wip
  useEffect(() => {
    if (buttonPath && openButtonEditorDialog) {
      const allNodes = getNodes()
      const foundNode = allNodes.find((node) => node.selected) as FlowNode
      if (foundNode) {
        const rawData = getProperty(foundNode, buttonPath)

        if (rawData) {
          setActiveNode(foundNode)
          form.reset(rawData as ButtonStepProps)
          setOpenButtonEditorDialog(true)
          return
        }
      }
    }

    form.reset()
    setActiveNode(null)
    setOpenButtonEditorDialog(false)
  }, [buttonPath, openButtonEditorDialog])

  const onSave = useCallback(() => {
    if (!(activeNode && buttonPath)) {
      return
    }

    const values = form.getValues()
    setProperty(activeNode, buttonPath, values)
    updateNodeData(activeNode.id, activeNode.data)

    if (values.buttonType === buttonTypes.enum.startAnotherNode) {
      const targetNodeId = values.beforeStep.nodeId
      const currentButtonId = values.id as string

      if (currentButtonId && targetNodeId) {
        refreshEdge(currentButtonId, activeNode.id, targetNodeId)
      }
    }

    setOpenButtonEditorDialog(false)
    onChangeButtonData({
      path: buttonPath,
      data: values as unknown as ButtonStepProps,
    })
  }, [
    activeNode,
    buttonPath,
    form,
    onChangeButtonData,
    refreshEdge,
    setOpenButtonEditorDialog,
    updateNodeData,
  ])

  const onDelete = useCallback(() => {
    if (!(activeNode && buttonPath)) {
      return
    }

    const foundedButton: ButtonStepProps | null = getProperty(
      activeNode,
      buttonPath,
    )
    if (foundedButton) {
      removeEdge(foundedButton.id)
      onChangeButtonData({
        path: buttonPath,
        data: null,
      })
    }

    setOpenButtonEditorDialog(false)
    setButtonPath(null)
  }, [
    activeNode,
    buttonPath,
    onChangeButtonData,
    removeEdge,
    setButtonPath,
    setOpenButtonEditorDialog,
  ])

  const onChooseButton = useCallback(
    (selectedButtonType: ButtonType | null) => {
      const allNodes = getNodes() as FlowNode[]

      setValue("buttonType", selectedButtonType)
      setValue("steps", [])
      setValue("beforeStep", null)

      const position = screenToFlowPosition({
        x: window.innerWidth - 400,
        y: 100,
      })

      let newNode: FlowNode | null = null
      let beforeStep:
        | StartAnotherNodeStepSchema
        | OpenWebsiteStepSchema
        | StartExternalFlowStepSchema
        | StartExternalNodeStepSchema
        | null = null

      switch (selectedButtonType) {
        case buttonTypes.enum.sendMessage: {
          const nodeCount = allNodes.filter(
            (node) => node.type === nodeTypeSchema.enum.sendMessage,
          ).length
          newNode = sendMessageNodeDefaultFn({
            nodeProps: {
              position,
            },
            dataProps: {
              name: `${t("actions.sendMessage")} #${nodeCount + 1}`,
            },
          })
          beforeStep = startAnotherNodeStepDefaultFn({
            nodeId: newNode.id,
            viewOnly: true,
          })
          break
        }
        case buttonTypes.enum.performAction: {
          const nodeCount = allNodes.filter(
            (node) => node.type === nodeTypeSchema.enum.performAction,
          ).length
          newNode = performActionNodeDefaultFn({
            nodeProps: {
              position,
            },
            dataProps: {
              name: `${t("flows.actions.performAction")} #${nodeCount + 1}`,
            },
          })
          beforeStep = startAnotherNodeStepDefaultFn({
            nodeId: newNode.id,
            viewOnly: true,
          })
          break
        }
        case buttonTypes.enum.startExternalFlow: {
          beforeStep = startExternalFlowStepDefaultFn()
          break
        }
        case buttonTypes.enum.openWebsite: {
          beforeStep = openWebsiteStepDefaultFn()
          break
        }
        case buttonTypes.enum.startExternalNode: {
          beforeStep = startExternalNodeStepDefaultFn()
          break
        }
        case buttonTypes.enum.startAnotherNode: {
          beforeStep = startAnotherNodeStepDefaultFn()
          break
        }
        default: {
          return
        }
      }

      if (beforeStep) {
        setValue("beforeStep", beforeStep)
      }

      if (newNode) {
        addNodes([newNode])

        const currentButtonId = getValues("id") as string
        if (currentButtonId && activeNode) {
          refreshEdge(currentButtonId, activeNode.id, newNode.id)
        }

        onSave()
      }
    },
    [
      activeNode,
      addNodes,
      getNodes,
      getValues,
      onSave,
      refreshEdge,
      screenToFlowPosition,
      setValue,
      t,
    ],
  )

  return buttonId ? (
    <Dialog
      onOpenChange={(isOpen) => setOpenButtonEditorDialog(isOpen)}
      open={openButtonEditorDialog}
    >
      <DialogContent className={"max-h-screen max-w-lg overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.editFeature", { feature: t("fields.button.label") })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex w-full flex-col gap-4"
            onSubmit={(e) => {
              e.stopPropagation()
              return form.handleSubmit(onSave)(e)
            }}
          >
            <InputField
              disabled={!!buttonEditorConfig?.lockLabel}
              label={t("fields.name.label")}
              maxLength={BUTTON_LABEL_MAX}
              name="label"
              required
            />

            <div className="mt-2 font-medium">
              {t("fields.button.whenPressed")}
            </div>

            {buttonType ? (
              <div className="flex flex-col gap-2">
                <ActiveButton
                  buttonType={buttonType}
                  onChooseButton={onChooseButton}
                />
                <ButtonSteps />
              </div>
            ) : (
              <AllButtonOptions
                hiddenButtonTypes={
                  buttonEditorConfig?.hiddenButtonTypes ?? undefined
                }
                onChooseButton={onChooseButton}
              />
            )}
          </form>
        </Form>

        <DialogFooter>
          <div className="flex-1">
            {!buttonEditorConfig?.hideDelete && (
              <Button
                onClick={onDelete}
                size="sm"
                type="button"
                variant="destructive"
              >
                {t("actions.delete")}
              </Button>
            )}
          </div>
          <DialogClose asChild>
            <Button size="sm" type="button" variant="ghost">
              {t("actions.cancel")}
            </Button>
          </DialogClose>
          <Button
            disabled={!form.formState.isValid}
            onClick={form.handleSubmit(onSave)}
            size="sm"
          >
            {t("actions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null
}
