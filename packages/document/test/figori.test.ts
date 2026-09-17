
import {expect,test} from "bun:test";
import {importDocument,parseFigori,serializeFigori} from "../src/index";
test("frontmatter keeps exact body bytes, identities and settings across round trips",()=>{
 for(const source of ["","\n","\n\nfirst\r\nsecond\nthird\r","quote \"\"\" and slash \\\nend\\\n","שלום 😀\t\u0000\u0001\n+++\nbody after delimiter\n"]){
  const doc=importDocument(source,{format:"markdown",settings:{timezone:"Europe/Paris",anchor:{mode:"fixed",date:"2024-02-29"},billing:"include-partial"}});
  const text=serializeFigori(doc), restored=parseFigori(text);
  expect(text.startsWith("+++\n")).toBe(true);
  expect(restored.source).toBe(source);
  expect(new TextEncoder().encode(restored.source)).toEqual(new TextEncoder().encode(source));
  expect(restored.id).toBe(doc.id);
  expect(restored.lines.map(l=>l.id)).toEqual(doc.lines.map(l=>l.id));
  expect(restored.settings).toEqual(doc.settings);
  expect(restored.format).toBe("markdown");
  expect(serializeFigori(restored)).toBe(text);
 }
});
test("rejects absent delimiters, future schemas, unknown metadata, duplicates and source mismatches",()=>{
 const doc=importDocument("one\ntwo",{format:"numi"}),valid=serializeFigori(doc);
 for(const text of [
  " "+valid, valid.slice(4), valid.replace("\n+++\n","\n+++"), valid.replace("schema_version = 1","schema_version = 2"),
  valid.replace("format = \"figori\"","format = \"other\""),
  valid.replace("+++\n","+++\nunknown = true\n"),
  valid.replace(doc.lines[1]!.id,doc.lines[0]!.id),
  valid+"\nextra",
  valid.replace("timezone = \"Asia/Jerusalem\"","timezone = \"Bad/Zone\""),
  valid.replace("[settings]","[settings]\nunknown = true"),
 ]) expect(()=>parseFigori(text)).toThrow();
 expect(()=>parseFigori("+++\nformat = [1 #")).toThrow();
 expect(()=>serializeFigori({...doc,source:"different"})).toThrow();
});
test("CRLF framing accepted without body trimming and metadata comments normalize",()=>{
 const doc=importDocument("\r\n+++\r\nraw\n",{format:"numi"});
 const valid=serializeFigori(doc);const end=valid.indexOf("\n+++\n")+5;
 const framed=valid.slice(0,end).replace(/\n/g,"\r\n")+valid.slice(end);
 expect(parseFigori(framed).source).toBe(doc.source);
 const commented=valid.replace("+++\n","+++\n# external note\n");
 expect(parseFigori(commented).source).toBe(doc.source);
 expect(serializeFigori(parseFigori(commented))).not.toContain("# external note");
});
