"""Studionet integration test for MilestoneProof (real chain, real validators).

Run ONLY with the reproducible environment, from the project root:
    .venv-repro/bin/gltest --network studionet tests_integration -v -s

Deploys one contract instance on Stable Studionet (61999), creates a
milestone, submits evidence, and runs a live-validator assessment.
No mocked LLM is used. The test asserts only what the design
guarantees: the assessment completes, the status becomes ASSESSED,
and the verdict and category are members of their closed sets.
The actual verdict is printed as a JSON evidence line and archived
in evidence/, not forced to a particular value here, because live
validators judge the evidence independently.

Do NOT run this file against another network without reviewing it
first, and do NOT use it for Appeal.
"""

import json

from gltest import get_contract_factory
from gltest.assertions import tx_execution_succeeded
from gltest.types import TransactionStatus

CRITERIA = (
    "Deliver a landing page with a headline, a signup form that "
    "stores submissions, and a mobile layout that does not break "
    "below 360px width."
)
EVIDENCE = (
    "Delivered the landing page at the staging URL: headline and "
    "signup form are live, submissions are stored in the project "
    "database, and the layout was checked at 320px, 360px and "
    "768px widths with no overflow."
)
VERDICTS = ("ACCEPTED", "NEEDS_WORK", "REJECTED")
CATEGORIES = (
    "complete",
    "partial",
    "missing_deliverable",
    "off_brief",
    "insufficient_detail",
    "unclear",
)


def _receipt_info(receipt):
    info = {}
    for key in ("hash", "transaction_hash", "tx_hash", "status",
                "consensus_status", "execution_result", "result",
                "contract_address", "address"):
        try:
            value = receipt.get(key)
        except Exception:
            value = None
        if value is not None:
            info[key] = str(value)
    info["raw_keys"] = sorted(list(receipt.keys())) if hasattr(receipt, "keys") else []
    return info


def test_studionet_full_flow(default_account):
    factory = get_contract_factory(contract_file_path="milestone_proof.py")
    deploy_receipt = factory.deploy_contract_tx(
        wait_transaction_status=TransactionStatus.FINALIZED,
    )
    assert tx_execution_succeeded(deploy_receipt), deploy_receipt
    from gltest.utils import extract_contract_address
    address = extract_contract_address(deploy_receipt)
    contract = factory.build_contract(contract_address=address)
    print("\nEVIDENCE_MILESTONE_DEPLOY " + json.dumps({
        "contract_address": str(address),
        "deploy_receipt": _receipt_info(deploy_receipt),
    }, sort_keys=True))

    create_receipt = contract.create_milestone(
        args=["studionet-demo", "Landing page", CRITERIA, default_account.address]
    ).transact(wait_transaction_status=TransactionStatus.FINALIZED)
    assert tx_execution_succeeded(create_receipt), create_receipt
    print("EVIDENCE_MILESTONE_CREATE " + json.dumps({
        "contract_address": str(address),
        "create_receipt": _receipt_info(create_receipt),
    }, sort_keys=True))

    submit_receipt = contract.submit_evidence(
        args=["studionet-demo", EVIDENCE]
    ).transact(wait_transaction_status=TransactionStatus.FINALIZED)
    assert tx_execution_succeeded(submit_receipt), submit_receipt
    print("EVIDENCE_MILESTONE_SUBMIT " + json.dumps({
        "contract_address": str(address),
        "submit_receipt": _receipt_info(submit_receipt),
    }, sort_keys=True))

    assess_receipt = contract.assess_milestone(
        args=["studionet-demo"]
    ).transact(wait_transaction_status=TransactionStatus.FINALIZED)
    assert tx_execution_succeeded(assess_receipt), assess_receipt
    print("EVIDENCE_MILESTONE_ASSESS " + json.dumps({
        "contract_address": str(address),
        "assess_receipt": _receipt_info(assess_receipt),
    }, sort_keys=True))

    status = contract.get_status(args=["studionet-demo"]).call()
    count = contract.get_milestone_count().call()
    record = json.loads(contract.get_milestone(args=["studionet-demo"]).call())
    print("EVIDENCE_MILESTONE_RECORD " + json.dumps({
        "contract_address": str(address),
        "status": str(status),
        "milestone_count": str(count),
        "record": record,
    }, sort_keys=True))

    assert str(status) == "ASSESSED"
    assert int(count) == 1
    assert record["status"] == "ASSESSED"
    assert record["verdict"] in VERDICTS
    assert record["category"] in CATEGORIES
    assert record["assessment_count"] == 1
