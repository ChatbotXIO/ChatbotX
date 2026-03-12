# ChatbotX CLI

CLI for interacting with the ChatbotX API.

## 1. Set API Configuration (Required)

Before running other commands, save your API key:

```bash
chatbotx config set --apiKey <yourApiKey>
```

You can also save a custom API URL:

```bash
chatbotx config set --apiUrl https://builder-dev.aha.chat
```

Save both API key and API URL in one command:

```bash
chatbotx config set --apiKey <yourApiKey> --apiUrl <yourApiUrl>
```

If you are in local/dev environment with a self-signed certificate, you can temporarily disable TLS certificate validation:

```bash
chatbotx config set --allowSelfSignedCert true
```

You can also set it per-run using environment variable:

```bash
CHATBOTX_ALLOW_SELF_SIGNED_CERT=true chatbotx tags list
```

Preferred (more secure) approach is to trust your CA certificate:

```bash
NODE_EXTRA_CA_CERTS=/path/to/ca.pem chatbotx tags list
```

Notes:

- The CLI supports the global option `--apiUrl` if you want to override the stored base URL for a single run.
- The default base URL is `https://builder-dev.aha.chat`.

## 2. Commands: `tags`

### List all tags

```bash
chatbotx tags list
```

### Create a new tag

```bash
chatbotx tags create --name <tagName>
```

### Show tag details

```bash
chatbotx tags show --id <tagId>
```

### Show tag details by name

```bash
chatbotx tags show-by-name --name <tagName>
```

### Update a tag

```bash
chatbotx tags update --id <tagId> --name <newTagName>
```

### Delete a tag

```bash
chatbotx tags delete --id <tagId>
```

## 3. Commands: `custom-fields`

### List all custom fields

```bash
chatbotx custom-fields list
```

### Create a new custom field

```bash
chatbotx custom-fields create --name <fieldName> --customFieldType <type>
```

Valid `customFieldType` values:

- `shortText`
- `number`
- `date`
- `datetime`
- `boolean`
- `longText`

### Show custom field details

```bash
chatbotx custom-fields show --id <customFieldId>
```

### Show custom field details by name

```bash
chatbotx custom-fields show-by-name --name <fieldName>
```

## 4. Commands: `contacts`

### Get contact by ID

```bash
chatbotx contacts get-by-id --id <contactId>
```

### List contacts by custom field value

```bash
chatbotx contacts list-by-custom-field --customFieldId <customFieldId> --customFieldValue <value>
```

### List tags of a contact by contact ID

```bash
chatbotx contacts list-tags-by-id --id <contactId>
```

### Add a tag to a contact

```bash
chatbotx contacts add-tag --id <contactId> --tagId <tagId>
```

### Delete a tag from a contact

```bash
chatbotx contacts delete-tag --id <contactId> --tagId <tagId>
```

### List custom fields of a contact by contact ID

```bash
chatbotx contacts list-custom-fields-by-id --id <contactId>
```

### Get a contact's custom field value

```bash
chatbotx contacts get-custom-field-value --id <contactId> --customFieldId <customFieldId>
```

### Update a contact custom field value

```bash
chatbotx contacts update-custom-field-value --id <contactId> --customFieldId <customFieldId> --value <customFieldValue>
```

### Delete a contact custom field

```bash
chatbotx contacts delete-custom-field --id <contactId> --customFieldId <customFieldId>
```

### Send a message to a contact

```bash
chatbotx contacts send-message --id <contactId> --channel <channel> --content <message> --files <file1,file2> --flowId <flowId> --clientId <clientId>
```

### Create a new contact

```bash
chatbotx contacts create --phoneNumber <phoneNumber> --email <email> --gender <male|female|unknown> --firstName <firstName> --lastName <lastName>
```
