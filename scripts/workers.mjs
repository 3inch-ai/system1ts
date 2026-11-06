import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
const modulePath = process.env.SYSTEM1TS_WORKER_MODULE ?? "./dist/index.js";
const code = `
import { createClient, systemOne, openaiDecisions } from ${JSON.stringify(modulePath)};
export default { async fetch() {
  const results=[];
  for (const adapter of [systemOne,openaiDecisions]) {
    const client=createClient({adapter,baseURL:'https://fixture.invalid/prefix/v1',model:'test',fetch:async(url,init)=>{
      const body=JSON.parse(init.body);
      if (!url.includes('/prefix/v1/')) throw Error('prefix lost');
      const answers=adapter===systemOne?{p:{type:'noul',noul:0.75}}:[{name:'p',type:'predicate',probability:0.75}];
      return Response.json({model:'worker-fixture',answers});
    }});
    const r=await client.decide({input:{ticket:'help'},questions:{p:{type:'predicate',instructions:'?'}}});
    if(r.answers.p.status!=='ok'||r.answers.p.probability!==0.75) throw Error('normalization failed');
    results.push({status:r.answers.p.status,model:r.actualModel});
  }
  return Response.json({results});
}};`;
const bundle = await build({
  stdin: {
    contents: code,
    resolveDir: process.cwd(),
    sourcefile: "worker-smoke.js",
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  write: false,
});
const mf = new Miniflare({
  modules: true,
  script: bundle.outputFiles[0].text,
  compatibilityDate: "2026-07-30",
});
try {
  const response = await mf.dispatchFetch("http://worker.test");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, {
    results: [
      { status: "ok", model: "worker-fixture" },
      { status: "ok", model: "worker-fixture" },
    ],
  });
  console.log(
    "PASS: Cloudflare Workers workerd/Miniflare, both protocols, injected offline fetch; no cloud deployment",
  );
} finally {
  await mf.dispose();
}
