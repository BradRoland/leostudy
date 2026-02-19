#!/bin/bash
while true; do
  if ! lsof -i :5173 > /dev/null 2>&1; then
    echo "Server down, restarting..."
    cd "/Users/jank/Documents/New project/leo-study-web"
    npm run dev > /dev/null 2>&1 &
  fi
  sleep 30
done
