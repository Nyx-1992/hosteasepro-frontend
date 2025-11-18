name: ICS Import

# Manual-only trigger retained; scheduled cron removed to freeze logic.
on:
  workflow_dispatch: {}

# Prevent overlapping runs if manually triggered multiple times.
concurrency:
  group: ics-import
  cancel-in-progress: true

jobs:
  import:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Run ICS Import
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          DEBUG: "1"
        run: |
          if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
            echo "Skipped: missing Supabase secrets."; exit 0;
          fi
          echo "Starting ICS import at $(date -u)";
          node scripts/ics-import.js || { echo "ICS import failed"; exit 1; }
          echo "Completed ICS import at $(date -u)";
