#!/bin/sh
# Prepares the private beacon folder and this session's beacon file, then prints the folder path.
# $1 is the session id, already checked against ^[A-Za-z0-9-]{1,64}$ by hooks/register.tsx.
umask 077
d="${CLAUDE_CONFIG_DIR:-${HOME:?}/.claude}/robot-workers/sessions"
case "$d" in /*) ;; *) exit 1 ;; esac
f="$d/$1.json"
mkdir -p "$d" && [ ! -L "$d" ] && [ -O "$d" ] && chmod 700 "$d" && [ ! -L "$f" ] &&
  { [ -e "$f" ] || : > "$f"; } && chmod 600 "$f" &&
  { find "$d" -maxdepth 1 -type f -name "*.json" -mmin +1440 -delete; printf %s "$d"; }
