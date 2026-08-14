#!/bin/bash
# Import the historical CSV into the running portfolio app
# Usage: ./scripts/import_csv.sh /path/to/Histórico.csv

CSV_FILE="${1:-/scripts/Historico.csv}"

if [ ! -f "$CSV_FILE" ]; then
  echo "❌ File not found: $CSV_FILE"
  echo "Usage: $0 /path/to/Histórico.csv"
  exit 1
fi

echo "📥 Importing $CSV_FILE..."
curl -s -X POST "http://localhost:8080/api/transactions/import" \
  -F "file=@${CSV_FILE}" | python3 -m json.tool

echo ""
echo "✅ Done. Refresh the app at http://localhost:8080"
