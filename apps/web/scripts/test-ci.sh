#!/usr/bin/env bash
set -euo pipefail

# Unit and UI tests choose their own fixtures. Leave build configuration in
# the parent job so release validation and bundling still receive it.
while IFS= read -r variable; do
  unset "$variable"
done < <(compgen -e VITE_)
unset WORKEASY_RELEASE_TARGET

exec npm test -- "$@"
