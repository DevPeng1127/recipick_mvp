# Session handoff

Before continuing remediation work, read [the code audit and repair log](docs/code-audit-and-repair-log.md).

The user requires one repair item at a time. Implement and verify the current item, update the log, and wait for explicit user confirmation before starting the next item. Ask about decisions that materially affect behavior, credentials, cost, or deployment. Documentation and regression tests for the current item belong to the same repair.

Do not interpret a completed implementation as user confirmation. Check the log's current status and the conversation before proceeding.

Before any deployment, remind the user to generate a separate production JWT signing key and configure `JWT_SECRET_KEY` on the production server. The current `backend/.env` is for local development only; do not reuse its key in production. Confirm production key preparation without requesting or displaying the key itself.
