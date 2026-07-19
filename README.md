# BidCheck

BidCheck turns federal solicitation text into an evidence-grounded bid/no-bid memo. It extracts requirements, checks a versioned acquisition-readiness rulebook, calculates two deterministic decision signals, and writes an executive memo without storing the submitted document server-side.

> Decision support only. Findings are based on solicitation text and self-reported company evidence. They are not legal advice or a contracting-officer determination.

Copyright Daniel Lozovsky. All rights reserved.

## Demo flow

1. Load one of the three clearly labeled synthetic fixtures or paste 500–60,000 characters.
2. Optionally add company readiness context. Missing evidence is reported as `not_evaluated`, never as a deficiency.
3. Run BidCheck and watch extraction, rule checking, and memo generation progress in real time.
4. Review opportunity risk separately from readiness coverage, then copy or export the memo and full JSON result.

The active analysis is stored only in browser `sessionStorage`. The API sets `store: false` on every OpenAI request and never logs submitted text.

## Architecture

```text
Browser workspace
  -> POST /api/analyze (validated NDJSON stream)
     -> hashed per-IP + global Upstash limits
     -> extraction (strict Zod Structured Output, low reasoning)
     -> every-rule gap check (strict Zod Structured Output, low reasoning)
     -> server guardrails + deterministic aggregate signals
     -> memo draft (strict Zod Structured Output, medium reasoning)
     -> server-derived confidence + recommendation guardrail
  -> sessionStorage + Markdown/JSON exports
```

All model stages use the direct OpenAI JavaScript SDK and default to the explicit GPT-5.6 Sol model ID, `gpt-5.6-sol`. Solicitation text and company context are treated as untrusted evidence; prompt instructions explicitly ignore instructions embedded in either source.

The current rulebook is [`data/rulebook.json`](data/rulebook.json). Each rule includes its authority, source URL, trigger, severity, baseline/conditional classification, and verification date. It incorporates OMB M-25-21/M-25-22, separates the CUI/NIST/DFARS 252.204-7012 review from the CMMC 252.204-7021/7025 review, and uses the corrected similarly-situated-entity language for limitations on subcontracting.

## Local setup

Requirements: Node.js 20.9 or newer and an OpenAI API key with access to the configured model.

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Upstash is bypassed only in local development when its variables are absent. Production fails closed if Upstash or either HMAC secret is missing.

If local API calls fail with `UNABLE_TO_VERIFY_LEAF_SIGNATURE` on a managed Windows network, use Node 22 or newer and start with `npm run dev:system-ca`. This trusts the Windows system certificate store without disabling TLS verification.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes | Server-only Responses API credential |
| `OPENAI_EXTRACTION_MODEL` | No | Extraction model; defaults to `gpt-5.6-sol` |
| `OPENAI_GAP_MODEL` | No | Gap-check model; defaults to `gpt-5.6-sol` |
| `OPENAI_MEMO_MODEL` | No | Memo model; defaults to `gpt-5.6-sol` |
| `SAFETY_IDENTIFIER_SECRET` | Production | HMAC key for session-derived OpenAI safety identifiers |
| `RATE_LIMIT_HMAC_SECRET` | Production | Independent HMAC key for non-reversible client-IP keys |
| `UPSTASH_REDIS_REST_URL` | Production | Upstash REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Production | Upstash REST token |
| `RATE_LIMIT_PER_IP` | No | Requests per IP per 15 minutes; defaults to `5` |
| `RATE_LIMIT_GLOBAL` | No | Requests across the demo per UTC-day window; defaults to `100` |
| `ENABLE_PDF_UPLOAD` | No | Reserved and must remain `false` for this build |

Use separate high-entropy values for the two HMAC secrets. Do not expose any of these as `NEXT_PUBLIC_*` variables.

## Public-demo controls

Before making the Vercel deployment public:

- Create a dedicated OpenAI project, set its project budget/alerts, and restrict the project API key to this app.
- Provision Upstash Redis and add its REST credentials to Vercel Production and Preview as appropriate.
- Set a Vercel usage alert and review the route's `maxDuration` against the selected plan.
- Confirm the per-IP `5 / 15 minutes` and global `100 / day` defaults are appropriate for the judging window.
- Keep the three stage-specific model variables pinned to the model validated during acceptance.

The app rate limits before model execution. Client IPs are HMAC-hashed before becoming Redis keys, and expiry is managed by the limiter windows.

## Checks

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

The automated scope is intentionally small: unit coverage for the five-status integrity guardrails and aggregate-signal math, plus exactly two mocked route cases (complete stream and safe pipeline failure). Browser behavior, responsive layout, keyboard navigation, focus visibility, contrast, and failure-state presentation are manual checks; there is no browser automation or automated accessibility audit.

## Three-sample acceptance

The bundled records under `data/samples/` are synthetic development fixtures. Replace their text with the three final supplied samples while retaining the same JSON shape. With production-like OpenAI credentials:

1. Run each sample through the real API with and without relevant company context where useful.
2. Verify every rule appears once, absent evidence remains `not_evaluated`, and confidence matches readiness coverage.
3. Save the final JSON export and desktop/mobile screenshots for each sample as the offline demo fallback.
4. Record model names and the run date alongside the artifacts.

Do not claim real-API acceptance until all three runs complete successfully. PDF upload remains out of scope and absent from the UI.

## Deployment

Import the repository into Vercel, choose the `bidcheck` directory as the project root, add the environment variables above, and deploy. The App Router route runs on the Node.js runtime and streams `application/x-ndjson`; no database, account system, history service, or persistent document store is used.

MIT License

Copyright (c) 2026 Daniel Lozovsky

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

