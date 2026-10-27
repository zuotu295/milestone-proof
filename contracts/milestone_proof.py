# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""MilestoneProof: freelance milestone acceptance on GenLayer.

A client (the milestone owner) publishes acceptance criteria for a
piece of freelance work. A worker submits evidence that the work is
done: a description of what was delivered, links, or test results.
Anyone can then trigger an assessment, and a group of GenLayer
validators independently judges whether the evidence satisfies the
criteria. The verdict becomes shared on-chain state that both sides
can rely on instead of arguing over chat messages.

Why this needs GenLayer
-----------------------
Whether evidence satisfies written criteria is a judgement call, not
a computation: two reasonable people can read the same delivery
differently. A single backend LLM call is one opinion, and it is not
shared state. MilestoneProof puts the judgement through validator
consensus, but bounds it tightly:

1. Deterministic code owns everything that can be decided exactly:
   input bounds, milestone identity, lifecycle transitions, and
   storage. No LLM output can create a milestone, change an owner,
   or move a record to a state the lifecycle forbids.
2. The LLM judges exactly one decision: the verdict
   (ACCEPTED / NEEDS_WORK / REJECTED) and a reason category from a
   closed list. Its summary is stored as context only and never
   drives a transition.
3. Equivalence principle: a validator re-runs the same assessment
   and must agree exactly on the two decision fields, verdict and
   category. Summary wording is deliberately not compared, because
   models phrase the same judgement differently. A validator that
   reaches a different verdict or category disagrees, and a
   malformed leader output is rejected, never agreed on.
4. State is written only after consensus, in deterministic code.

Lifecycle
---------
OPEN -> EVIDENCE_SUBMITTED -> ASSESSED (verdict ACCEPTED, NEEDS_WORK
or REJECTED). A NEEDS_WORK verdict returns the milestone to
EVIDENCE_SUBMITTED when new evidence is submitted, so the worker
can fix the gaps and be re-assessed. ACCEPTED and REJECTED are
terminal: the worker starts a new milestone for new work instead
of rewriting history.

Scope and limits (see README.md and MECHANISM.md)
-------------------------------------------------
* Criteria are 10-2000 characters; evidence is 20-4000 characters.
  Longer submissions must be split or summarised by the submitter.
* The verdict judges the submitted evidence against the submitted
  criteria only. It does not verify links, run code, or prove that
  a real-world deliverable exists outside the evidence text.
* This file is intentionally self-contained for Studio deployment:
  it imports only ``json`` besides the GenLayer SDK, and all pure
  helpers are module-level so they can be unit-tested without a node.
* No chain interaction, payment, or private key is involved in this
  file. Deployment is described in DEPLOY.md; recorded deployments
  are listed in evidence/EVIDENCE.md.
"""

from genlayer import *

import json

MAX_MILESTONE_ID_CHARS = 64
MAX_TITLE_CHARS = 128
MAX_CRITERIA_CHARS = 2000
MAX_EVIDENCE_CHARS = 4000
MIN_CRITERIA_CHARS = 10
MIN_EVIDENCE_CHARS = 20
MAX_SUMMARY_CHARS = 500
MIN_SUMMARY_CHARS = 10

VERDICTS = ("ACCEPTED", "NEEDS_WORK", "REJECTED")
CATEGORIES = (
    "complete",
    "partial",
    "missing_deliverable",
    "off_brief",
    "insufficient_detail",
    "unclear",
)


def _fail(code, detail=""):
    raise gl.vm.UserError(code + (": " + detail if detail else ""))


def _validate_text(value, label, min_chars, max_chars):
    if not isinstance(value, str) or not value.strip():
        _fail("INVALID_INPUT", label + " must be a non-empty string")
    if len(value) < min_chars or len(value) > max_chars:
        _fail(
            "INVALID_INPUT",
            label + " must be between "
            + str(min_chars) + " and " + str(max_chars) + " characters",
        )
    return value


def _validate_milestone_id(milestone_id):
    if not isinstance(milestone_id, str) or not milestone_id:
        _fail("INVALID_MILESTONE_ID", "milestone_id must be non-empty")
    if len(milestone_id) > MAX_MILESTONE_ID_CHARS:
        _fail("INVALID_MILESTONE_ID", "milestone_id too long")
    for ch in milestone_id:
        if not (ch.isalnum() or ch in "-_"):
            _fail("INVALID_MILESTONE_ID", "milestone_id has illegal character")
    return milestone_id


def _sanitize_prompt_text(text):
    """Remove forged prompt-boundary markers from user-supplied text.

    Criteria and evidence are treated as data, never as instructions.
    A closing tag such as ``</criteria>`` inside the text must not be
    able to end the data section early, so any tag whose name (after
    stripping whitespace, slashes and case) is ``criteria`` or
    ``evidence`` is replaced with ``[removed]``, as is any
    ``===...===`` segment whose inner text mentions one of them.
    The replacement is shorter than any marker it replaces, so
    sanitisation never expands the text. Only the prompt copy is
    affected; the stored criteria and evidence keep the original text.
    """
    out = []
    i = 0
    n = len(text)
    while i < n:
        if text[i] == "<":
            j = text.find(">", i + 1)
            if j != -1:
                raw = text[i + 1 : j].strip().strip("/").strip().lower()
                if raw in ("criteria", "evidence"):
                    out.append("[removed]")
                    i = j + 1
                    continue
            out.append(text[i])
            i += 1
            continue
        if text.startswith("===", i):
            j = text.find("===", i + 3)
            if j != -1:
                inner = text[i + 3 : j].strip().lower()
                if "criteria" in inner or "evidence" in inner:
                    out.append("[removed]")
                    i = j + 3
                    continue
        out.append(text[i])
        i += 1
    return "".join(out)


def _parse_assessment(raw):
    """Parse one LLM assessment into a dict, or return None."""
    if isinstance(raw, dict):
        data = raw
    elif isinstance(raw, str):
        text = raw.strip()
        if text.startswith("```"):
            lines = text.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip().startswith("```"):
                lines = lines[:-1]
            text = "\n".join(lines).strip()
        try:
            data = json.loads(text)
        except Exception:
            return None
        if not isinstance(data, dict):
            return None
    else:
        return None
    verdict = data.get("verdict")
    category = data.get("category")
    summary = data.get("summary")
    if verdict not in VERDICTS or category not in CATEGORIES:
        return None
    if not isinstance(summary, str):
        return None
    summary = summary.strip()
    if len(summary) < MIN_SUMMARY_CHARS or len(summary) > MAX_SUMMARY_CHARS:
        return None
    return {"verdict": verdict, "category": category, "summary": summary}


class MilestoneProof(gl.Contract):
    milestones: TreeMap[str, str]
    id_index: TreeMap[str, str]
    milestone_count: u32

    def __init__(self):
        self.milestones = TreeMap()
        self.id_index = TreeMap()
        self.milestone_count = u32(0)

    def _load(self, milestone_id):
        _validate_milestone_id(milestone_id)
        raw = self.milestones.get(milestone_id, "")
        if raw == "":
            _fail("NOT_FOUND", "milestone does not exist")
        return json.loads(raw)

    def _store(self, record):
        self.milestones[record["milestone_id"]] = json.dumps(record, sort_keys=True)
        return json.dumps(record, sort_keys=True)

    @gl.public.write
    def create_milestone(self, milestone_id, title, criteria) -> str:
        _validate_milestone_id(milestone_id)
        _validate_text(title, "title", 1, MAX_TITLE_CHARS)
        _validate_text(criteria, "criteria", MIN_CRITERIA_CHARS, MAX_CRITERIA_CHARS)
        if self.milestones.get(milestone_id, "") != "":
            _fail("MILESTONE_EXISTS", "milestone_id already used")
        record = {
            "milestone_id": milestone_id,
            "title": title,
            "criteria": criteria,
            "owner": str(gl.message.sender_address),
            "submitter": "",
            "evidence": "",
            "evidence_count": 0,
            "status": "OPEN",
            "verdict": "",
            "category": "",
            "summary": "",
            "assessment_count": 0,
        }
        # Milestone ids are kept in creation order as one
        # newline-joined string under a single index key. This
        # avoids int-to-string key conversion and list-index
        # arithmetic on the chain runtime; see get_milestone_id.
        self.id_index["ids"] = (
            self.id_index.get("ids", "") + milestone_id + "\n"
        )
        self.milestone_count = u32(int(self.milestone_count) + 1)
        return self._store(record)

    @gl.public.write
    def submit_evidence(self, milestone_id, evidence) -> str:
        _validate_text(evidence, "evidence", MIN_EVIDENCE_CHARS, MAX_EVIDENCE_CHARS)
        record = self._load(milestone_id)
        if record["status"] == "ASSESSED" and record["verdict"] != "NEEDS_WORK":
            _fail("INVALID_STATUS", "milestone is terminal; create a new one")
        if record["status"] not in ("OPEN", "ASSESSED"):
            _fail("INVALID_STATUS", "evidence cannot be submitted now")
        record["evidence"] = evidence
        record["submitter"] = str(gl.message.sender_address)
        record["evidence_count"] += 1
        record["status"] = "EVIDENCE_SUBMITTED"
        record["verdict"] = ""
        record["category"] = ""
        record["summary"] = ""
        return self._store(record)

    @gl.public.write
    def assess_milestone(self, milestone_id) -> str:
        record = self._load(milestone_id)
        if record["status"] != "EVIDENCE_SUBMITTED":
            _fail("INVALID_STATUS", "no submitted evidence to assess")
        criteria = _sanitize_prompt_text(record["criteria"])
        evidence = _sanitize_prompt_text(record["evidence"])
        prompt = (
            "You are assessing freelance milestone evidence against "
            "acceptance criteria. Judge only what the evidence shows; "
            "do not invent deliverables that are not in the evidence. "
            "Return JSON only with keys verdict, category, summary.\n"
            "verdict: ACCEPTED if the evidence shows all criteria are met; "
            "NEEDS_WORK if the work is partially done or has fixable gaps; "
            "REJECTED if the evidence is unrelated to the criteria, shows "
            "no deliverable, or contradicts the criteria.\n"
            "category: one of complete, partial, missing_deliverable, "
            "off_brief, insufficient_detail, unclear.\n"
            "summary: one or two sentences, 10 to 500 characters, saying "
            "which criteria are met or missing.\n"
            "<criteria>\n" + criteria + "\n</criteria>\n"
            "<evidence>\n" + evidence + "\n</evidence>\n"
        )

        def leader_fn():
            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            parsed = _parse_assessment(raw)
            if parsed is None:
                raise gl.vm.UserError("LLM_ERROR: assessment could not be parsed")
            return parsed

        def validator_fn(result):
            if not isinstance(result, gl.vm.Return):
                return False
            leader = result.calldata
            if _parse_assessment(leader) is None:
                return False
            try:
                own = leader_fn()
            except Exception:
                return False
            return (
                leader["verdict"] == own["verdict"]
                and leader["category"] == own["category"]
            )

        consensus = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        if _parse_assessment(consensus) is None:
            _fail("CONSENSUS_RESULT_INVALID", "agreed result is not an assessment")
        record["status"] = "ASSESSED"
        record["verdict"] = consensus["verdict"]
        record["category"] = consensus["category"]
        record["summary"] = consensus["summary"]
        record["assessment_count"] += 1
        return self._store(record)

    @gl.public.view
    def get_milestone(self, milestone_id) -> str:
        raw = self.milestones.get(milestone_id, "")
        return raw

    @gl.public.view
    def get_status(self, milestone_id) -> str:
        raw = self.milestones.get(milestone_id, "")
        if raw == "":
            return "NOT_FOUND"
        return json.loads(raw)["status"]

    @gl.public.view
    def get_milestone_count(self) -> u32:
        return self.milestone_count

    @gl.public.view
    def get_milestone_id(self, index: u32) -> str:
        if index >= self.milestone_count:
            return ""
        parts = self.id_index.get("ids", "").split("\n")
        current = u32(0)
        for part in parts:
            if current == index:
                return part
            current = u32(int(current) + 1)
        return ""
