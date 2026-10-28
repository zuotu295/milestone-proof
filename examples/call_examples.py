"""Call examples for MilestoneProof.

This script sends nothing, connects to nothing, and holds no key.
It only prints the exact arguments that can be pasted into GenLayer
Studio (or passed to the CLI / genlayer-js) after deploying the
contract. See DEPLOY.md for the deployment guide and
evidence/EVIDENCE.md for recorded deployments.

Example outcome (live validators, clear-cut evidence): the demo
milestone is assessed with a verdict from the closed set
(ACCEPTED, NEEDS_WORK, REJECTED) and a reason category; the exact
verdict is whatever the validators agree on, not a value fixed
here.
"""

import json

WORKER = "0x" + "ab" * 20  # Replace with the intended worker wallet before calling.

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


def main():
    print("create_milestone:")
    print(json.dumps(["demo-landing-page", "Landing page", CRITERIA, WORKER], indent=2))
    print("submit_evidence (sign with the designated worker):")
    print(json.dumps(["demo-landing-page", EVIDENCE], indent=2))
    print("assess_milestone (sign with the milestone owner):")
    print(json.dumps(["demo-landing-page"], indent=2))


if __name__ == "__main__":
    main()
