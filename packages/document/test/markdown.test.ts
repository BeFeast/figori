import {expect,test} from "bun:test";
import {importDocument,evaluateDocument,serializeMarkdown} from "../src/index";
import {evaluateExpression} from "../../core/src/index";
const ctx={now:"2026-09-17T12:00:00Z"};
test("Markdown fences preserve bytes and never leak assignments or references",()=>{
 const source=["# Notes","x = 2","````ts","x = 999","```","x","~~~~","````","x * 3","~~~","y = 4","~~~~~","y","```","x = 8"].join("\r\n");
 const doc=importDocument(source,{format:"markdown"});
 const r=evaluateDocument(doc,evaluateExpression,ctx);
 expect(r.lines[8]?.evaluation?.formatted).toBe("6");
 expect(r.variables.x).toEqual({kind:"number",amount:"2"});
 expect(r.variables.y).toBeUndefined();
 for(const i of [2,3,4,5,6,7,9,10,11,13,14]) expect(r.lines[i]?.evaluation).toBeUndefined();
 expect(serializeMarkdown(doc).text).toBe(source);
});
test("Markdown prose formatting is inert while plain calculations and numi remain active",()=>{
 const source=["- price = 2","1. 3 + 4","**3 + 4**","_3 + 4_","Text with `x = 99`","[cost](x)","    x = 20","> x = 30","x = 2","x * 3"].join("\n");
 const r=evaluateDocument(importDocument(source,{format:"markdown"}),evaluateExpression,ctx);
 expect(r.lines.slice(0,8).every(l=>!l.evaluation)).toBe(true);
 expect(r.lines[9]?.evaluation?.formatted).toBe("6");
 const numi=evaluateDocument(importDocument("    x = 20\nx",{format:"numi"}),evaluateExpression,ctx);
 expect(numi.lines[1]?.evaluation?.formatted).toBe("20");
});
test("results export is inert and source export remains exact",()=>{
 const source="x = 2\r\nx * 3"; const doc=importDocument(source,{format:"markdown"});
 const evaluated=evaluateDocument(doc,evaluateExpression,ctx);
 const exported=serializeMarkdown(doc,{evaluated});
 expect(exported.text).toContain("> Result: 6");
 expect(exported.text).not.toContain("figori-result:");
 expect(serializeMarkdown(doc,{evaluated}).text).toBe(exported.text);
 const reopened=evaluateDocument(importDocument(exported.text,{format:"markdown"}),evaluateExpression,ctx);
 expect(reopened.lines.filter(l=>l.evaluation).map(l=>l.evaluation?.formatted)).toEqual(["2","6"]);
 expect(doc.source).toBe(source);expect(serializeMarkdown(doc).text).toBe(source);
 const malicious={lines:[{...doc.lines[0]!,evaluation:{ok:true,formatted:"-->\nx = 100\n<!--",diagnostics:[]}}]};
 const safe=serializeMarkdown(doc,{evaluated:malicious}).text;
 expect(safe).toContain("&gt;");
 expect(safe).toContain("> x = 100");
 expect(evaluateDocument(importDocument(safe,{format:"markdown"}),evaluateExpression,ctx).variables.x).toEqual({kind:"number",amount:"2"});
});test("diagnostic export is readable and multiline text remains quoted",()=>{
 const doc=importDocument("unknown ??",{format:"markdown"});
 const evaluated={lines:[{...doc.lines[0]!,evaluation:{ok:false,diagnostics:[{code:"bad",message:"Missing *value*\nUse [amount]"}]}}]};
 const result=serializeMarkdown(doc,{evaluated}).text;
 expect(result).toContain("> Diagnostic: Missing");
 expect(result).toContain("> Use");
 expect(result).not.toContain('"diagnostics"');
 expect(importDocument(result,{format:"markdown"}).lines.filter(l=>l.kind==="expression")).toHaveLength(1);
});
