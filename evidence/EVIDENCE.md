# Evidence

All transactions below are on Stable Studionet (chain ID 61999).
A transaction counts as successful only when its receipt reached
FINALIZED (status code 7), `tx_execution_succeeded` passed, and
the stored record was read back from the chain; a FINALIZED
receipt alone is not treated as proof of execution success.
Callers were gltest auto-generated Studionet test accounts, not
a personal wallet. No Appeal was invoked in any run.

## Canonical run (current contract)

Contract source SHA-256:
`f3008be9e65005a32e84f30a5fb17822577354773f14651ab13b6c5027eda511`
(file `contracts/milestone_proof.py`, after the fixes in
"Failed attempts" below; the file has not changed since this
run).

| Step | Transaction hash | Status |
|---|---|---|
| Deploy | `0xa4a953d725fc582f43c2c5e4566a0a26a21a6b6362e9433b1d7e0e5f28c26c96` | 7 (FINALIZED) |
| `create_milestone("studionet-demo", ...)` | `0x81c28dcd7ae4ae02e7341a848fb4580f0b72fd75b94d252a339d06408eac3426` | 7 (FINALIZED) |
| `submit_evidence("studionet-demo", ...)` | `0x74781c97f6bcd418444597270fb7e3ca7c6abc93d19d46966009f210b0672dd8` | 7 (FINALIZED) |
| `assess_milestone("studionet-demo")` | `0x4bc4787ead2a401925f223cfdb472ec7ad8d7d97d31df1f908a53fc774bc770f` | 7 (FINALIZED) |

- Contract address: `0xebe387a40ceA155205Dc27FC276a71605deaa304`
- Test: `tests_integration/test_studionet.py`, 1 passed in 164.08s.
- Stored record read back (`get_milestone("studionet-demo")`,
  `milestone_count` 1):
  - `status`: `ASSESSED`
  - `verdict`: `ACCEPTED`
  - `category`: `complete`
  - `summary`: "All three criteria are met: headline and signup
    form are live, submissions are stored in the database, and
    the mobile layout holds at 320px, 360px, and 768px with no
    overflow."
  - `owner` / `submitter`:
    `0xf8d4d383469A10EBD6D041D25BbFbC03643c392C`
  - `evidence_count`: 1, `assessment_count`: 1

The demo criteria and evidence are in
`examples/call_examples.py` and in
`tests_integration/test_studionet.py`. The verdict is whatever
the live validators agreed on; it was not forced by the test
(the test asserts only that the verdict and category are in
their closed sets).

## Corroborating run (same contract source)

An earlier run of the same test against the same contract source
also passed (168.77s):

- Contract address: `0xbE1941042BE7C8DdA567DF07308034E17e4FEdEb`
- Deploy tx: `0x789c0ed988ca76ff2115c7aa13b755c9b80e138d11254532effa030fa020b07c`
- Assess tx: `0x93bb4633c5d4f957fbccc294c58f5c8580cfa3349af650c210ac87182e8418d7`
- Stored record: `studionet-demo`, `ASSESSED`, verdict
  `ACCEPTED`, category `complete`, `assessment_count` 1,
  owner/submitter `0x0c8E8B9a8322E475A508300F1AC34B10599580f5`.
- The create and submit transaction hashes were not printed by
  that run; they are not reconstructed here. The canonical run
  above is the complete record.

## Failed attempts (recorded, not hidden)

Three earlier Studionet deployments failed before any verdict
was stored. Each deployed instance is left as it is; no
deployment was "replaced".

1. Instance `0x40D76fe6c86BFDE878eD6064Ff8Ef47f825E1416`
   (deploy tx
   `0x29036f3591b008e3538e50944de755f17404965d4c2b2b40289f09e4c7cd078d`).
   Contract used `DynArray[str]` storage with a list assignment
   in `__init__`. Every call failed on the Studionet runtime
   (view calls included). The local direct-mode GenVM accepted
   the same code, so the failure is a runtime difference, not a
   test artefact. Fix: `DynArray` storage was removed.
2. Instance `0xb0eb2096E1ED513dE5047ACB13692283c54Ebe9E`
   (deploy tx
   `0x2614f5a3871edd3acf12defd0039706f13cda8681ee2ff1b665c87dd155df055`,
   create tx
   `0x715406fb02b3ff23747b75c9b30c6d91649e349bf1195685985038fc7e86bd38`
   FINALIZED but execution failed). Contract stored storage
   only through assignments inside `__init__`, with no
   class-level field declarations. The debug trace showed
   `AttributeError: 'MilestoneProof' object has no attribute
   'milestones'` on the Studionet runtime. Fix: storage is now
   declared with class-level annotations and constructed in
   `__init__` (`TreeMap()`, `u32(0)`), and sized-integer
   arithmetic uses the explicit `u32(int(x) + 1)` form.
3. Instance `0xFB953CEe6e6fB3962C685433d53F38bBE24e7Dd0`
   (deploy tx
   `0x80bee0d6d8bace27f92c1c9558b77be731c8d44d559afdb317661bd26ad33718`,
   create tx
   `0x854a6d87b5a834bcf8d2d17a29ec8d7b4c0d47fe580e1a16e39d06ddf83564d8`
   FINALIZED but execution failed). This was the intermediate
   version with the index map but still without class-level
   storage declarations; the same missing-attribute failure
   applied. The class-level declaration fix in (2) is what made
   the canonical run pass.

## Local results (for reference, not chain evidence)

- Stand-in suite: 19 passed (`tests/`).
- Direct-mode smoke: 2 passed (`tests_direct/`, real GenVM
  in-process). Run separately from the stand-in suite; see
  `TESTING.md`.
- Linter: lint passed (3 checks), validation passed, 7 methods
  (4 view, 3 write).
- Offline static check: `python3 scripts/check_contract.py`,
  all checks passed (not a linter substitute).
