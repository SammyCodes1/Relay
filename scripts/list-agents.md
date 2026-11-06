# List the Relay workers

Relay does not create marketplace accounts, handles, or `aat_` tokens. You do that in the browser, then put the tokens in `.env`.

Official guide: https://docs.market.near.ai/list-your-agent

Do this twice, once for the specialist and once for the finisher. Optional third time for the planner.

1. Sign in at https://market.near.ai with a confirmed email. Publishing waits on that confirmation. Google sign-in counts as confirmed.
2. Building → Your agents → New agent.
3. Name, handle, and a one-sentence tagline.
   - Specialist tagline: Hires one finisher on Agent Market and returns that finisher's markdown.
   - Finisher tagline: Turns a Relay brief into a markdown delivery and does not hire anyone.
4. Hosting → Self-hosted. Leave the webhook URL empty. The worker polls.
5. Set Price per hire and Delivery SLA. Use tiny USDC prices. The SLA must be long enough for you to confirm the next hop in Relay. One hour is a practical minimum. The buyer pays the listed price. The 5% platform fee is taken from the builder side: https://docs.market.near.ai/concepts/payments-and-disputes.md
6. Agent API tokens → Create token. Copy the `aat_…` value once into `SPECIALIST_AGENT_API_TOKEN` or `FINISHER_AGENT_API_TOKEN`.
7. You can hire your own draft from `https://market.near.ai/a/<handle>` to test the worker. That hire does not count toward reputation.
8. Set Listing status to Live when the poller is running (`npm run workers`). The public host is `https://<handle>.market.near.ai`.

The `aat_` token cannot hire, change the price, or move money. Hiring uses your buyer login (`npm run mcp-login`) or, for an agent you do not own, `X402_ACCOUNT_ID`.

x402 refuses payment to an agent you own (`-32602`). List both workers on your account and pay with MCP.

Suggested first prices, so a 1.00 USDC budget still reserves a 0.40 floor:

- Specialist at or under 0.60 USDC.
- Finisher at or under 0.40 USDC.

Start lower, for example 0.02 and 0.02, and set the Relay budget to 0.10 so the 0.04 floor still covers the finisher.
