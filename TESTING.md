# Testing

## Layers

1. **Stand-in suite — `tests/` (19 passed).** Loads
   `contracts/milestone_proof.py` itself behind a small GenLayer
   stand-in (`tests/conftest.py`), so it exercises the deployable
   file, not a copy of its logic. Covers milestone creation and
   input validation, evidence submission and state rules,
   assessment agreement (including summary wording that differs),
   verdict and category disagreement (nothing written), malformed
   output (nothing written), NEEDS_WORK resubmission, terminal
   ACCEPTED/REJECTED states, prompt-boundary sanitisation, and
   independent milestones with creation-order listing. Run:
   `.venv-repro/bin/python -m pytest tests -q`.
   A test count is a result, not a proof of correctness.
2. **Direct-mode smoke — `tests_direct/` (2 passed, real GenVM
   in-process, no network, no chain transaction).** Deploys the
   real contract in-process and runs creation plus evidence
   submission, including the creation-order index. Run:
   `.venv-repro/bin/python -m pytest tests_direct -q`.
   The two suites are run separately: the stand-in replaces the
   `genlayer` module in-process, which the real GenVM fixtures
   cannot share in one process.
3. **Studionet integration — `tests_integration/` (live
   validators, FINALIZED).** Run only with:
   `.venv-repro/bin/gltest --network studionet tests_integration -v -s`
   Each run deploys its own contract instance on Stable Studionet
   (61999) and calls it through the live validator set; no mocked
   LLM is used. The test asserts only what the design guarantees
   (assessment completes, status becomes ASSESSED, verdict and
   category are in their closed sets); the actual agreed verdict
   is recorded in `evidence/EVIDENCE.md`, not forced here. Do not
   run this directory against another network without reviewing
   it first, and never use it for Appeal.

## Linter

`.venv-repro/bin/genvm-lint check contracts/milestone_proof.py`:
lint passed (3 checks), validation passed, 7 methods
(4 view, 3 write). The linter notes a newer `py-genlayer`
runner is available; the contract keeps the documented Stable
Studionet runner.

## Preliminary check (no network, no keys)

`python3 scripts/check_contract.py` checks the GenVM dependency
header, minimal imports, storage types, public-method decorators
and return types, containment of non-determinism, and the pinned
Studionet configuration. It does not claim a linter result.

## Known limits

- A live prompt-injection pair has not been run against the
  validator set; model resistance to injected instructions in
  evidence text is unproven.
- Deployment through the Studio web UI: Studionet deployments so
  far went through gltest, not Studio UI.
- The first three Studionet deployment attempts failed before any
  verdict was stored (see `evidence/EVIDENCE.md` for the diagnosed
  causes and the fix); they are recorded, not hidden.
