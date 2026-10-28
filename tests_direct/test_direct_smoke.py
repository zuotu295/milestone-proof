"""Direct-mode smoke tests for MilestoneProof, using the real GenLayer SDK.

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


def test_direct_create_and_submit(direct_deploy, direct_vm, direct_alice):
    contract = direct_deploy("contracts/milestone_proof.py")
    criteria = (
        "Deliver a landing page with a headline, a signup form that "
        "stores submissions, and a mobile layout that does not break "
        "below 360px width."
    )
    result = contract.create_milestone("direct-smoke", "Landing page", criteria, "0x" + direct_alice.hex())
    record = json.loads(result)
    assert record["status"] == "OPEN"
    evidence = (
        "Delivered the landing page at the staging URL: headline and "
        "signup form are live, submissions are stored in the project "
        "database, and the layout was checked at 320px and 768px widths."
    )
    direct_vm.sender = direct_alice
    record = json.loads(contract.submit_evidence("direct-smoke", evidence))
    assert record["status"] == "EVIDENCE_SUBMITTED"
    assert record["evidence_count"] == 1
    assert contract.get_milestone_count() == 1
    assert contract.get_milestone_id(0) == "direct-smoke"
    assert contract.get_milestone_id(1) == ""


def test_direct_unauthorized_operations(direct_deploy, direct_vm, direct_alice, direct_bob):
    contract = direct_deploy("contracts/milestone_proof.py")
    owner = direct_vm.sender
    contract.create_milestone("roles", "Role checks", "Deliver a working signup page.", "0x" + direct_alice.hex())
    before = contract.get_milestone("roles")
    for sender in (owner, direct_bob):
        direct_vm.sender = sender
        with direct_vm.expect_revert("UNAUTHORIZED"):
            contract.submit_evidence("roles", "The working signup page is delivered.")
        assert contract.get_milestone("roles") == before
    direct_vm.sender = direct_alice
    contract.submit_evidence("roles", "The working signup page is delivered.")
    before = contract.get_milestone("roles")
    for sender in (direct_alice, direct_bob):
        direct_vm.sender = sender
        with direct_vm.expect_revert("UNAUTHORIZED"):
            contract.assess_milestone("roles")
        assert contract.get_milestone("roles") == before


def test_direct_revision_permissions(direct_deploy, direct_vm, direct_alice, direct_bob):
    contract = direct_deploy("contracts/milestone_proof.py")
    owner = direct_vm.sender
    worker = "0x" + direct_alice.hex()
    contract.create_milestone("revision", "Revision", "Deliver a working mobile signup page.", worker)
    direct_vm.sender = direct_alice
    contract.submit_evidence("revision", "Signup works, but the mobile layout still overflows.")
    direct_vm.sender = owner
    direct_vm.mock_llm(".*", json.dumps({"verdict": "NEEDS_WORK", "category": "partial", "summary": "The mobile layout still needs an overflow fix."}))
    contract.assess_milestone("revision")
    before = contract.get_milestone("revision")
    assert json.loads(before)["verdict"] == "NEEDS_WORK"
    for sender in (owner, direct_bob):
        direct_vm.sender = sender
        with direct_vm.expect_revert("UNAUTHORIZED"):
            contract.submit_evidence("revision", "The mobile overflow is now fixed and tested.")
        assert contract.get_milestone("revision") == before
    direct_vm.sender = direct_alice
    record = json.loads(contract.submit_evidence("revision", "The mobile overflow is now fixed and tested."))
    assert record["worker"] == worker.lower()
    assert record["evidence_count"] == 2
    assert record["status"] == "EVIDENCE_SUBMITTED"
