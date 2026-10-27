"""Direct-mode smoke tests for MilestoneProof, using the real GenVM.

These tests are separate from tests/test_milestone_proof.py: they
require the genlayer-test direct fixtures, which are only available
in the reproducible environment. They make no network call and no
chain transaction: direct mode runs the contract in-process.

Run only with the reproducible environment, from the project root:
    .venv-repro/bin/python -m pytest tests_direct -v
"""

import json


def test_direct_deploy_and_empty_view(direct_deploy):
    contract = direct_deploy("contracts/milestone_proof.py")
    assert contract.get_milestone_count() == 0
    assert contract.get_status("missing") == "NOT_FOUND"
    assert contract.get_milestone("missing") == ""


def test_direct_create_and_submit(direct_deploy):
    contract = direct_deploy("contracts/milestone_proof.py")
    criteria = (
        "Deliver a landing page with a headline, a signup form that "
        "stores submissions, and a mobile layout that does not break "
        "below 360px width."
    )
    result = contract.create_milestone("direct-smoke", "Landing page", criteria)
    record = json.loads(result)
    assert record["status"] == "OPEN"
    evidence = (
        "Delivered the landing page at the staging URL: headline and "
        "signup form are live, submissions are stored in the project "
        "database, and the layout was checked at 320px and 768px widths."
    )
    record = json.loads(contract.submit_evidence("direct-smoke", evidence))
    assert record["status"] == "EVIDENCE_SUBMITTED"
    assert record["evidence_count"] == 1
    assert contract.get_milestone_count() == 1
    assert contract.get_milestone_id(0) == "direct-smoke"
    assert contract.get_milestone_id(1) == ""
