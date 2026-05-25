#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <input.md> <output.pdf>" >&2
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
  *.pdf) ;;
  *)
    echo "Output path must end with .pdf: $output" >&2
    exit 64
    ;;
esac

mkdir -p "$(dirname "$output")"
workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT

raw_pdf="$workdir/rendered.pdf"
qpdf_pdf="$workdir/qpdf.pdf"
compressed_pdf="$workdir/compressed.pdf"

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
  --output="$raw_pdf"

if command -v qpdf >/dev/null 2>&1; then
  qpdf --linearize --object-streams=generate "$raw_pdf" "$qpdf_pdf" && raw_pdf="$qpdf_pdf"
fi

if command -v gs >/dev/null 2>&1; then
  gs -q -dNOPAUSE -dBATCH -dSAFER \
    -sDEVICE=pdfwrite \
    -dCompatibilityLevel=1.6 \
    -dPDFSETTINGS=/ebook \
    -dDetectDuplicateImages=true \
    -dCompressFonts=true \
    -sOutputFile="$compressed_pdf" \
    "$raw_pdf" && raw_pdf="$compressed_pdf"
fi

cp "$raw_pdf" "$output"
printf '%s\n' "$output"
