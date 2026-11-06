import { Account, JsonRpcProvider, actions, encodeSignedDelegate, type KeyPairString } from "near-api-js"
import type { AcceptRow } from "./a2a"
import { buildXPaymentHeader } from "./a2a"

/** NEP-366 delegate, same header shape as the Agent Market x402 guide. near-api-js v7 names the signer createSignedMetaTransaction. */
export async function signNearDelegate(row: AcceptRow, accountId: string, privateKey: string): Promise<string> {
  const networkId = row.network.split(":")[1]
  if (!networkId) throw new Error("402 network is missing a NEAR network id")
  const provider = new JsonRpcProvider({ url: `https://rpc.${networkId}.fastnear.com` })
  const account = new Account(accountId, provider, privateKey as KeyPairString)
  const signed = await account.createSignedMetaTransaction({
    receiverId: row.asset,
    blockHeightTtl: row.maxTimeoutSeconds,
    actions: [
      actions.functionCall(
        "ft_transfer",
        { receiver_id: row.payTo, amount: row.amount },
        30000000000000n,
        1n,
      ),
    ],
  })
  return Buffer.from(encodeSignedDelegate(signed.signedDelegate)).toString("base64")
}

export async function xPaymentForRow(row: AcceptRow, accountId: string, privateKey: string): Promise<string> {
  const signed = await signNearDelegate(row, accountId, privateKey)
  return buildXPaymentHeader(row, signed)
}
