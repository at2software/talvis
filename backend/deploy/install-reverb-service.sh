#!/usr/bin/env bash
# Installs/refreshes the Reverb systemd unit and restarts it. Idempotent - safe to run
# on every deploy. Must run as root (the CI deploy job calls it via sudo).
#
# A restart on every deploy is deliberate: Reverb reads config/reverb.php once at start,
# so without it a changed app key stays inactive until someone notices the site is dead.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT_NAME="nexus-reverb.service"
UNIT_DEST="/etc/systemd/system/$UNIT_NAME"

if [[ $EUID -ne 0 ]]; then
    echo "must run as root" >&2
    exit 1
fi

# The deploy mirrors with -nopermissions, so the copy in the repo is not trusted to be 0644.
install -m 0644 -o root -g root "$ROOT/deploy/$UNIT_NAME" "$UNIT_DEST"

touch /var/www/html/backend/storage/logs/reverb.log
chown nexusadmin:www-data /var/www/html/backend/storage/logs/reverb.log
chmod 0664 /var/www/html/backend/storage/logs/reverb.log

systemctl daemon-reload
systemctl enable "$UNIT_NAME"

# Adopt the pre-systemd process: it was started by hand and is invisible to systemd, so
# without this the restart below would leave two servers fighting over port 6001.
STRAY_PIDS="$(pgrep -f 'artisan reverb:start' || true)"
MANAGED_PID="$(systemctl show -p MainPID --value "$UNIT_NAME" 2>/dev/null || echo 0)"
STRAY_KILLED=""
for pid in $STRAY_PIDS; do
    if [[ "$pid" != "$MANAGED_PID" ]]; then
        echo "stopping unmanaged reverb process $pid"
        kill "$pid" 2>/dev/null || true
        STRAY_KILLED="$STRAY_KILLED $pid"
    fi
done

# SIGTERM is asynchronous: restarting while a killed process still holds 6001 would make
# the new server exit with "address already in use".
for pid in $STRAY_KILLED; do
    for _ in $(seq 1 10); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 1
    done
    if kill -0 "$pid" 2>/dev/null; then
        echo "unmanaged reverb process $pid did not exit, sending SIGKILL"
        kill -9 "$pid" 2>/dev/null || true
        sleep 1
    fi
done

systemctl restart "$UNIT_NAME"

# `systemctl is-active` is not readiness. Type=simple marks the unit active the moment
# systemd forks, and an uncached Laravel boot takes well over a second before Reverb binds
# the port - the window in which the deploy's health check saw "connection refused".
for _ in $(seq 1 60); do
    if (exec 3<>/dev/tcp/127.0.0.1/6001) 2>/dev/null; then
        echo "$UNIT_NAME is listening on 127.0.0.1:6001"
        exit 0
    fi
    sleep 1
done

echo "$UNIT_NAME failed to start listening on 127.0.0.1:6001" >&2
systemctl status "$UNIT_NAME" --no-pager --lines=30 >&2 || true
tail -n 30 /var/www/html/backend/storage/logs/reverb.log >&2 || true
exit 1
