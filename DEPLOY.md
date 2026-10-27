# Deployment

## Target

Stable Studionet only:

- Studio: `https://studio.genlayer.com`
- RPC: `https://studio.genlayer.com/api`
- Chain ID: `61999`
- Currency: `GEN`
- Explorer: `https://explorer-studio.genlayer.com`

Verify the chain ID in the Studio account selector before deploying.
Do not reuse the stable `studionet` preset for Studio-dev
(chain ID `61997`); that is a different network.

Deployments recorded in `evidence/EVIDENCE.md` used gltest with
auto-generated Studionet test accounts. No personal wallet, private
key, mnemonic, or credential is used or stored anywhere in this
repository, and no Appeal was invoked in any recorded run.
Deployment through the Studio web UI has not been performed.

## Pre-deployment checklist

1. **Lint the contract.** Run the official linter on the current
   file. A linter result belongs to the exact file it was run on;
   re-run it after any contract change.
   ```bash
   genvm-lint check contracts/milestone_proof.py
   ```
   Recorded result for the current contract: lint passed with
   3 checks, validation passed, 7 methods (4 view, 3 write).
   The linter notes a newer `py-genlayer` runner is available;
   the pinned runner in the contract header is the one used in
   the official documentation examples for Stable Studionet, and
   the deployer should confirm it is still the correct runner
   for the Studio version in use at deployment time. The local
   script `scripts/check_contract.py` is only a preliminary
   AST check and does not replace this step.
2. **Direct-mode tests.** With the reproducible environment
   (`requirements.lock.txt`: genlayer-test 0.29.2, genlayer-py
   0.16.3, genvm-linter 0.11.0, pytest 9.1.1, Python 3.12.3),
   run `tests_direct/test_direct_smoke.py` with real GenVM
   in-process: 2 passed, covering deploy, empty views, creation,
   evidence submission, and the creation-order index.
3. **Integration test on Studionet.**
   ```bash
   .venv-repro/bin/gltest --network studionet tests_integration -v -s
   ```
   The test deploys a contract instance and calls it through the
   live validator set; no mocked LLM is used. A transaction
   counts as successful only when its receipt reached FINALIZED,
   `tx_execution_succeeded` passed, and the stored record read
   back from the chain matched expectations; a FINALIZED receipt
   alone is not treated as proof of execution success.
4. **Runtime compatibility note.** The Studionet validator
   runtime differs from the local direct-mode GenVM in at least
   two respects found during this project: contract storage must
   be declared with class-level annotations (assignments inside
   `__init__` alone leave the deployed instance without storage
   attributes), and sized-integer arithmetic must use the
   explicit `u32(int(x) + 1)` form. Do not reintroduce
   `DynArray` storage or bare `+= 1` on `u32` fields without
   re-verifying on Studionet first.
5. **Fee check.** If the deployment charges fees, generate a fee
   profile from representative branches and use the SDK estimate
   (distribution + fee value) unchanged; do not hand-build fee
   arithmetic. Studio deployments may be gasless — detect that
   from the estimate result, not from the network name.
6. **Finalisation and appeal window.** Wait for finalisation
   before presenting a case as settled, and note that an appeal
   can still overturn a decision inside its window.

## Deploying through Studio

1. Open `https://studio.genlayer.com`, confirm chain ID `61999`.
2. Create a new contract, paste the full contents of
   `contracts/milestone_proof.py` (including the first-line
   dependency comment), and deploy with no constructor arguments.
3. Call `create_milestone`, then `submit_evidence`, then
   `assess_milestone` with the demo values from
   `examples/call_examples.py`. Record the contract address,
   transaction hashes, and the agreed verdict as the live result;
   do not edit a live result to match a local expectation.
4. Call `get_milestone` and confirm the stored record matches
   the returned record.
5. Record the contract address and deployment transaction in a
   deployment note (a new file, not by editing the contract).

## Frontend deployment (GitHub Pages)

```bash
cd frontend
npm install
VITE_CONTRACT_ADDRESS=0xYourDeployedContract npm run build
```

The `dist/` output is published to the `gh-pages` branch, and
GitHub Pages serves it at
`https://zuotu295.github.io/milestone-proof/`. The app also
accepts any contract address typed into its contract field, so it
keeps working with future deployments without a rebuild.

## What is intentionally out of scope

- No token, payment, or escrow logic. This is an acceptance
  verdict primitive, not a marketplace or a payment flow.
- No private key, seed phrase, or API key is stored, requested, or
  needed anywhere in this repository.
