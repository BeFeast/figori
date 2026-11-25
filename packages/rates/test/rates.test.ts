import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRates, refreshRates, PROVIDER_NAME, PROVIDER_URL, type RefreshOptions } from "../src/index";

const directories: string[] = [];
async function options(): Promise<RefreshOptions> {
  const directory = await mkdtemp(join(tmpdir(), "my-numi-rates-"));
  directories.push(directory);
  return { directory, now: new Date("2031-06-10T12:00:00Z") };
}
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, {recursive:true,force:true}))); });
const valid = {date:"2031-06-09",base:"ILS",quote:"USD",rate:0.25};
function mock(data: unknown = valid) { return async () => ({ok:true,status:200,json:async()=>data}); }

test("explicit refresh sends only public pair and persists qualified provenance", async () => {
  const opts = await options();
  expect(await loadRates(opts)).toEqual({status:"unavailable"});
  const requests: unknown[] = [];
  const result = await refreshRates({...opts,fetch:async (url,init)=>{
    requests.push({url,method:init?.method,body:init?.body});
    return {ok:true,status:200,json:async()=>valid};
  }});
  expect(requests).toEqual([{url:PROVIDER_URL,method:undefined,body:undefined}]);
  expect(result.status).toBe("fresh");
  expect(result.snapshot).toEqual({base:"ILS",rates:{USD:"0.25"},source:PROVIDER_NAME,asOf:"2031-06-09"});
  expect((await loadRates(opts)).snapshot).toEqual(result.snapshot);
});

test("staleness follows provider date, not a recent download timestamp", async () => {
  const opts = await options();
  const result = await refreshRates({...opts,fetch:mock({...valid,date:"2031-06-01"})});
  expect(result.status).toBe("stale");
  expect(result.fetchedAt).toBe(opts.now!.toISOString());
  expect((await loadRates({...opts,maxAgeMs:30*86400000})).status).toBe("fresh");
});

test("offline refresh retains stale cached rate with visible error", async () => {
  const opts = await options();
  await refreshRates({...opts,fetch:mock(valid)});
  const result = await refreshRates({...opts,now:new Date("2031-07-01T12:00:00Z"),fetch:async()=>{throw new Error("offline")}});
  expect(result.status).toBe("stale");
  expect(result.snapshot?.rates.USD).toBe("0.25");
  expect(result.error).toContain("offline");
});

test("missing cache and provider failure never fabricate a rate", async () => {
  const opts = await options();
  const result = await refreshRates({...opts,fetch:async()=>({ok:false,status:503,json:async()=>({})})});
  expect(result.status).toBe("unavailable");
  expect(result.snapshot).toBeUndefined();
  expect(result.error).toContain("503");
});

test("invalid pair, dates, amounts and response shapes are rejected without overwriting cache", async () => {
  const opts = await options();
  await refreshRates({...opts,fetch:mock()});
  const invalid = [
    {...valid,base:"EUR"}, {...valid,rate:0}, {...valid,rate:-1},
    {...valid,rate:"NaN"}, {...valid,rate:Infinity}, {...valid,rate:"1; rm"},
    {...valid,date:"2031-02-29"}, {...valid,date:"2031-06-11"}, null, [],
  ];
  for (const data of invalid) {
    const result = await refreshRates({...opts,fetch:mock(data)});
    expect(result.error).toContain("refresh failed");
    expect(result.snapshot?.rates.USD).toBe("0.25");
  }
  expect((await loadRates(opts)).snapshot?.asOf).toBe("2031-06-09");
});

test("older provider snapshot does not regress cache", async () => {
  const opts = await options();
  await refreshRates({...opts,fetch:mock()});
  const result=await refreshRates({...opts,fetch:mock({...valid,date:"2031-06-08",rate:0.5})});
  expect(result.snapshot?.rates.USD).toBe("0.25");
  expect(result.error).toContain("older rate");
});

test("corrupt or modified cache is unavailable, not trusted", async () => {
  const opts = await options();
  await refreshRates({...opts,fetch:mock()});
  const path=join(opts.directory,"ecb-ils-usd.v1.json");
  const cached=JSON.parse(await readFile(path,"utf8"));
  cached.snapshot.rates.USD="900";
  await writeFile(path,JSON.stringify(cached));
  const result=await loadRates(opts);
  expect(result.status).toBe("unavailable");
  expect(result.error).toContain("checksum");
  await writeFile(path,"{interrupted");
  expect((await loadRates(opts)).snapshot).toBeUndefined();
});

test("cache write failure still reports usable fetched rate and failed persistence",async()=>{
  const opts=await options();
  const file=join(opts.directory,"file");
  await writeFile(file,"occupied");
  const result=await refreshRates({...opts,directory:file,fetch:mock()});
  expect(result.status).toBe("fresh");
  expect(result.snapshot?.rates.USD).toBe("0.25");
  expect(result.error).toContain("cache save failed");
});

test("abort errors preserve unavailable state and timeout is passed to fetch",async()=>{
  const opts=await options();
  let signal:AbortSignal|null|undefined;
  const result=await refreshRates({...opts,timeoutMs:1,fetch:async(_url,init)=>{
    signal=init?.signal;
    await new Promise(resolve=>setTimeout(resolve,5));
    signal?.throwIfAborted();
    return {ok:true,status:200,json:async()=>valid};
  }});
  expect(signal?.aborted).toBeTrue();
  expect(result.status).toBe("unavailable");
  expect(result.error).toContain("refresh failed");
});
