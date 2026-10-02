#!/bin/bash

cd /app/apps/realtime
umask 077
exec pnpm start
