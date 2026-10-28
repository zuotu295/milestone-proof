# MilestoneProof mechanism

## The decision the contract makes

Given written acceptance criteria and submitted evidence for one
freelance milestone, decide one verdict:

- `ACCEPTED` — the evidence shows all criteria are met.
- `NEEDS_WORK` — the work is partially done or has fixable gaps.
- `REJECTED` — the evidence is unrelated to the criteria, shows no
  deliverable, or contradicts the criteria.

Each verdict carries a reason category from a closed list
(`complete`, `partial`, `missing_deliverable`, `off_brief`,
`insufficient_detail`, `unclear`) and a short summary. The verdict
and category are the decision; the summary is context only and
never drives a transition.

## Lifecycle

```
OPEN -> EVIDENCE_SUBMITTED -> ASSESSED
```

- `create_milestone` (anyone) records the criteria and the creator
  as owner, and requires a valid nonzero `worker` address. Both roles are
  immutable. Milestone ids are unique per instance.
- `submit_evidence` (designated worker only) records evidence and the submitter.
  It is allowed from `OPEN`, and from `ASSESSED` only when the
  stored verdict is `NEEDS_WORK`, in which case the verdict fields
  are cleared and the milestone returns to `EVIDENCE_SUBMITTED`.
  `ACCEPTED` and `REJECTED` are terminal.
- `assess_milestone` (owner only) runs the validator assessment and
  stores the agreed verdict. It requires `EVIDENCE_SUBMITTED`.
- Views: `get_milestone` returns the record or `""`,
  `get_status` returns the status or `NOT_FOUND`,
  `get_milestone_count` returns the number of milestones, and
  `get_milestone_id(index)` returns the id created at that index
  (creation order) or `""` out of range.

## Stage 1 — deterministic guards

Input bounds are enforced before any assessment:

| Input | Rule |
|---|---|
| Milestone id | non-empty, at most 64 chars, letters/digits/`-`/`_` only |
| Title | 1–128 chars |
| Criteria | 10–2000 chars |
| Evidence | 20–4000 chars |
| Worker address | 0x + 40 hex digits, nonzero, normalized to lowercase |
| Evidence caller | designated worker only, including revisions |
| Assessment caller | owner only, before any LLM execution |
| Duplicate id | rejected (`MILESTONE_EXISTS`) |
| Wrong state | rejected (`INVALID_STATUS`) |

No LLM output can create a milestone, change an owner, or move a
record to a state the lifecycle forbids. Milestone ids are kept in
creation order as one newline-joined string under a single index
key, so clients can list every milestone without knowing its id
in advance, using only string operations and the chain runtime's
sized-integer arithmetic.

## Stage 2 — LLM assessment (one decision only)

The leader calls `gl.nondet.exec_prompt` with a prompt that:

- wraps the criteria and evidence as data inside `<criteria>` /
  `<evidence>` tags, after removing prompt-boundary markers from
  the text itself, so a forged closing tag inside user text cannot
  end a data section early. Only the prompt copy is affected; the
  stored criteria and evidence keep the original text;
- instructs the model to judge only what the evidence shows and
  not to invent deliverables that are not in the evidence;
- restricts output to the three verdicts, the six categories, and
  a summary of 10–500 characters.

### Assessment validation (deterministic, applied to every LLM output)

An assessment is kept only if it is a JSON object (or a JSON
string, optionally fenced) with a verdict in the closed set, a
category in the closed set, and a summary within the length
bounds. Anything else is a leader error, not a stored result.

## Stage 3 — equivalence (custom validator)

The contract uses `gl.vm.run_nondet_unsafe` with a custom
validator. It does not use exact-output equality, because LLM
wording is non-deterministic and exact equality would fail
consensus on phrasing alone.

Validator logic:

1. If the leader result is not a `gl.vm.Return`, return `False`.
   Malformed LLM output therefore forces rotation to a new leader
   instead of being agreed on as an error.
2. Re-run the leader function independently.
3. Require exact agreement on both decision fields: verdict and
   category. Summary wording is deliberately not compared.

A validator that reaches a different verdict or a different
category disagrees. Field-level agreement on the decision is what
consensus guarantees; the summary is stored context, and a reader
who needs more than the verdict should read the evidence itself.

## Stage 4 — deterministic state write

Only after `run_nondet_unsafe` returns does deterministic code set
the status to `ASSESSED`, store the verdict, category and summary,
increment the assessment count, and return the record. Nothing is
written inside `leader_fn` or `validator_fn`, and storage is never
read inside a non-deterministic block: the criteria and evidence
are captured as local variables first.

## Errors

| Error prefix | Meaning |
|---|---|
| `INVALID_MILESTONE_ID` | empty, too long (> 64), or illegal character |
| `INVALID_INPUT` | empty or out-of-bounds title, criteria, or evidence |
| `MILESTONE_EXISTS` | milestone id already used |
| `NOT_FOUND` | milestone does not exist |
| `UNAUTHORIZED` | caller is not the designated worker (submission) or owner (assessment) |
| `INVALID_WORKER` | malformed or zero worker address |
| `INVALID_STATUS` | transition not allowed from the current status |
| `LLM_ERROR` | LLM output could not be parsed or validated (leader-side) |
| `CONSENSUS_RESULT_INVALID` | consensus result could not be parsed after agreement (defensive) |

## Limits

- The verdict judges the submitted evidence against the submitted
  criteria only. It does not verify links, run code, check a bank
  account, or prove that a real-world deliverable exists outside
  the evidence text. A convincing evidence text about work that
  was never done is a social problem, not one this contract can
  detect.
- Criteria and evidence are bounded (see above). Longer briefs
  must be split or summarised by the submitter.
- The contract moves no funds and holds no escrow. It records an
  acceptance verdict that a marketplace, client, or payment flow
  can rely on; the payment itself is outside this contract.
- No frontend is bundled with the contract itself; the web app in
  `frontend/` is a separate client that calls the deployed
  contract through genlayer-js.
