#!/usr/bin/env bash
# make redis: the local Redis of the reminders (P20, D87) in Docker, on localhost:6379, kept with its data between runs.
# noeviction like production: BullMQ must never lose its keys.
set -euo pipefail

NAME=kogane-redis

command -v docker >/dev/null || { echo "Docker is needed for the local Redis"; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker is not running: open Docker Desktop"; exit 1; }

if [ -n "$(docker ps -q -f "name=^${NAME}$")" ]; then
  echo "Redis already running on redis://localhost:6379"
  exit 0
fi

if [ -n "$(docker ps -aq -f "name=^${NAME}$")" ]; then
  docker start "$NAME" >/dev/null
else
  docker run -d --name "$NAME" -p 6379:6379 redis:8-alpine \
    redis-server --maxmemory-policy noeviction --appendonly yes >/dev/null
fi
echo "Redis on redis://localhost:6379"
