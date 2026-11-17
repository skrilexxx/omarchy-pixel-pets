#!/bin/bash
# Dev tool: plays through everything the pets do in the running shell, one action at a time,
# each named above the pet and printed here. First the cat, then the dog, then what the two do
# together (whoever is out). Ctrl+C stops it and gives the pets their own lives back.
# The two window steps are skipped when there is no window on the workspace.
ipc() { omarchy-shell pixel-pets "$@" 2>/dev/null; }

if ! ipc status >/dev/null; then
  echo "The plugin isn't answering. Is it enabled, and the shell restarted since the last change?" >&2
  exit 1
fi
trap 'ipc stop; echo; echo "stopped"; exit 0' INT TERM
ipc tour
last=""
while :; do
  now=$(ipc status)
  [[ -z $now ]] && break
  if [[ $now != waiting && $now != "$last" ]]; then
    echo "$now"
    last=$now
  fi
  sleep 0.3
done
echo "done"
