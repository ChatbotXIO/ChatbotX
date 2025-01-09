import { CustomFieldType, Field } from "../create/create-field-schema";

export const getContactCustomField = ({}: {
  contactId: string;
}): Promise<{ data: Field[] }> => {
  // TODO: func get contact custom field
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        data: [],
      });
    }, 1000);
  });
};

export const getCustomFields = (): Promise<{ data: Field[] }> => {
  // TODO: func get list custom field
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        data: [
          {
            id: "date",
            name: "date",
            customFieldType: CustomFieldType.Date,
          },
        ],
      });
    }, 1000);
  });
};
