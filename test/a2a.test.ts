import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import {
  artifactText,
  assertWithinConfirmed,
  buildXPaymentHeader,
  classifyState,
  getTask,
  parse402,
  payA2A,
  quoteA2A,
  readTask,
  type AcceptRow,
} from "../src/server/market/a2a";

const challenge = JSON.parse(readFileSync(new URL("./fixtures/a2a-402.json", import.meta.url), "utf8"));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("A2A fixtures", () => {
  it("keeps the 402 row intact inside X-PAYMENT", () => {
    const [row] = parse402(challenge);
    const header = buildXPaymentHeader(row, "signed-delegate");
    const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as {
      x402Version: number;
      accepted: AcceptRow;
      payload: { signedDelegateAction: string };
    };
    expect(decoded.x402Version).toBe(2);
    expect(decoded.accepted).toEqual(row);
    expect(decoded.accepted.asset).toBe("asset-from-the-402-body");
    expect(decoded.accepted.amount).toBe("2500000");
    expect(decoded.payload.signedDelegateAction).toBe("signed-delegate");
  });

  it("refuses to treat an over-max 402 amount as payable", () => {
    const [row] = parse402(challenge);
    expect(() => assertWithinConfirmed(row, 1000n)).toThrow(/Not signed/);
    expect(assertWithinConfirmed(row, 2500000n)).toBe(2500000n);
  });

  it("pays with the signed header and then polls GetTask", async () => {
    const calls: Array<{ payment: string | null; body: { method: string } }> = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      const headers = new Headers(init?.headers);
      const body = JSON.parse(String(init?.body)) as { method: string };
      calls.push({ payment: headers.get("X-PAYMENT"), body });
      if (!headers.get("X-PAYMENT") && body.method === "SendMessage") return jsonResponse(challenge, 402);
      if (body.method === "SendMessage") {
        return jsonResponse({
          jsonrpc: "2.0",
          id: 1,
          result: { task: { id: "task-1", status: { state: "TASK_STATE_WORKING" }, artifacts: [] } },
        });
      }
      return jsonResponse({
        jsonrpc: "2.0",
        id: 2,
        result: {
          id: "task-1",
          status: { state: "TASK_STATE_COMPLETED" },
          artifacts: [{ parts: [{ text: "done" }] }],
        },
      });
    };
    const rows = await quoteA2A({
      marketBase: "https://market.near.ai",
      handle: "relay-finisher",
      text: "Relay hop B\n\nbrief",
      messageId: "11111111-1111-4111-8111-111111111111",
      fetchImpl,
    });
    expect(rows[0]?.amount).toBe("2500000");
    const task = await payA2A({
      marketBase: "https://market.near.ai",
      handle: "relay-finisher",
      text: "Relay hop B\n\nbrief",
      messageId: "11111111-1111-4111-8111-111111111111",
      paymentHeader: "header-value",
      fetchImpl,
    });
    expect(task.status.state).toBe("TASK_STATE_WORKING");
    expect(calls[1]?.payment).toBe("header-value");
    const done = await getTask({
      marketBase: "https://market.near.ai",
      handle: "relay-finisher",
      taskId: "task-1",
      fetchImpl,
    });
    expect(classifyState(done.status.state)).toBe("done");
    expect(artifactText(done)).toBe("done");
    expect(calls[2]?.body.method).toBe("GetTask");
    expect(calls[2]?.payment).toBeNull();
  });

  it("reads a SendMessage task and a bare GetTask task", () => {
    const wrapped = readTask({ result: { task: { id: "t", status: { state: "TASK_STATE_FAILED" } } } });
    expect(classifyState(wrapped.status.state)).toBe("free");
    const bare = readTask({ result: { id: "t", status: { state: "TASK_STATE_SUBMITTED" } } });
    expect(classifyState(bare.status.state)).toBe("working");
  });
});
