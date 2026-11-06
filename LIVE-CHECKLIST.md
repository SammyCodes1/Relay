# Live checklist

Use tiny amounts. Agent Market settlement is mainnet. Nothing here is a testnet.

Do not paste tokens or private keys into the chat or the repository.

## Before the first paid click

1. Create the specialist and finisher with `scripts/list-agents.md`. Price each one at 0.02 USDC or another amount you can lose. Delivery SLA at least one hour.
2. Put the handles and the two `aat_` tokens in `.env`.
3. Leave `LIVE_PAY_MODE=mcp-prepare` if both agents are on your marketplace account. x402 returns `-32602` when the payer owns the agent.
4. Fund the buyer balance with a little USDC. An empty balance refuses and charges nothing. https://docs.market.near.ai/buyers/wallets-and-billing.md
5. `npm run mcp-login`. Approve as yourself. The browser or device page is the marketplace consent screen. The access token is written to `data/mcp-oauth.json` and is not printed.
6. `npm run dev` and `npm run workers`.
7. Open http://localhost:3000/api/status. `liveReady` is true only when the names in `missing` are gone. The response does not contain secret values.

## One live run

1. Home. Switch to Live. Task: `List two risks of paying an agent before reading the deliverable.` Budget: `0.10` if the floor of 0.04 still covers the finisher price. If your finisher price is higher than 40% of the budget, the hop walks away and signs nothing.
2. Start. You should see the specialist handle, the quote from `GET /v1/agents/{id}/pricing-plans`, the hop A max, and the remaining budget.
3. Press Confirm payment.
   - mcp-prepare: an approval URL appears. Open it and pay on Agent Market. Relay polls the same `client_request_id` until `job_id` is set. The prepare call itself does not charge.
   - mcp-pro: the confirm button is what calls `marketplace__create_job`. The price is held when that call returns.
   - x402: Relay sends `SendMessage` with no payment, checks the 402 `amount` is still within the confirmed max, signs that row, and retries with `X-PAYMENT`. If the amount is higher, it does not sign.
4. The specialist worker starts the assignment and the run asks you to confirm the finisher. Check the finisher handle, quote, planned max (the reserved floor), and remaining budget. Confirm the same way.
5. The finisher submits markdown. The specialist submits a pass-through. The planner runs the quality check.
6. mcp-prepare: open the job links and accept there if the work passed. Silence can accept after the window (Relay asks for 7 days). A failed check calls `marketplace__request_changes` and must not read as a successful hire.
7. mcp-pro: press Confirm acceptance only if you want the held payments released.
8. Open Receipts. Hop B's parent hash equals hop A's hash. `paymentMethod` is the live mode, not `demo`.

## If a call fails

The run page shows the HTTP status and the marketplace body, with tokens redacted. Relay does not replace that with a demo hire.

A direct-hire price cannot be negotiated. If the quote is above the hop cap, the receipt shows one counter and outcome `walked_away`. Spent amount for that hop is nothing.

## Record this

One screen recording is enough:

- Live badge visible.
- Confirm payment for hop A, then the market approval or the held job.
- Confirm payment for hop B.
- Both deliveries on the run page.
- The receipt chain with `successfulPaidHire` true only if the check passed.

Say it was built at NEAR HACKATHON when you post. Tag @NEARProtocol and #NEARHackathon. Relay does not post or submit for you.
