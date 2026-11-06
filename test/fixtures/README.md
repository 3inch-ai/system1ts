# Fixture provenance

Checked 2026-11-06. These are **documentation examples**, not live responses:

- `openai-predicate.json`: response example at https://developers.openai.com/api/reference/resources/decisions/methods/create . Transcribed once from the rendered example (the extractor duplicated code text).
- `system-one-score.json`: score 200-response example at https://docs.typesafe.ai/api/system-one.md / https://api.typesafe.ai/openapi.json . Values and names unchanged.

All inline fixtures in `*.test.ts`, the HTTP smoke server, and Workers smoke are **synthetic contract cases**: normal values, mixed typed booleans, refusals, missing fields, invalid values and transport failures constructed to detect SDK bugs. They do not measure model quality. No fixture comes from authenticated/live model inference; no credentials or personal data were collected. Keep this distinction when adding fixtures. Sanitize live fixtures before committing and document endpoint/model/version, date, and changes.
