import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importDocument } from "@my-numi/document";
import { importFile, exportNumi, saveDocument, loadDocument } from "@my-numi/document/storage";
import { applyEdit, createEditor, cursorPosition, displayWidth, fit, newlineFor } from "../src/editor";
import { calculate } from "../src/index";

const directories:string[]=[];
async function temporary(){const path=await mkdtemp(join(tmpdir(),"my-numi-tui-"));directories.push(path);return path;}
afterEach(async()=>{await Promise.all(directories.splice(0).map(path=>rm(path,{recursive:true,force:true})));});

test("editing a prior assignment immediately replaces dependent calculation results",()=>{
  let state=createEditor(importDocument("rent = 10\nrent * 2",{format:"numi"}));
  const before=calculate(state,{status:"unavailable"},"2031-01-01T00:00:00Z");
  expect(before.lines[1]?.evaluation?.formatted).toBe("20");
  state=applyEdit(state,{type:"end"});
  state=applyEdit(state,{type:"backspace"});
  state=applyEdit(state,{type:"insert",text:"5"});
  const after=calculate(state,{status:"unavailable"},"2031-01-01T00:00:00Z");
  expect(state.document.source).toBe("rent = 15\nrent * 2");
  expect(after.lines[1]?.evaluation?.formatted).toBe("30");
  expect(after.lines[1]?.id).toBe(before.lines[1]?.id);
});

test("Unicode cursor movement and deletion never split surrogate pairs or CRLF",()=>{
  let state=createEditor(importDocument("אב😀\r\n2+2",{format:"numi"}));
  state=applyEdit(state,{type:"end"});
  expect(cursorPosition(state).column).toBe(3);
  state=applyEdit(state,{type:"left"});
  state=applyEdit(state,{type:"delete"});
  expect(state.document.source).toBe("אב\r\n2+2");
  state=applyEdit(state,{type:"right"});
  state=applyEdit(state,{type:"backspace"});
  expect(state.document.source).toBe("אב2+2");
  expect(newlineFor(importDocument("a\r\nb",{format:"numi"}))).toBe("\r\n");
});

test("blank final line can be edited and vertical movement respects Unicode columns",()=>{
  let state=createEditor(importDocument("😀x\n",{format:"numi"}));
  state=applyEdit(state,{type:"end"});
  state=applyEdit(state,{type:"down"});
  expect(cursorPosition(state).line).toBe(1);
  state=applyEdit(state,{type:"insert",text:"7"});
  expect(calculate(state,{status:"unavailable"}).lines[1]?.evaluation?.formatted).toBe("7");
  state=applyEdit(state,{type:"up"});
  expect(cursorPosition(state).column).toBe(1);
});

test("terminal escape sequences from pasted source are data and cannot control the terminal",()=>{
  let state=createEditor();
  state=applyEdit(state,{type:"insert",text:"2+2\x1b[31m"});
  expect(state.document.source).not.toContain("\x1b");
  expect(fit("\x1b[2Junsafe",12)).not.toContain("\x1b");
  expect(displayWidth("a😀界")).toBe(5);
});

test("save restart and export preserve worksheet settings and source",async()=>{
  const directory=await temporary();
  const input=join(directory,"input.md");
  const original="# Synthetic\n1 month in days = historical\n";
  await writeFile(input,original);
  let state=createEditor(await importFile(input));
  state.document.settings={timezone:"Asia/Jerusalem",anchor:{mode:"fixed",date:"2032-02-01"},billing:"include-partial"};
  state=applyEdit(state,{type:"end"});
  state=applyEdit(state,{type:"insert",text:" notes"});
  await saveDocument(state.document,{directory:join(directory,"worksheets")});
  const restarted=createEditor((await loadDocument(state.document.id,{directory:join(directory,"worksheets")})).document);
  expect(restarted.document.source).toBe(state.document.source);
  expect(restarted.document.settings).toEqual(state.document.settings);
  expect(calculate(restarted,{status:"unavailable"},"2031-01-01T00:00:00Z").lines[1]?.evaluation?.formatted).toContain("29");
  const output=join(directory,"export.numi");
  await exportNumi(restarted.document,output);
  expect(await readFile(input,"utf8")).toBe(original);
  expect((await importFile(output)).settings).toEqual(restarted.document.settings);
});

test("currency absence diagnoses only that line; fixed snapshot works without network",()=>{
  const state=createEditor(importDocument("10 nis in usd\n2+3",{format:"numi"}));
  const missing=calculate(state,{status:"unavailable"});
  expect(missing.lines[0]?.evaluation?.ok).toBeFalse();
  expect(missing.lines[1]?.evaluation?.formatted).toBe("5");
  const cached=calculate(state,{status:"stale",snapshot:{base:"ILS",rates:{USD:"0.25"},source:"synthetic",asOf:"2031-01-01"}});
  expect(cached.lines[0]?.evaluation?.formatted).toContain("2.5");
});

test("non-terminal invocation fails clearly without emitting terminal control sequences",async()=>{
  const child=Bun.spawn([process.execPath,join(import.meta.dir,"../src/main.ts")],{stdin:"ignore",stdout:"pipe",stderr:"pipe"});
  expect(await child.exited).toBe(1);
  const output=await new Response(child.stdout).text();
  const error=await new Response(child.stderr).text();
  expect(output).toBe("");
  expect(error).toContain("requires a terminal");
});
