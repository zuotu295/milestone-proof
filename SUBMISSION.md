# MilestoneProof update

Milestone creation now requires an intended worker wallet address. The contract
stores this address permanently and only that worker may submit the initial
evidence or revise it after a NEEDS_WORK result. Only the milestone owner may
request an assessment, so unrelated accounts cannot trigger terminal verdicts.

Authorization is enforced in deterministic contract code before model execution
or state writes. Worker addresses must be valid and nonzero; comparisons are
case-insensitive. The frontend collects the worker address and shows actions
according to the connected wallet's role.

## Verification

- 38 source-level tests load the deployable contract itself, including denied
  initial submission, denied revision, denied assessment, unchanged state after
  denial, and no model invocation during unauthorized assessments.
- 4 direct-mode tests exercise the real GenLayer SDK with separate owner,
  worker and unrelated accounts, including revision after NEEDS_WORK.
- Official contract lint and validation pass: 7 public methods.
- Frontend production build passes.
- The three-account live authorization flow passed on Stable Studionet:
  unrelated submission/assessment/revision and owner revision were rejected;
  worker submission/revision and owner assessments succeeded. The verdict
  progressed from NEEDS_WORK to ACCEPTED. See `evidence/ACCESS_CONTROL.md` and
  `evidence/permissions-flow.json` (`verified: true`) for transaction hashes.
- `evidence/deployed-source.json` confirms that the on-chain source exactly
  matches `contracts/milestone_proof.py`.

Network: Stable Studionet, chain ID 61999.

Updated contract: `0x845AFBA77dC61cDe4049486Df09b7f06D9B6BFd0`.

Source SHA-256:
`206df19f55449ecad052b8b800fdadd46b4fe75c66b647083c07fc122501b903`.

Historical deployment addresses predate these permission checks. The updated
contract address above replaces them for this version.
