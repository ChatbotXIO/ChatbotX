import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks";
import { createFieldAction } from "./create-field-action";
import {
  createFieldSchema,
  CustomFieldType,
  Field,
  FieldType,
} from "./create-field-schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import {
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const GenerateCustomFieldForm = (props: {
  chatbotId: string;
  setIsNewCustomField: (value: boolean) => void;
  onAdded: (field: Field) => void;
}) => {
  const { form, handleSubmitWithAction } = useHookFormAction(
    createFieldAction.bind(null, FieldType.CustomField, props.chatbotId),
    zodResolver(createFieldSchema),
    {
      actionProps: {
        onSuccess: ({ data: res }) => {
          props.onAdded(res?.field as Field);
          toast.success("Field created successfully");
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError.message ?? error.serverError);
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          customFieldType: CustomFieldType.ShortText,
          name: "",
        },
      },
      errorMapProps: {},
    },
  );

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmitWithAction();
        }}
        method="POST"
      >
        <CardHeader className="flex justify-between flex-row">
          <a
            className="flex items-center"
            href="javascript:void(0"
            onClick={() => props.setIsNewCustomField(false)}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 15 15"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M6.85355 3.14645C7.04882 3.34171 7.04882 3.65829 6.85355 3.85355L3.70711 7H12.5C12.7761 7 13 7.22386 13 7.5C13 7.77614 12.7761 8 12.5 8H3.70711L6.85355 11.1464C7.04882 11.3417 7.04882 11.6583 6.85355 11.8536C6.65829 12.0488 6.34171 12.0488 6.14645 11.8536L2.14645 7.85355C1.95118 7.65829 1.95118 7.34171 2.14645 7.14645L6.14645 3.14645C6.34171 2.95118 6.65829 2.95118 6.85355 3.14645Z"
                fill="currentColor"
                fillRule="evenodd"
                clipRule="evenodd"
              ></path>
            </svg>
          </a>
          <CardTitle className="text-center flex-1">Add new</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid w-full items-center gap-4">
            <FormField
              control={form.control}
              name="customFieldType"
              defaultValue={CustomFieldType.ShortText}
              render={({ field }) => (
                <FormItem>
                  <Label htmlFor="Type">Type</Label>
                  <FormControl>
                    <Select
                      value={field.value.toString()}
                      name={field.name}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger id="Type">
                        <SelectValue
                          placeholder="Select the type"
                          onBlur={field.onBlur}
                          ref={field.ref}
                        />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {Object.values(CustomFieldType).map(
                          (customFieldType) => (
                            <SelectItem
                              key={customFieldType}
                              value={customFieldType}
                            >
                              {customFieldType}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            ></FormField>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <Label htmlFor="FieldName">Name</Label>
                  <FormControl>
                    <Input {...field} id="FieldName" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            ></FormField>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button
            variant="destructive"
            onClick={() => {
              props.setIsNewCustomField(false);
            }}
          >
            Cancel
          </Button>

          <Button
            type="submit"
            disabled={form.formState.isSubmitting}
            onClick={() => {}}
          >
            {form.formState.isSubmitting && (
              <Loader2 className="animate-spin" />
            )}
            Save
          </Button>
        </CardFooter>
      </form>
    </Form>
  );
};
