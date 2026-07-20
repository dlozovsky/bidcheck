# BidCheck

BidCheck turns federal solicitation text into an evidence-grounded bid/no-bid memo. It extracts requirements, checks a versioned acquisition-readiness rulebook, calculates two deterministic decision signals, and writes an executive memo without storing the submitted document server-side.

> Decision support only. Findings are based on solicitation text and self-reported company evidence. They are not legal advice or a contracting-officer determination.

**Built solo for OpenAI Build Week · Work & Productivity**

- **Live application:** `[ADD VERCEL URL BEFORE SUBMISSION]`
- **Demo video:** `[ADD PUBLIC YOUTUBE URL BEFORE SUBMISSION]`
- **Primary Codex `/feedback` session:** `[ADD SESSION ID BEFORE SUBMISSION]`

## Evaluate BidCheck in 60 seconds

1. Open the live application—no account is required.
2. Load a bundled sample solicitation.
3. Run it without a company profile and observe that applicable readiness rules remain `not_evaluated` rather than becoming unsupported gaps.
4. Add the bundled sample company profile and run it again.
5. Watch the unresolved findings become evidence-backed readiness results, then review the resulting recommendation and memo.

This before-and-after comparison is the core product behavior: BidCheck makes readiness claims only when the user supplies relevant company evidence.

## Demo flow

1. Load one of the three clearly labeled synthetic fixtures or paste 500–60,000 characters.
2. Optionally add company readiness context. Missing evidence is reported as `not_evaluated`, never as a deficiency.
3. Run BidCheck and watch extraction, rule checking, and memo generation progress in real time.
4. Review opportunity risk separately from readiness coverage, then copy or export the memo and full JSON result.

The active analysis is stored only in browser `sessionStorage`. The API sets `store: false` on every OpenAI request, and the application does not intentionally write submitted text to its logs or a database. Requests remain subject to the applicable infrastructure-provider terms and retention settings.

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
| `UPSTASH_REDIS_REST_URL` or `KV_REST_API_URL` | Production | Upstash REST endpoint; Vercel Marketplace injects the `KV_*` name |
| `UPSTASH_REDIS_REST_TOKEN` or `KV_REST_API_TOKEN` | Production | Writable Upstash REST token; Vercel Marketplace injects the `KV_*` name |
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

## Acceptance criteria

The bundled records under `data/samples/` are synthetic development fixtures. Before submission, three final samples will be exercised using production-like credentials and the same `gpt-5.6-sol` configuration used by the public demo.

1. Run each sample through the real API with and without relevant company context where useful.
2. Verify every rule appears once, absent evidence remains `not_evaluated`, and confidence matches readiness coverage.
3. Save the final JSON export and desktop/mobile screenshots for each sample as the offline demo fallback.
4. Record model names and the run date alongside the artifacts.

Real-API acceptance results will be documented here only after all three samples complete successfully. PDF upload remains out of scope and absent from the UI.

## Deployment

Import the repository into Vercel, choose the `bidcheck` directory as the project root, add the environment variables above, and deploy. The App Router route runs on the Node.js runtime and streams `application/x-ndjson`; no database, account system, history service, or persistent document store is used.

## How Codex and GPT-5.6 were used

BidCheck was built solo during OpenAI Build Week. I used Codex with GPT-5.6 Sol at high reasoning effort as an engineering collaborator throughout the core build—not simply to generate an initial scaffold.

### Codex with GPT-5.6 Sol

Codex helped me:

- Convert the initial prompt pack and rulebook into a working Next.js application with a three-stage analysis pipeline.
- Design the Zod schemas and strict Structured Outputs used for solicitation extraction and compliance findings.
- Implement the streaming `/api/analyze` route, staged progress events, error handling, and server-side result enrichment.
- Build the interface for reviewing extracted requirements, rule findings, supporting evidence, aggregate signals, and the final bid/no-bid memo.
- Test malformed model responses, missing company information, prompt-injection attempts inside solicitation text, provider failures, and incomplete analyses.
- Identify weaknesses in the original design, including the inability to evaluate company readiness without company context and the risk of treating missing evidence as a compliance failure.
- Review the rulebook structure and surface citations or policy references that required current-source verification.

I made the final product and domain decisions. These included:

- Introducing five distinct finding statuses, with `not_evaluated` separated from `needs_review`.
- Establishing the rule that absence of evidence is never automatically classified as a gap.
- Preventing an unconditional `BID` recommendation when no company profile is supplied.
- Deriving risk, readiness coverage, and confidence deterministically on the server instead of asking the model to invent numeric scores.
- Separating contractor-readiness rules from solicitation-side advisory findings.
- Keeping the first release focused on decision support instead of expanding into proposal generation, SAM.gov integration, authentication, or persistent document storage.

The majority of the core functionality was developed in one primary Codex session.

**Primary `/feedback` session ID:** `[ADD SESSION ID BEFORE SUBMISSION]`

### Runtime model strategy

During the Build Week submission and judging window, all three runtime stages use `gpt-5.6-sol` through the OpenAI Responses API—the same model tier used with Codex during development. I chose one explicitly pinned model for the evaluated build so the extraction, gap-check, and memo behavior could be accepted and demonstrated against a consistent configuration.

GPT-5.6 Sol performs three bounded tasks:

1. Extract structured requirements and verbatim evidence from the solicitation.
2. Evaluate triggered rulebook checks against the extraction and self-reported company context.
3. Produce an evidence-linked executive recommendation.

Structured outputs are validated with Zod, while aggregate risk, readiness coverage, and confidence are calculated in application code. This keeps the model focused on language and evidence analysis while deterministic business rules remain under application control.

After judging, lower-cost models can be benchmarked against the same acceptance set before any production routing change. That optimization is deliberately outside the evaluated hackathon build; no smaller model is claimed as validated here.

## Pre-submission checklist

- [ ] Replace the live-application placeholder with the final Vercel URL.
- [ ] Replace the demo-video placeholder with the public or unlisted YouTube URL and verify it in a private browser window.
- [ ] Add the primary Codex `/feedback` session ID here and to the Devpost form.
- [ ] Replace the development fixtures with three final synthetic samples.
- [ ] Run all three samples through the real API using `gpt-5.6-sol` and record the run date.
- [ ] Save fallback JSON results and desktop/mobile screenshots.
- [ ] Rewrite the acceptance section in past tense with the actual results.
- [ ] Confirm the public repository contains the root-level `LICENSE` file.

## License

MIT License © 2026 Daniel Lozovsky — see [LICENSE](LICENSE).
