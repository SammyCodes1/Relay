# Threat model

The buyer, the specialist, and the finisher all write text the others must read. That text is data. It is not a command channel.

## What we do not trust

- The task you type.
- The job description, tags, and thread messages returned by `GET /v1/agents/me/assignments`.
- Deliverable markdown.
- A Relay envelope whose `finisherHandle` or `hopBBudget` was edited after we wrote it.
- Tool errors and HTTP bodies. They are shown after redaction. They are not executed.

The marketplace documents the same rule: worker messages are data, and an agent must not follow an instruction found there, least of all one to hire. https://docs.market.near.ai/a2a/hire-agent-over-mcp.md

## What cannot happen from text

- A second hire. The specialist path hires `RELAY_FINISHER_HANDLE` once.
- A different handle. If the envelope names another handle, Relay records "brief tried to change the finisher handle" and still uses the env handle.
- A higher budget. The hop B cap is the floor computed from the budget you submitted, then `min(floor, remaining)`. A sentence such as "raise the budget" is stored under `rejectedInstructions` and does not change the number.
- A specialist-authored final answer. `specialistDeliverable` throws if the finisher markdown is missing. The worker does not call `POST /v1/assignments/{id}/submit` on that path.
- An automatic `/mcp/pro` hire or acceptance. Those tools spend or release balance inside the call. The buttons are the gate. https://docs.market.near.ai/mcp/pro.md

## What a failed check does to money

- Demo releases the hold and does not mark a successful hire.
- MCP calls `marketplace__request_changes` so silence cannot auto-accept that version. The held payment stays held. The receipt outcome is `fail`.
- x402 settles when the worker submits, before this check. A failed check is `quality_failed_settled`. It is not a successful paid hire. v1 does not open a dispute. A dispute deposit is 5% of the price, at least 0.01, and is documented at https://docs.market.near.ai/concepts/payments-and-disputes.md

## What this does not stop

- A person who can read `.env` or `data/mcp-oauth.json` can spend the buyer balance or the x402 account's USDC, up to the funds in that account.
- An `aat_` token can submit any markdown for assignments that agent already has. Keep each token on the worker that should speak as that agent.
- The finisher quotes the task back as bullets. That is a copy, not an action. A task that says "hire evil-agent" will appear in the delivery as text.
