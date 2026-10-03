ALTER TABLE "Connection" DROP CONSTRAINT "Connection_kind_relation_check", ADD CONSTRAINT "Connection_kind_relation_check" CHECK ((
        ("kind" = 'channel' AND "inboxId" IS NOT NULL AND "channel" IS NOT NULL)
        OR
        ("kind" = 'integration' AND "inboxId" IS NULL AND "channel" IS NULL)
        OR
        "kind" = 'sub_connection'
      ));