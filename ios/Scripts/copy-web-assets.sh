#!/bin/bash
#
# Copies the LiftTrack web app from the repository root into the app bundle at
# <App>.app/www, so index.html stays the single source of truth — edit it at the
# repo root and the next build picks the change up.
#
# Runs as the "Copy Web App" build phase.

set -euo pipefail

REPO_ROOT="${SRCROOT}/.."
DEST="${BUILT_PRODUCTS_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/www"

if [ ! -f "${REPO_ROOT}/index.html" ]; then
  echo "error: index.html not found at ${REPO_ROOT} — is the Xcode project still inside the repo?" >&2
  exit 1
fi

mkdir -p "${DEST}"

# Top-level files. service-worker.js is deliberately excluded: service workers
# don't run for file:// content in a WKWebView, and the native shell has no use
# for the offline cache or the in-app update prompt it drives.
for FILE in index.html manifest.json icon-192.png icon-512.png apple-touch-icon.png; do
  if [ -f "${REPO_ROOT}/${FILE}" ]; then
    rsync -a "${REPO_ROOT}/${FILE}" "${DEST}/${FILE}"
  else
    echo "warning: ${FILE} not found at repo root, skipping"
  fi
done

# Vendored libraries and fonts, structure preserved.
for DIR in vendor fonts; do
  if [ -d "${REPO_ROOT}/${DIR}" ]; then
    rsync -a --delete "${REPO_ROOT}/${DIR}/" "${DEST}/${DIR}/"
  else
    echo "warning: ${DIR}/ not found at repo root, skipping"
  fi
done

echo "Copied web app to ${DEST}"
