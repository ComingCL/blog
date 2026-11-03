#!/bin/sh
set -eu
umask 077
# Keep host secrets 0600 and let the unprivileged PostgreSQL entrypoint read private copies.
mkdir -p /run/pg-private
cp /run/secrets/db_root_password /run/pg-private/root-password
cp /run/secrets/app_init /docker-entrypoint-initdb.d/10-blog.sql
chown -R postgres:postgres /run/pg-private
chown postgres:postgres /docker-entrypoint-initdb.d/10-blog.sql
chmod 700 /run/pg-private
chmod 600 /run/pg-private/root-password /docker-entrypoint-initdb.d/10-blog.sql
exec /usr/local/bin/docker-entrypoint.sh postgres
