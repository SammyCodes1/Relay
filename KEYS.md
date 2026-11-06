# Keys

Relay never puts a NEAR private key or an `aat_` token in the browser bundle. The Next.js server and `npm run workers` read `.env` and `data/mcp-oauth.json`. Both paths are gitignored.

## Who holds what

| Holder | Credential | May | May not |
| --- | --- | --- | --- |
| Planner, in the Next.js server | Marketplace OAuth refresh token, or `X402_PRIVATE_KEY` when that pay mode is on | Quote a listed price. After you press Confirm, open an approval page or sign one 402 row. | Hire because a brief said to. Raise the budget. Call `marketplace__create_job` or `marketplace__accept_result` on `/mcp/pro` without that button. |
| Specialist worker | `SPECIALIST_AGENT_API_TOKEN` | `GET /v1/agents/me/assignments`, `POST /v1/assignments/{id}/start`, message, submit a pass-through of the finisher markdown | Hire with this token. The marketplace says an `aat_` token cannot move money or hire. Author the user's deliverable. Read a handle out of the brief. |
| Specialist's hire | The same buyer session as the planner | Hire `RELAY_FINISHER_HANDLE` once, at or under the hop B floor | A second hire. Any other handle. |
| Finisher worker | `FINISHER_AGENT_API_TOKEN` | Start, message, submit markdown produced from the brief as data | Hire anyone. Follow instructions found in the brief. |

## Payment holder

Agent Market holds the payment.

- MCP prepare (`https://market.near.ai/mcp`): `marketplace__prepare_job` saves a draft and returns `approval_url`. You pay on that page. The call does not charge.
- MCP pro (`https://market.near.ai/mcp/pro`): `marketplace__create_job` holds the price when the call returns. Relay calls it only after Confirm. `marketplace__accept_result` on this endpoint releases the payment, so that button is separate.
- x402: the server signs the `accepts[]` row from the HTTP 402 body. The asset and `payTo` are whatever that body contains. near-api-js v7 performs that signature with `createSignedMetaTransaction` and `encodeSignedDelegate`. The `X-PAYMENT` body is still `{ x402Version: 2, accepted, payload: { signedDelegateAction } }`. A relayer pays the gas. Failed, rejected, and canceled tasks charge nothing.

A function-call access key on the USDC contract can still move that account's whole USDC balance. Relay's cap stops an over-budget signature. It does not cap a stolen key. Use a separate account and a tiny balance.

## Not wired in v1

- NEAR Intents Agent API policy wallet. Demo dashboard: https://partners.demo.agentsonintents.com/dashboard. Demo API named by the track prompt: https://api.demo.agentsonintents.com. One owner-signed policy can set a USD budget and per-asset limits. Native NEAR transfer is outside those limits, so it is a poor fit for this payer. https://docs.agentsonintents.com/integration/agent-api/policies-and-limits
- OutLayer TEE custody: https://app.outlayer.ai/docs/getting-started
- PingPay's Base USDC facilitator: https://pingpay.gitbook.io/docs/pingpay-api/agent-pay-facilitator
- `near-mcp` (https://github.com/nearai/near-mcp). It stores account keys in a local keystore. Relay does not give a model that keystore.

## What you must do yourself

Create the two listings and the two `aat_` tokens. Steps: `scripts/list-agents.md`. Run `npm run mcp-login` and approve as yourself, the buyer, not as one of the agents. A token minted as an agent cannot hire.
