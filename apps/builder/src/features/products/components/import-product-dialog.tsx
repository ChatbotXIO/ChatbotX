"use client"

import {
  importFormats,
  importTypes,
  type ProductImportColumnMap,
  productImportFields,
  uploadTypes,
} from "@chatbotx.io/database/partials"
import { matchProductImportHeaders } from "@chatbotx.io/imports"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { Separator } from "@chatbotx.io/ui/components/ui/separator"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { FileDownIcon, Loader2Icon, UploadIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { Suspense, useMemo, useState } from "react"
import { toast } from "sonner"
import { ImportDropzone } from "@/features/import/components/import-dropzone"
import { ImportHistoryList } from "@/features/import/components/import-history-list"
import type { UploadResult } from "@/features/import/hooks/use-presigned-upload"
import type { listImports } from "@/features/import/queries/list-imports.queries"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import { importProductsAction } from "../actions/import-products.action"

type ImportProductDialogProps = {
  workspaceId: string
  historyPromise: Promise<[Awaited<ReturnType<typeof listImports>>]>
}

/** Radix Select forbids an empty item value, so unmapped columns use a sentinel. */
const NOT_MAPPED = "__not_mapped__"

const REQUIRED_FIELD = "name"

export function ImportProductDialog({
  workspaceId,
  historyPromise,
}: ImportProductDialogProps) {
  const t = useTranslations("productImport")
  const tActions = useTranslations("actions")
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<UploadResult | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [columnMap, setColumnMap] = useState<Partial<ProductImportColumnMap>>(
    {},
  )
  const [createMissingCategories, setCreateMissingCategories] = useState(true)

  const resetFile = () => {
    setFile(null)
    setHeaders([])
    setColumnMap({})
  }

  const { execute, isPending } = useAction(
    importProductsAction.bind(null, workspaceId),
    {
      onSuccess: ({ data }) => {
        if (data?.importId) {
          toast.success(t("started"))
          resetFile()
          router.refresh()
        }
      },
      onError: toastActionError(t("error")),
    },
  )

  const fieldLabels = useMemo(
    () =>
      Object.fromEntries(
        productImportFields.options.map((field) => [
          field,
          t(`fields.${field}`),
        ]),
      ) as Record<(typeof productImportFields.options)[number], string>,
    [t],
  )
  const selectableHeaders = useMemo(
    () => Array.from(new Set(headers)),
    [headers],
  )

  const handleUploaded = (result: UploadResult, nextHeaders: string[]) => {
    setFile(result)
    setHeaders(nextHeaders)
    setColumnMap(matchProductImportHeaders(nextHeaders))
  }

  const canConfirm = Boolean(file && columnMap.name) && !isPending

  const handleConfirm = () => {
    if (!(file && columnMap.name)) {
      return
    }
    execute({
      fileId: file.fileId,
      format: file.fileName.toLowerCase().endsWith(".xlsx")
        ? importFormats.enum.xlsx
        : importFormats.enum.csv,
      meta: {
        columnMap: { ...columnMap, name: columnMap.name },
        createMissingCategories,
      },
    })
  }

  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          resetFile()
        }
      }}
      open={open}
    >
      <DialogTrigger
        render={
          <Button size="sm" type="button" variant="outline">
            <UploadIcon />
            {t("title")}
          </Button>
        }
      />

      <DialogContent
        aria-describedby={undefined}
        className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto_auto] gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <DialogHeader className="px-6 pt-6 pb-4 sm:text-center">
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        <div className="mb-4 space-y-5 overflow-y-auto px-6 pb-8">
          <div className="space-y-2">
            <div className="flex justify-end">
              <a
                className="inline-flex items-center gap-1.5 text-primary text-xs underline-offset-4 hover:underline"
                download
                href="/api/imports/products/template"
              >
                <FileDownIcon className="size-3.5" />
                {t("downloadTemplate")}
              </a>
            </div>
            <ImportDropzone
              headerSource="server"
              onCleared={resetFile}
              onUploaded={handleUploaded}
              subType={importTypes.enum.products}
              type={uploadTypes.enum.import}
              uploadLabel={t("upload")}
              workspaceId={workspaceId}
            />
          </div>

          {file ? (
            <div className="mt-4 space-y-3">
              <div className="space-y-1">
                <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t("mapColumns")}
                </h3>
                <p className="text-muted-foreground text-xs">
                  {t("mapColumnsHint")}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {productImportFields.options.map((field) => (
                  <div className="grid gap-1.5" key={field}>
                    <Label htmlFor={`product-import-${field}`}>
                      {fieldLabels[field]}
                      {field === REQUIRED_FIELD ? (
                        <span className="text-destructive">*</span>
                      ) : null}
                    </Label>
                    <Select
                      items={[
                        { label: t("notMapped"), value: NOT_MAPPED },
                        ...selectableHeaders.map((header) => ({
                          label: header,
                          value: header,
                        })),
                      ]}
                      onValueChange={(value) =>
                        setColumnMap((current) => ({
                          ...current,
                          [field]: value === NOT_MAPPED ? undefined : value,
                        }))
                      }
                      value={columnMap[field] ?? NOT_MAPPED}
                    >
                      <SelectTrigger
                        className="w-full"
                        id={`product-import-${field}`}
                      >
                        <SelectValue placeholder={t("notMapped")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NOT_MAPPED}>
                          <span className="text-muted-foreground">
                            {t("notMapped")}
                          </span>
                        </SelectItem>
                        {selectableHeaders.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              <Label className="flex items-start gap-2.5 rounded-lg border bg-muted/40 p-3 font-normal">
                <Checkbox
                  checked={createMissingCategories}
                  onCheckedChange={(checked) =>
                    setCreateMissingCategories(checked === true)
                  }
                />
                <span className="text-sm">{t("createMissingCategories")}</span>
              </Label>
            </div>
          ) : null}

          <Suspense
            fallback={
              <div className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-16 w-full" />
              </div>
            }
          >
            <ImportHistoryList promises={historyPromise} />
          </Suspense>
        </div>

        <Separator />
        <DialogFooter className="px-6 py-4">
          <Button onClick={() => setOpen(false)} type="button" variant="ghost">
            {tActions("cancel")}
          </Button>
          <Button disabled={!canConfirm} onClick={handleConfirm} type="button">
            {isPending ? <Loader2Icon className="animate-spin" /> : null}
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
