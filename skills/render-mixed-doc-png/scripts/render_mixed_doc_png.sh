#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <input.md> <output.png>" >&2
}

if [ "$#" -ne 2 ]; then
  usage
  exit 64
fi

input=$1
output=$2

if [ ! -f "$input" ]; then
  echo "Input Markdown file not found: $input" >&2
  exit 66
fi

case "$output" in
  *.png) ;;
  *)
    echo "Output path must end with .png: $output" >&2
    exit 64
    ;;
esac

mkdir -p "$(dirname "$output")"
workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT

pdf="$workdir/rendered.pdf"
page_prefix="$workdir/page"

pandoc "$input" \
  --from=gfm+tex_math_dollars+tex_math_single_backslash \
  --pdf-engine=xelatex \
  --variable=mainfont:"Noto Sans CJK SC" \
  --variable=CJKmainfont:"Noto Sans CJK SC" \
  --variable=monofont:"Noto Sans Mono CJK SC" \
  --variable=geometry:margin=14mm \
  --variable=linkcolor:blue \
  --variable=urlcolor:blue \
  --highlight-style=tango \
  --standalone \
  --output="$pdf"

pdftoppm -png -r 180 "$pdf" "$page_prefix"

shopt -s nullglob
pages=("$workdir"/page-*.png)
if [ "${#pages[@]}" -eq 0 ]; then
  echo "No PNG pages were rendered from $pdf" >&2
  exit 70
fi

if [ "${#pages[@]}" -eq 1 ]; then
  cp "${pages[0]}" "$output"
elif command -v magick >/dev/null 2>&1; then
  magick "${pages[@]}" -append "$output"
else
  convert "${pages[@]}" -append "$output"
fi

printf '%s\n' "$output"
