-- The dormant ticket* trigger events became pipelineItem* events. The condition
-- schema never accepted the old values, so no row should exist; this keeps any
-- stray one working instead of leaving it on a type nothing emits.
UPDATE "Condition" SET "type" = CASE "type"
  WHEN 'ticketCreated' THEN 'pipelineItemCreated'
  WHEN 'ticketMovedToStage' THEN 'pipelineItemMovedToStage'
  WHEN 'ticketValueChanged' THEN 'pipelineItemValueChanged'
  WHEN 'ticketStatusChanged' THEN 'pipelineItemStatusChanged'
  WHEN 'ticketPriorityChanged' THEN 'pipelineItemPriorityChanged'
END
WHERE "type" IN (
  'ticketCreated',
  'ticketMovedToStage',
  'ticketValueChanged',
  'ticketStatusChanged',
  'ticketPriorityChanged'
);
