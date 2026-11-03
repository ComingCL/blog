#!/bin/sh
set -eu
umask 077
# Compose bind-mounted secrets retain host ownership. Copy before PostgreSQL drops privileges.
mkdir -p /run/pg-private
cp /run/secrets/db_password /run/pg-private/password
chown -R postgres:postgres /run/pg-private
chmod 700 /run/pg-private
chmod 600 /run/pg-private/password
exec /usr/local/bin/docker-entrypoint.sh postgres
