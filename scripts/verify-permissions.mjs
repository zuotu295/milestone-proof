// Run from frontend: node ../scripts/verify-permissions.mjs
// SDK is loaded from the installed frontend dependencies. Fresh test accounts only.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const {createClient, createAccount} = require('genlayer-js');
const {studionet} = require('genlayer-js/chains');
const source = readFileSync(new URL('../contracts/milestone_proof.py', import.meta.url), 'utf8');
const accounts = [createAccount(), createAccount(), createAccount()];
const clients = accounts.map(account => createClient({chain:studionet, account}));
const [owner, worker, outsider] = clients;
const result = {chainId:61999, sourceSha256:createHash('sha256').update(source).digest('hex'),
  owner:accounts[0].address, worker:accounts[1].address, outsider:accounts[2].address, steps:[]};
const output = new URL('../evidence/permissions-flow.json', import.meta.url);
const checkpoint = () => writeFileSync(output, JSON.stringify(result, (_,v)=>typeof v==='bigint'?v.toString():v, 2)+'\n');
let address;
async function transaction(label, client, send, expected='SUCCESS') {
  assert.equal(await client.getChainId(), 61999);
  assert.equal(BigInt(await client.request({method:'eth_gasPrice'})),0n,'Abort: gas must be free');
  const hash = await send();
  console.log(label, hash);
  const step = {label,hash}; result.steps.push(step); checkpoint();
  const receipt = await client.waitForTransactionReceipt({hash,status:'FINALIZED',interval:3000,retries:200});
  const leader = receipt.consensus_data?.leader_receipt?.[0];
  step.status = receipt.status;
  step.executionResult = leader?.execution_result ?? receipt.txExecutionResultName;
  step.error = leader?.error;
  step.returnData = leader?.result;
  if(label==='deploy') {
    address = receipt.txDataDecoded?.contractAddress ?? receipt.data?.contract_address ?? receipt.contract_address;
    result.contractAddress=address;
  }
  checkpoint();
  console.log(label, step.executionResult, address || '');
  assert.ok(leader, 'Missing execution receipt');
  if(expected==='SUCCESS') assert.equal(leader.execution_result,'SUCCESS');
  else {
    assert.notEqual(leader.execution_result,'SUCCESS');
    assert.ok(JSON.stringify(leader).includes('UNAUTHORIZED'), 'Failure must be UNAUTHORIZED');
  }
  return receipt;
}
async function write(label, client, method, args, expected) {
  return transaction(label,client,()=>client.writeContract({address,functionName:method,args,value:0n}),expected);
}
async function record() {
  const raw=await owner.readContract({address,functionName:'get_milestone',args:['permissions-demo']});
  return typeof raw==='string'?JSON.parse(raw):raw;
}
async function denied(label, client, method, args) {
  const before=await record();
  await write(label,client,method,args,'UNAUTHORIZED');
  assert.deepEqual(await record(),before);
}
try {
  await transaction('deploy', owner,()=>owner.deployContract({code:source,args:[]}));
  assert.match(address,/^0x[0-9a-fA-F]{40}$/);
  const criteria='Deliver a landing page with a headline, a signup form that stores submissions, and a mobile layout without overflow at 320px.';
  const partial='Delivered the headline and working signup form with database storage. The mobile layout currently overflows at 320px and the remaining mobile layout fix will be delivered in the next revision.';
  const complete='Delivered the headline, working signup form and database storage. Fixed the mobile CSS and verified the layout at 320px, 360px and 768px: no overflow and the signup form stores test submissions successfully.';
  await write('create',owner,'create_milestone',['permissions-demo','Landing page',criteria,accounts[1].address]);
  assert.equal((await record()).worker,accounts[1].address.toLowerCase());
  await denied('outsider-cannot-submit',outsider,'submit_evidence',['permissions-demo',complete]);
  await write('worker-submit',worker,'submit_evidence',['permissions-demo',partial]);
  await denied('outsider-cannot-assess',outsider,'assess_milestone',['permissions-demo']);
  await denied('worker-cannot-assess',worker,'assess_milestone',['permissions-demo']);
  await write('owner-assess-partial',owner,'assess_milestone',['permissions-demo']);
  result.partialRecord=await record(); checkpoint();
  assert.equal(result.partialRecord.verdict,'NEEDS_WORK','Revision flow requires NEEDS_WORK');
  await denied('outsider-cannot-revise',outsider,'submit_evidence',['permissions-demo',complete]);
  await denied('owner-cannot-revise',owner,'submit_evidence',['permissions-demo',complete]);
  await write('worker-revise',worker,'submit_evidence',['permissions-demo',complete]);
  await write('owner-assess-final',owner,'assess_milestone',['permissions-demo']);
  result.finalRecord=await record();
  assert.equal(result.finalRecord.status,'ASSESSED');
  assert.equal(result.finalRecord.evidence_count,2);
  assert.equal(result.finalRecord.assessment_count,2);
  result.verified=true; checkpoint();
  console.log('PERMISSIONS_FLOW_VERIFIED',address);
  process.exit(0);
} catch(error) {
  result.failure=String(error); checkpoint(); console.error(error); process.exit(1);
}
