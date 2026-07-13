# CineScope Agent Guide

## Goal

Keep CineScope reliable as a static site with generated JSON. Make the smallest change that solves the requested problem while preserving data integrity, reproducible Pages builds, and the existing vanilla JavaScript architecture.

## Success criteria

- The requested behavior or data defect is fixed in its source of truth.
- Generated data remains internally consistent.
- Relevant checks pass: `npm run check`; run `npm run build:site` for changes that can affect Pages output.
- The final report states changed files, verification performed, and any unverified external effect.

## Non-negotiable constraints

- Keep the static frontend and generated-JSON architecture. Do not introduce a framework, backend, or unrelated refactor unless explicitly requested.
- Treat `scripts/automation/run_update.py` as the canonical data-update entry point. It stages output, validates it, then promotes changed files.
- Do not hand-edit generated data when the canonical task can safely regenerate it. For a narrowly scoped metadata repair, update every affected count/report field and validate it.
- Preserve unrelated working-tree changes. Do not reset, force-push, rewrite history, or overwrite remote work.
- Never expose secrets or put credentials in repository files, logs, or documentation.

## Decision rules

- Read-only inspection and local fixes within the request scope may proceed directly.
- Before changing data, inspect its generator, the relevant JSON payloads, and validation rules.
- Use the smallest relevant task: `full`, `tv-status`, `douban-cache`, or `trailers`. Prefer `--dry-run` when evaluating a data refresh.
- Treat GitHub pushes, workflow dispatches, deployments, external messages, and destructive actions as external side effects: ask before performing them unless the user explicitly requested that action.
- If remote changes block a push, fetch first, inspect the divergence, and preserve the newer canonical generated data when a local fix has become obsolete.

## Verification and stop rules

- Code or data changes: run `npm run check`.
- Pages/workflow/static-asset changes: also run `npm run build:site`.
- Automation changes: run the narrowest relevant staged dry-run before wider execution.
- Stop and request direction when completion requires credentials, an irreversible choice, a production deployment, or a scope expansion.
- Do not add repeated status updates or extra checks once the success criteria are met.

## Reference map

- Data runner: `scripts/automation/run_update.py`
- Catalog generation: `scripts/generate_douban_catalog.mjs`
- Data gate: `scripts/validate-data.mjs`
- Pages build: `scripts/build-site.mjs`
- Operating details: `README.md`, `docs/DATA_UPDATE_GUIDE.md`, and `CONTEXT.md`

Scheduled data updates invoke the reusable Pages workflow with the commit they just pushed; do not add a second `workflow_run` deployment trigger.
