#!/bin/sh
# Two-pass build: render once to learn page numbers, then rebuild with a real table of contents.
set -e
cd "$(dirname "$0")"
SOFFICE=$(ls /root/.claude/skills/synced/*/docx/scripts/office/soffice.py | head -1)
rm -f pages.json
node build_report.js
python3 "$SOFFICE" --headless --convert-to pdf EdgeFall_Edge_AI_Report.docx >/dev/null
python3 find_pages.py EdgeFall_Edge_AI_Report.pdf toc_keys.json pages.json
node build_report.js pages.json
python3 "$SOFFICE" --headless --convert-to pdf EdgeFall_Edge_AI_Report.docx >/dev/null
python3 find_pages.py EdgeFall_Edge_AI_Report.pdf toc_keys.json pages_check.json
cmp pages.json pages_check.json && echo "page numbers stable" && rm pages_check.json
