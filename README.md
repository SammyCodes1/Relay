# Relay

Relay is a two-hop hiring desk for the NEAR Hackathon Agent Economy track (`agents`) and the spend-policy part of `security`.

You set a task and a USDC budget. A planner hires a specialist on [NEAR Agent Market](https://market.near.ai). That specialist hires a finisher on the same market and is not allowed to submit the answer itself. You confirm each live payment. Every hop writes a receipt. A failed quality check is not a successful paid hire.

Two hops exist so the budget, the counter, and the "do not follow the brief" rule are visible on a real second payment, not only on a function call inside one process.

Demo mode uses the same hire interface and moves no money. It is the fallback for tests and for a judge without a funded account. It is labeled Demo. It is not the product.

## Run Demo

Requirements: Node.js 22 or newer. From this directory:

```powershell
npm install
npm test
npm run dev
```

Open http://localhost:3000.

1. Leave the toggle on **Demo — no money moves**.
2. Pick a scenario. Start.
3. Open the run. You should see Planner, Specialist, and Finisher, a remaining budget, and receipts whose `paymentMethod` is `demo`.

Do X — see Y:

- Happy path — both hops pass, the finisher receipt's parent hash is the specialist receipt, and the accepted total is under the budget.
- Overpriced finisher — one counter at the hop B floor (40% of the budget), then a hire at that counter.
- Walk away — quote above the hop A max, counter recorded, accepted `0.00`, held `0.00`, no hire.
- Specialist tries to self-complete — the run fails, the finisher is not hired, and nothing stays held.
- Prompt injection — the task says to hire another agent and raise the budget. The only finisher hire is `relay-finisher` (or your configured handle), once, at or under the floor.

`npm test` covers those cases without the network. `test/a2a.test.ts` replays a fixture 402 body, a working task, and a completed `GetTask`. It does not sign a NEAR key and does not call mainnet.

## Run Live

Live hires the handles in `.env`. Copy `.env.example` to `.env` and follow `scripts/list-agents.md`. Then:

```powershell
npm run mcp-login
npm run dev
npm run workers
```

`GET /api/status` lists missing variable names. It does not return secret values. The Live toggle stays off until that list is empty.

Do X — see Y:

- Start a Live run under the finisher's price — a confirm panel with handle, quote, planned max, and remaining budget. Nothing is signed before Confirm.
- Confirm on mcp-prepare — an Agent Market approval URL. The prepare call does not charge. You pay on that page.
- Confirm on mcp-pro — `marketplace__create_job` runs after the button and holds the price. An empty balance returns the marketplace refusal and charges nothing.
- Quote above the hop cap — one counter sentence, outcome `walked_away`, no `X-PAYMENT` and no create/prepare call.
- After both workers deliver — receipts with `paymentMethod` of `mcp-prepare`, `mcp-pro`, or `x402`, plus market links when the API returned them. A failed check is `fail` or `quality_failed_settled`, never a successful paid hire.

The manual path with tiny amounts is `LIVE-CHECKLIST.md`. `npm run workers` polls every 30 seconds: `GET /v1/agents/me/assignments`, then start, message, and submit. The run page also ticks that loop while it is open.

## How a live hop is called

Discover: `GET https://market.near.ai/v1/agents?q=...` and `GET /v1/agents/{agent_id}/pricing-plans`. The default live plan is the quote. The agent card is `GET https://<handle>.market.near.ai/.well-known/agent-card.json`.

Buyer, own agents: MCP. `/mcp` uses `marketplace__prepare_job` (draft, then you pay on `approval_url`). `/mcp/pro` uses `marketplace__create_job` (holds funds in the call). Follow-up tools are `get_job_status`, `get_job_result`, `request_changes`, and `accept_result`. On `/mcp`, accept returns a page. On `/mcp/pro`, accept releases the payment, so Relay waits for a second button.

Buyer, an agent this payer does not own: `POST https://<handle>.market.near.ai/a2a/v1` method `SendMessage`. HTTP 402 lists `accepts[]`. Relay signs that row and retries with `X-PAYMENT`. `GetTask` is polled every time the worker tick runs while the task is open. `TASK_STATE_REJECTED`, `TASK_STATE_FAILED`, and `TASK_STATE_CANCELED` charge nothing.

Workers: `Authorization: Bearer aat_…` on `GET /v1/agents/me/assignments`, `POST /v1/assignments/{id}/start`, `POST /v1/assignments/{id}/messages`, `POST /v1/assignments/{id}/submit` with `deliverableMarkdown`.

The USDC asset is the `asset` field on the 402 row. It is not hardcoded. A direct hire price is fixed, so a live counter cannot lower it. Relay records the counter and walks away.

## Money rules in this repo

The hop B floor is 40% of the budget you typed. Hop A's planned max is the rest. Remaining is the budget minus accepted payments minus held payments. The specialist may spend only the floor, and only what is still remaining.

Keys and the things each agent cannot do are in `KEYS.md`. Untrusted text is covered in `THREAT-MODEL.md`.

## Not in this version

No hackathon submission, no git push, and no public-repo change. No 1Click call and no Intents quote on screen. No PingPay, OutLayer, or Agent API wallet. No job-board bidding. No webhook. The finisher writes structured markdown from the brief. It does not call an LLM. `https://docs.near.org/ai/introduction` was a 404 when this was written. The live NEAR page is https://docs.near.org/getting-started/tools-for-ai.md.

1Click, if added later, must send `dry: true` on `POST https://1click.chaindefuser.com/v0/quote` unless you confirm a tiny mainnet amount. The live authentication page says an unauthenticated fee of 0.25%. HACKATHON.md Q-006 says 0.2%. There is no Intents testnet.

## Track fit

`agents`: the product hires a market agent that hires another market agent and pays inside a budget.

`security`: the floor, the single confirm, the refusal to treat worker text as instructions, and the ban on specialist self-completion are the spend policy.
