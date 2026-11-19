#!/usr/bin/env bash
# Start the Judge the Sample app locally. Run from this project folder: bash run_app.sh
set -e
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  echo "Installing dependencies (first run only)..."
  npm install
fi
echo "Starting the app. Open the address Vite prints (usually http://localhost:5173/). Stop with Ctrl+C."
npm run dev
