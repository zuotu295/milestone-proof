# MilestoneProof — freelance milestone acceptance on GenLayer

A client publishes acceptance criteria for a piece of freelance
work. A worker submits evidence that the work is done. Independent
GenLayer validators judge the evidence against the criteria and
must agree exactly on the verdict and reason category. The verdict
becomes shared on-chain state that both sides can rely on instead
of arguing over chat messages.

## What it is

One deployed instance serves many milestones. Each milestone is
namespaced by `milestone_id`, and ownership is per milestone (the
address that created it). The creator must designate a nonzero worker
wallet address at creation. This assignment is immutable.

- `status`: `OPEN`, `EVIDENCE_SUBMITTED`, or `ASSESSED`
- `verdict`: `ACCEPTED`, `NEEDS_WORK`, or `REJECTED` (once assessed)
- `category`: one of `complete`, `partial`, `missing_deliverable`,
  `off_brief`, `insufficient_detail`, `unclear`
- `summary`: the validators' short reasoning (context only; it
  never drives a transition)
- `owner`, `worker`, `submitter`, `evidence`, `evidence_count`,
  `assessment_count`

A `NEEDS_WORK` verdict lets the worker submit fixed evidence and
be re-assessed. `ACCEPTED` and `REJECTED` are terminal: new work
means a new milestone, not a rewritten history.

## Why this needs GenLayer

Whether evidence satisfies written criteria is a judgement call,
not a computation. A single backend LLM call is one opinion, and
it is not shared state. MilestoneProof puts the judgement through
validator consensus, but bounds it tightly:

1. **Deterministic code owns everything decidable exactly.**
   Input bounds, milestone identity, lifecycle transitions, and
   storage. No LLM output can create a milestone, change an owner,
   or move a record to a forbidden state.
2. **One decision for the LLM.** The verdict and a reason category
   from closed lists. The summary is stored context only.
3. **Exact decision-field equivalence.** A validator re-runs the
   assessment and must agree exactly on verdict and category.
   Summary wording is deliberately not compared, because models
   phrase the same judgement differently. A different verdict or
   category is a disagreement; malformed output is rejected, never
   agreed on.
4. **State only after consensus.** Storage writes happen in
   deterministic code after consensus returns.

See `MECHANISM.md` for the full mechanism.

## Contract API

| Method | Kind | Arguments | Returns |
|---|---|---|---|
| `create_milestone` | write | `milestone_id, title, criteria, worker` (all `str`) | record (`str`) |
| `submit_evidence` | write | `milestone_id, evidence` | updated record (`str`) |
| `assess_milestone` | write | `milestone_id` | assessed record (`str`) |
| `get_milestone` | view | `milestone_id` | record (`str`), or `""` |
| `get_status` | view | `milestone_id` | status (`str`), or `NOT_FOUND` |
| `get_milestone_count` | view | — | `u32` |
| `get_milestone_id` | view | `index` (`u32`) | id (`str`), or `""` |

Errors are `gl.vm.UserError` values such as `MILESTONE_EXISTS`,
`NOT_FOUND`, `INVALID_STATUS`, `INVALID_INPUT`, `INVALID_WORKER`, and `UNAUTHORIZED`.

## Access control

| Action | Authorized caller |
|---|---|
| Create a milestone | Any account; caller becomes owner and supplies the worker address |
| Initial evidence | Designated worker only |
| Revise after NEEDS_WORK | Same designated worker only |
| Run any assessment, including a terminal verdict | Milestone owner only |
| Read milestones | Anyone |

Addresses are validated and compared in lowercase. A zero or malformed worker
address is rejected before storage writes. Role checks happen before model
execution or state mutation. The owner cannot submit evidence unless also
explicitly designated as the worker. A worker cannot trigger an assessment
unless also the owner. Neither role can be reassigned.

This is an API change: `create_milestone` now takes four arguments. Existing
on-chain deployments keep their original code and permissions. Deploy the
updated source to a new address and use that address in the app and submission.
Historical deployments in `evidence/EVIDENCE.md` do not demonstrate these guards.

Updated contract on Stable Studionet (61999):
`0x845AFBA77dC61cDe4049486Df09b7f06D9B6BFd0`.
The deployed source matches this repository; see `evidence/deployed-source.json`.

## Web app

`frontend/` is a small single-page app (Vite + genlayer-js) that
calls the deployed contract for real:

- Connect a wallet (MetaMask) and switch to Stable Studionet.
- List milestones from the chain, newest first.
- Create a milestone, submit evidence, and run a validator
  assessment, waiting for each transaction to reach FINALIZED and
  showing its hash.

Build and preview:

```bash
cd frontend
npm install
VITE_CONTRACT_ADDRESS=0xYourDeployedContract npm run build
npm run preview
```

The current deployment status and source hash are in
`evidence/EVIDENCE.md`. The app works with any deployed instance:
paste another contract address into the contract field.

## Sustained use

MilestoneProof is a verdict primitive, not a demo that ends at
submission:

- **Who uses it.** A freelance client and worker who want a
  neutral acceptance record, or a small work marketplace that
  wants acceptance disputes settled without running its own
  arbitration desk.
- **Why it keeps working.** The web app is static (no backend
  server to maintain) and all state lives on-chain: any
  marketplace frontend can point at a deployed instance by
  pasting its contract address into the app's contract field,
  and every new milestone is just another on-chain record.
  Verdicts accumulate as a permanent, auditable history per
  instance.
- **Future work.** Deployment
  through the Studio web UI, a public registry of deployed
  instances, and a separate payment/escrow module that consumes
  the verdict — each is an addition to this primitive, not a
  condition for using it now.

On the "real or authoritative data" question: the authoritative
inputs for a milestone dispute are the criteria and the evidence
themselves — the parties' own documents. The contract
deliberately does not fetch external web data, because the
decision is about those documents, not about an outside fact.
Evidence links inside the text are treated as claims in the
text, not as fetched sources; see the limits in
`MECHANISM.md`.

## Local tests

```bash
python3 -m venv .venv-repro
.venv-repro/bin/pip install pytest genvm-linter genlayer-test
.venv-repro/bin/python -m pytest tests -q
# 38 passed
.venv-repro/bin/python -m pytest tests_direct -q
# 4 passed (real GenLayer SDK, in-process, no network, no chain transaction)
.venv-repro/bin/genvm-lint check contracts/milestone_proof.py
# Lint passed (3 checks), Validation passed, 7 methods
```

The stand-in suite (`tests/`) and the direct-mode suite
(`tests_direct/`) are run separately: the stand-in replaces the
`genlayer` module in-process, which the real GenLayer SDK fixtures cannot
share. The full pinned list is in `requirements.lock.txt`.

Studionet integration (`tests_integration/`, live validators,
FINALIZED) is documented in `evidence/EVIDENCE.md` and
`TESTING.md`.

## Target network

Stable Studionet only, as pinned in `network.json`:

- RPC: `https://studio.genlayer.com/api`
- Chain ID: `61999`
- Currency: `GEN`
- Explorer: `https://explorer-studio.genlayer.com`
- Studio: `https://studio.genlayer.com`

## Supported scope and known limits

Supported:

- Milestone creation, evidence submission, and validator
  assessment with the lifecycle above.
- Criteria of 10–2000 characters and evidence of 20–4000
  characters; longer submissions must be split or summarised.
- Listing milestones in creation order via `get_milestone_id`.

Limits:

- The verdict judges the submitted evidence against the submitted
  criteria only. It does not verify links, run code, or prove a
  real-world deliverable exists outside the evidence text.
- The contract moves no funds and holds no escrow. It records an
  acceptance verdict that a marketplace, client, or payment flow
  can rely on; payment itself is outside this contract.
- No live prompt-injection pair has been run against the
  validator set; the deterministic guarantees do not depend on
  model behaviour, but model resistance to injected instructions
  in evidence text is unproven.
- Deployments to date used gltest; deployment through the Studio
  web UI has not been performed.

## Files

```
contracts/milestone_proof.py   # single-file GenLayer contract (deployable)
tests/conftest.py              # GenLayer stand-in + contract loader
tests/test_milestone_proof.py  # source-level lifecycle and authorization tests
tests_direct/test_direct_smoke.py  # direct-mode lifecycle and authorization tests, real SDK
tests_integration/test_studionet.py  # Studionet full-flow test
frontend/                      # Vite + genlayer-js web app
examples/call_examples.py      # demo create/submit/assess arguments
scripts/check_contract.py      # offline static + config check
network.json                   # pinned Stable Studionet configuration
gltest.config.yaml             # gltest config, valid keys, no keys
requirements.lock.txt          # reproducible environment lock file
MECHANISM.md                   # full mechanism and reuse notes
DEPLOY.md                      # deployment guide
TESTING.md                     # test layers, commands, and results
evidence/EVIDENCE.md           # Studionet deployment and call evidence
LICENSE                        # MIT license
```

## License

MIT; see `LICENSE`.
