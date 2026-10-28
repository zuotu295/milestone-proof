import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import "./style.css";

const DEFAULT_CONTRACT =
  import.meta.env.VITE_CONTRACT_ADDRESS || "0x845AFBA77dC61cDe4049486Df09b7f06D9B6BFd0";
const EXPLORER = "https://explorer-studio.genlayer.com";

const $ = (id) => document.getElementById(id);
const short = (addr) =>
  addr && addr.length > 13 ? addr.slice(0, 6) + "…" + addr.slice(-4) : addr || "";

let account = null;
let client = null;
let contractAddress = localStorage.getItem("mp_contract_v2") || DEFAULT_CONTRACT;
let allMilestones = [];
let currentFilter = "ALL";

const CATEGORY_TEXT = {
  complete: "All criteria met.",
  partial: "Part of the work is done; gaps remain.",
  missing_deliverable: "No deliverable shown in the evidence.",
  off_brief: "The evidence does not match the brief.",
  insufficient_detail: "The evidence is too vague to confirm completion.",
  unclear: "The evidence is unclear or contradictory.",
};

function readClient() {
  return createClient({ chain: studionet });
}

function setTx(text, kind = "", hash = "") {
  const el = $("tx-status");
  el.className = "tx " + kind;
  el.textContent = text;
  if (hash) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Copy hash";
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(hash);
        btn.textContent = "Copied";
      } catch {
        btn.textContent = hash;
      }
    });
    el.appendChild(btn);
  }
}

function renderFiltered() {
  const list = $("milestone-list");
  const shown =
    currentFilter === "ALL"
      ? allMilestones
      : allMilestones.filter((m) => m.status === currentFilter);
  if (shown.length === 0) {
    list.innerHTML = "<p class='muted'>No milestones match this filter.</p>";
    return;
  }
  list.innerHTML = shown.map(renderCard).join("");
  list.querySelectorAll("[data-assess]").forEach((btn) => {
    btn.addEventListener("click", () => onAssess(btn.dataset.assess));
  });
  list.querySelectorAll("[data-submit]").forEach((btn) => {
    btn.addEventListener("click", () => onSubmit(btn.dataset.submit));
  });
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
    allMilestones = [];
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
      allMilestones.push(typeof raw === "string" ? JSON.parse(raw) : raw);
    }
    renderFiltered();
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
  const isOwner = Boolean(account && m.owner && account.toLowerCase() === m.owner.toLowerCase());
  const isWorker = Boolean(account && m.worker && account.toLowerCase() === m.worker.toLowerCase());
  const canAssess = isOwner && m.status === "EVIDENCE_SUBMITTED";
  const canSubmit = isWorker && (m.status === "OPEN" || (m.status === "ASSESSED" && m.verdict === "NEEDS_WORK"));
  return `<article class="card">
    <header><h3>${escapeHtml(m.title)}</h3>
    <span>${badge(m.status, "neutral")} ${verdict}</span></header>
    <p class="meta">ID <code>${escapeHtml(m.milestone_id)}</code> · owner ${short(m.owner)} · worker ${escapeHtml(short(m.worker) || "—")} · submitter ${short(m.submitter) || "—"} · evidence ×${m.evidence_count} · assessments ×${m.assessment_count}</p>
    ${!m.worker ? "<p class='error'>Legacy record: deploy the updated contract to use worker permissions.</p>" : ""}
    <details><summary>Criteria</summary><p>${escapeHtml(m.criteria)}</p></details>
    ${m.evidence ? `<details open><summary>Evidence</summary><p>${escapeHtml(m.evidence)}</p></details>` : ""}
    ${m.summary ? `<p class="summary"><strong>Assessment:</strong> ${escapeHtml(m.summary)}<br><span class="muted">${escapeHtml(CATEGORY_TEXT[m.category] || m.category)}</span></p>` : ""}
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
  renderFiltered();
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
  setTx(`Sent: ${hash}. Waiting for validator consensus (FINALIZED)…`, "", hash);
  const receipt = await c.waitForTransactionReceipt({
    hash,
    status: "FINALIZED",
    interval: 3000,
    retries: 200,
  });
  const execution = receipt.consensus_data?.leader_receipt?.[0]?.execution_result
    ?? receipt.txExecutionResultName;
  if (execution !== "SUCCESS") {
    throw new Error(`Transaction finalized but execution failed (${execution || "unknown result"}). Hash: ${hash}`);
  }
  setTx(`Finalized: ${hash}`, "ok", hash);
  return receipt;
}

async function onCreate(ev) {
  ev.preventDefault();
  if (!contractAddress) return showError("Set a contract address first.");
  const id = $("f-id").value.trim();
  const title = $("f-title").value.trim();
  const criteria = $("f-criteria").value.trim();
  try {
    const worker = $("f-worker").value.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(worker) || /^0x0{40}$/i.test(worker)) {
      throw new Error("Enter a valid, nonzero worker wallet address.");
    }
    await send("create_milestone", [id, title, criteria, worker]);
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
  localStorage.setItem("mp_contract_v2", contractAddress);
  $("explorer-link").href = EXPLORER;
  refreshList();
});
$("create-form").addEventListener("submit", onCreate);
$("refresh-btn").addEventListener("click", refreshList);
document.querySelectorAll("[data-filter]").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentFilter = btn.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((b) => {
      b.setAttribute("aria-pressed", b === btn ? "true" : "false");
    });
    renderFiltered();
  });
});
$("demo-btn").addEventListener("click", () => {
  if (DEFAULT_CONTRACT) {
    contractAddress = DEFAULT_CONTRACT;
    localStorage.setItem("mp_contract_v2", contractAddress);
    $("contract-address").value = contractAddress;
  }
  refreshList();
});

$("contract-address").value = contractAddress;
$("explorer-link").href = EXPLORER;
$("chain-note").textContent = "Stable Studionet · Chain ID 61999 · test network only, no real funds";
refreshList();

window.ethereum?.on?.("accountsChanged", (accounts) => {
  account = accounts[0] || null;
  client = null;
  $("wallet-btn").textContent = account ? "Connected: " + short(account) : "Connect wallet";
  renderFiltered();
});
