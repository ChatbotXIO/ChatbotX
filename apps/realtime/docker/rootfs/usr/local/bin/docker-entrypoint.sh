#!/bin/bash

cd /app/apps/realtime
umask 077
exec ./node_modules/.bin/tsx src/main.ts
