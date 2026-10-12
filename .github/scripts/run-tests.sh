#!/usr/bin/env bash
# Runs backend and frontend tests with coverage and stores machine-readable results.
# Usage: run-tests.sh <label> <results-dir>   (run from the repository root)
# Never fails the calling step: exit codes are recorded in <results-dir>/<label>/<package>.exit.
set -uo pipefail

label="$1"
out="$2/$label"
mkdir -p "$out"

for pkg in backend frontend; do
  rm -rf "$pkg/coverage"
  npm --prefix "$pkg" run test:coverage -- \
    --reporter=default --reporter=json --outputFile.json="$out/$pkg-tests.json" \
    >"$out/$pkg.log" 2>&1
  echo $? >"$out/$pkg.exit"
  if [ -f "$pkg/coverage/coverage-summary.json" ]; then
    cp "$pkg/coverage/coverage-summary.json" "$out/$pkg-coverage-summary.json"
  fi
  echo "[$label] $pkg exit=$(cat "$out/$pkg.exit")"
done
exit 0
