#!/bin/sh
set -eu

database=/app/data/infra-management.sqlite
seed=/app/seed/infra-management.sqlite

if [ ! -e "$database" ] && [ -s "$seed" ]; then
  cp "$seed" "$database"
  chmod 600 "$database"
fi

mkdir -p "$DOCKER_CONFIG"
chown -R nextjs:nodejs /app/data

if [ -S /var/run/docker.sock ]; then
  socket_gid=$(stat -c '%g' /var/run/docker.sock)
  socket_group=$(getent group "$socket_gid" | cut -d: -f1 || true)
  if [ -z "$socket_group" ]; then
    socket_group=docker-host
    groupadd --system --gid "$socket_gid" "$socket_group"
  fi
  usermod --append --groups "$socket_group" nextjs
fi

exec gosu nextjs node server.js
