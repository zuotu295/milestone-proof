// Verification for the frontend's contract-call layer (Node, no browser).
//
// Uses the same genlayer-js calls the web app uses (createClient,
// readContract, writeContract, waitForTransactionReceipt), but with a
// throwaway generated account instead of a MetaMask account, so the
// write path can be exercised without a personal wallet. The account
// is generated fresh on every run and discarded afterwards.
//
// Usage:
//   CONTRACT_ADDRESS=0x... node scripts/verify-frontend-call.mjs
//
// It creates a milestone with a fresh id, reads it back, and prints
// the contract address, transaction hash, and stored record. It
// asserts only that the write finalised and the record reads back
// with status OPEN; it does not run an assessment here (that path
// is covered by the Studionet integration test with live
// validators).

import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const address = process.env.CONTRACT_ADDRESS;
if (!address) {
  console.error("Set CONTRACT_ADDRESS first.");
  process.exit(1);
}

const account = createAccount();
const client = createClient({ chain: studionet, account });
const id = "node-verify-" + Date.now().toString(36);

const hash = await client.writeContract({
  address,
  functionName: "create_milestone",
  args: [
    id,
    "Node verification milestone",
    "Deliver a one-page summary of this verification run in plain text.",
  ],
  value: BigInt(0),
});
console.log(JSON.stringify({ contract: address, tx: hash }, null, 2));
const receipt = await client.waitForTransactionReceipt({
  hash,
  status: "FINALIZED",
  interval: 3000,
  retries: 200,
});
console.log("receipt status:", receipt?.status ?? receipt?.status_name ?? "unknown");

const raw = await client.readContract({
  address,
  functionName: "get_milestone",
  args: [id],
});
const record = typeof raw === "string" ? JSON.parse(raw) : raw;
console.log(JSON.stringify(record, null, 2));
if (record.status !== "OPEN" || record.milestone_id !== id) {
  throw new Error("Record did not read back as expected.");
}
console.log("FRONTEND_CALL_VERIFIED");
