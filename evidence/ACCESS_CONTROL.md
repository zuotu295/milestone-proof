# Access-control verification

Network: Stable Studionet (61999). Every transaction below reached FINALIZED.
Gas price was checked as zero before every transaction; no funds were sent.
The owner, designated worker and unrelated caller were separate disposable
accounts. The full public record is in `permissions-flow.json`.

Contract: `0x845AFBA77dC61cDe4049486Df09b7f06D9B6BFd0`.

Source SHA-256: `206df19f55449ecad052b8b800fdadd46b4fe75c66b647083c07fc122501b903`.
The source read back from the chain matched the repository exactly; see
`deployed-source.json`.

| Operation | Transaction | Execution |
|---|---|---|
| deploy | `0xae9429454a32ef7a297821d44d096cb9ad44871321e3ca442dcdbb30a61ba85e` | SUCCESS |
| create | `0x146b13915a3394bbc91b385d10db19a1912a8a673e1cc31652b44dd45e3c75f9` | SUCCESS |
| outsider-cannot-submit | `0xc9ebc1e8b682e793381175e29bb8a2e83b2a5488589a8c633d6323c7cfdc27da` | Rejected: UNAUTHORIZED |
| worker-submit | `0x9723e88ce49704f19f7a6dd8dc188ee2c303b1a876711b610a67b4175dce77e3` | SUCCESS |
| outsider-cannot-assess | `0xaa5e1735b8f42665a4fe3bd134d43a34954ff04223d3d53fe2125bdb47602838` | Rejected: UNAUTHORIZED |
| worker-cannot-assess | `0x6e03dc9ee64b35dc75ea460630fb5c587df2ca0bb88b27969a5540f5fe80775a` | Rejected: UNAUTHORIZED |
| owner-assess-partial | `0x80123edae2dc1cd10e70904f68f3e762e8378b4f06046726782824ade5ab4e74` | SUCCESS |
| outsider-cannot-revise | `0x8019b68caa5535c2992ed559aa5d0d37a940a3b14720e2c603eb25169cdc1e3e` | Rejected: UNAUTHORIZED |
| owner-cannot-revise | `0xc0e1c2cc518508a49c84736c18927e6fec6decf1f5794f9261361ba14df37184` | Rejected: UNAUTHORIZED |
| worker-revise | `0xf80da169f470c010563f5e0424ede3d7f0a33794efec5376674fec1ecf884b30` | SUCCESS |
| owner-assess-final | `0xd73acf914c3431b67742c5551db999e13f21d8b4a3a6bc9379215b3eb935a460` | SUCCESS |

Denied calls were checked for an UNAUTHORIZED result and byte-for-byte
unchanged milestone data. The designated worker submitted the first evidence;
the owner received NEEDS_WORK from live validators. Both the unrelated account
and the owner were denied permission to revise. The designated worker then
revised the evidence and the owner ran the final assessment.

Final verdict: `ACCEPTED`.
Evidence submissions: 2. Assessments: 2. The fixed worker address was preserved.

Local validation: 38 source-level tests, 4 real SDK direct-mode tests,
official lint/validation (7 public methods), offline static check, and
frontend production build all passed. See `validation.json` for commands
and tool versions.
