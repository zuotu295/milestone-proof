import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import "./style.css";

const DEFAULT_CONTRACT =
  import.meta.env.VITE_CONTRACT_ADDRESS || "";
const EXPLORER = "https://explorer-studio.genlayer.com";

const $ = (id) => document.getElementById(id);
const short = (addr) =>
  addr && addr.length > 13 ? addr.slice(0, 6) + "…" + addr.slice(-4) : addr || "";

let account = null;
let client = null;
let contractAddress = localStorage.getItem("mp_contract") || DEFAULT_CONTRACT;

function readClient() {
  return createClient({ chain: studionet });
}

function setTx(text, kind = "") {
  const el = $("tx-status");
  el.textContent = text;
  el.className = "tx " + kind;
}

function showError(message) {
  const el = $("error");
  el.textContent = message;
  el.hidden = !message;
}

async function refreshList() {
  const list = $("milestone-list");
  if (!contractAddress) {
    list.innerHTML = "<p class='muted'>Enter a contract address above to load milestones.</p>";
    return;
  }
  list.innerHTML = "<p class='muted'>Loading…</p>";
  try {
    const c = readClient();
    const countRaw = await c.readContract({
      address: contractAddress,
      functionName: "get_milestone_count",
      args: [],
    });
    const count = Number(countRaw);
    $("count").textContent = String(count);
    if (count === 0) {
      list.innerHTML = "<p class='muted'>No milestones yet. Create the first one below.</p>";
      return;
    }
    const cards = [];
    for (let i = count - 1; i >= 0; i--) {
      const id = await c.readContract({
        address: contractAddress,
        functionName: "get_milestone_id",
        args: [i],
      });
      const raw = await c.readContract({
        address: contractAddress,
        functionName: "get_milestone",
        args: [String(id)],
      });
      cards.push(renderCard(typeof raw === "string" ? JSON.parse(raw) : raw));
    }
    list.innerHTML = cards.join("");
    list.querySelectorAll("[data-assess]").forEach((btn) => {
      btn.addEventListener("click", () => onAssess(btn.dataset.assess));
    });
    list.querySelectorAll("[data-submit]").forEach((btn) => {
      btn.addEventListener("click", () => onSubmit(btn.dataset.submit));
    });
  } catch (err) {
    list.innerHTML = "<p class='muted'>Could not load milestones.</p>";
    showError("Load failed: " + (err?.message || err));
  }
}

function badge(text, tone) {
  return `<span class="badge ${tone}">${text}</span>`;
}

function renderCard(m) {
  const verdict =
    m.verdict === "ACCEPTED"
      ? badge("ACCEPTED", "ok")
      : m.verdict === "NEEDS_WORK"
        ? badge("NEEDS_WORK", "warn")
        : m.verdict === "REJECTED"
          ? badge("REJECTED", "bad")
          : "";
  const canAssess = m.status === "EVIDENCE_SUBMITTED";
  const canSubmit = m.status === "OPEN" || (m.status === "ASSESSED" && m.verdict === "NEEDS_WORK");
  return `<article class="card">
    <header><h3>${escapeHtml(m.title)}</h3>
    <span>${badge(m.status, "neutral")} ${verdict}</span></header>
    <p class="meta">ID <code>${escapeHtml(m.milestone_id)}</code> · owner ${short(m.owner)} · submitter ${short(m.submitter) || "—"} · evidence ×${m.evidence_count} · assessments ×${m.assessment_count}</p>
    <details><summary>Criteria</summary><p>${escapeHtml(m.criteria)}</p></details>
    ${m.evidence ? `<details open><summary>Evidence</summary><p>${escapeHtml(m.evidence)}</p></details>` : ""}
    ${m.summary ? `<p class="summary"><strong>Assessment:</strong> ${escapeHtml(m.summary)} <em>(${escapeHtml(m.category)})</em></p>` : ""}
    ${canSubmit ? `<label>New evidence (20–4000 chars)<textarea id="ev-${escapeHtml(m.milestone_id)}" rows="3"></textarea></label>
    <button data-submit="${escapeHtml(m.milestone_id)}">Submit evidence</button>` : ""}
    ${canAssess ? `<button data-assess="${escapeHtml(m.milestone_id)}">Run validator assessment</button>` : ""}
  </article>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

async function ensureWallet() {
  if (!window.ethereum) throw new Error("No wallet found. Install MetaMask and try again.");
  if (!account) {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    account = accounts[0];
    $("wallet-btn").textContent = "Connected: " + short(account);
  }
  client = createClient({ chain: studionet, account });
  await client.connect("studionet");
  return client;
}

async function send(method, args) {
  showError("");
  const c = await ensureWallet();
  setTx("Waiting for signature…");
  const hash = await c.writeContract({
    address: contractAddress,
    functionName: method,
    args,
    value: BigInt(0),
  });
  setTx(`Sent: ${hash}. Waiting for validator consensus (FINALIZED)…`);
  const receipt = await c.waitForTransactionReceipt({
    hash,
    status: "FINALIZED",
    interval: 3000,
    retries: 200,
  });
  setTx(`Finalized: ${hash}`, "ok");
  return receipt;
}

async function onCreate(ev) {
  ev.preventDefault();
  if (!contractAddress) return showError("Set a contract address first.");
  const id = $("f-id").value.trim();
  const title = $("f-title").value.trim();
  const criteria = $("f-criteria").value.trim();
  try {
    await send("create_milestone", [id, title, criteria]);
    await refreshList();
  } catch (err) {
    setTx("", "");
    showError("Create failed: " + (err?.message || err));
  }
}

async function onSubmit(mid) {
  if (!contractAddress) return showError("Set a contract address first.");
  const evidence = document.getElementById("ev-" + mid).value.trim();
  try {
    await send("submit_evidence", [mid, evidence]);
    await refreshList();
  } catch (err) {
    setTx("", "");
    showError("Submit failed: " + (err?.message || err));
  }
}

async function onAssess(mid) {
  if (!contractAddress) return showError("Set a contract address first.");
  try {
    await send("assess_milestone", [mid]);
    await refreshList();
  } catch (err) {
    setTx("", "");
    showError("Assessment failed: " + (err?.message || err));
  }
}

$("wallet-btn").addEventListener("click", async () => {
  try {
    await ensureWallet();
  } catch (err) {
    showError(err?.message || err);
  }
});
$("contract-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  contractAddress = $("contract-address").value.trim();
  localStorage.setItem("mp_contract", contractAddress);
  $("explorer-link").href = EXPLORER;
  refreshList();
});
$("create-form").addEventListener("submit", onCreate);
$("refresh-btn").addEventListener("click", refreshList);
$("demo-btn").addEventListener("click", () => {
  $("contract-address").value = contractAddress;
  refreshList();
});

$("contract-address").value = contractAddress;
$("explorer-link").href = EXPLORER;
$("chain-note").textContent = "Stable Studionet · Chain ID 61999 · test network only, no real funds";
refreshList();
