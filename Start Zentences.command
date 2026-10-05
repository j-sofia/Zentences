#!/bin/zsh
cd -- "${0:A:h}"
if ! command -v node >/dev/null; then
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
fi
if ! command -v node >/dev/null; then
  echo 'Install Node.js 22 or newer from https://nodejs.org, then reopen this launcher.'
  read -k 1
  exit 1
fi
if [[ ! -d node_modules ]]; then
  npm ci || exit 1
fi
npm start
