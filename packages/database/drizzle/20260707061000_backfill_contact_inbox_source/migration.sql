UPDATE "ContactInbox"
SET "source" = 'inboundMessage'
WHERE "source" IN (
  'messenger',
  'whatsapp',
  'instagram',
  'zalo',
  'telegram',
  'tiktok'
);
