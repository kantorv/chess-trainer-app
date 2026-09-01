#!/usr/bin/env bash
# .jst/teardown.sh — MANUAL cleanup for a worktree provisioned by
# bootstrap.sh. This is NOT part of the jira-sdlc-tools contract: no skill
# runs it, and there is no teardown hook. Run it by hand when you are done
# with a worktree and about to drop it (`git worktree remove`).
#
# This project is a stateless frontend, so there are no services to stop and
# no containers/volumes to remove — teardown only deletes what bootstrap.sh
# generated plus the local build caches. node_modules is kept unless you pass
# --deps (it is large and slow to reinstall).
#
# Usage:  bash .jst/teardown.sh [--deps]
set -euo pipefail

WORKTREE_DIR="${JST_WORKTREE_DIR:-$(git rev-parse --show-toplevel)}"
cd "$WORKTREE_DIR"

WIPE_DEPS=0
[ "${1:-}" = "--deps" ] && WIPE_DEPS=1

rm -f  "$WORKTREE_DIR/.env.local"
rm -rf "$WORKTREE_DIR/node_modules/.vite" "$WORKTREE_DIR/dist"
echo "teardown: removed .env.local, node_modules/.vite, dist"

if [ "$WIPE_DEPS" -eq 1 ]; then
  rm -rf "$WORKTREE_DIR/node_modules"
  echo "teardown: removed node_modules (--deps) — re-run .jst/bootstrap.sh before working here again"
fi

echo "teardown: done. This does not remove the git worktree itself — use 'git worktree remove' for that."
