#!/bin/sh
# Source from the disposable session harness. Never recursively delete a live
# document-portal FUSE mount or touch another user's runtime directory.
cleanup_deb_runtime() {
  case "$1" in /tmp/atom-deb-runtime-*) ;; *) echo 'Unexpected qualification runtime directory' >&2; return 1 ;; esac
  if mountpoint -q "$1/doc"; then
    fusermount3 -u "$1/doc" || return 1
    if mountpoint -q "$1/doc"; then echo 'Document portal is still mounted' >&2; return 1; fi
  fi
  rm -rf -- "$1"
}
