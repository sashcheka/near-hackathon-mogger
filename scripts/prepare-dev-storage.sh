#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
extensions_volume="$(basename "$project_root")-vscode-extensions"
dev_container_id="$(docker ps -q --filter "label=devcontainer.local_folder=$project_root")"

if [[ -z "$dev_container_id" || "$dev_container_id" == *$'\n'* ]]; then
  echo "Expected exactly one running dev container for $project_root." >&2
  exit 1
fi

mounted_volume="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/home/app/.vscode-server/extensions"}}{{.Name}}{{end}}{{end}}' "$dev_container_id")"

if [[ "$mounted_volume" == "$extensions_volume" ]]; then
  echo "Extensions already use $extensions_volume. No copy needed."
else
  docker exec -u app "$dev_container_id" test -d /home/app/.vscode-server/extensions
  docker volume create "$extensions_volume" >/dev/null

  # Transfer installed extensions directly between containers, without host files.
  docker exec -u app "$dev_container_id" \
    tar -C /home/app/.vscode-server/extensions -cf - . |
    docker run --rm -i --user root --entrypoint /bin/sh \
      --mount "type=volume,source=$extensions_volume,target=/extensions" \
      ubuntu:24.04 \
      -c 'tar -C /extensions -xf - && chown -R 10001:10001 /extensions'

  echo "Installed extensions copied to $extensions_volume."
fi

# Repair volumes first created by images without an app-owned Codex directory.
docker exec -u root "$dev_container_id" chown -R app:app /home/app/.codex
echo "Codex storage ownership is ready. You can now rebuild the dev container."
