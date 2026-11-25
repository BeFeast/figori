// Bun-only asset generation; vector source is authoritative. Run with the
// pinned tooling dependency declared in assets/brand/package.json.
import { loadSync } from "opentype.js";
import { join } from "node:path";
const root = import.meta.dir;
const font = loadSync(join(root, "fonts/SpaceGrotesk-Bold.otf"));
const colors = { bg: "#0b0c0d", surface: "#141618", raised: "#1c1f21", recessed: "#101112", tint: "#15100f", ac: "#b8443c", ac2: "#d9776d", ac3: "#e59c92", text: "#e8e6e3" };
const geometry = [
  "M32 87H96V231Q96 239 88 234L42 207Q32 201 32 189Z",
  "M32 88L87 33Q96 24 108 24H192C209.7 24 224 38.3 224 56S209.7 88 192 88Z",
  "M32 170L81 121Q88 114 98 114H176C191.5 114 204 126.5 204 142S191.5 170 176 170Z",
];
function mark(fills: string[]) { return geometry.map((d,i)=>`<path fill="${fills[i]}" d="${d}"/>`).join(""); }
const primary = mark([colors.ac, colors.ac, colors.ac3]);
function svg(width: number, height: number, body: string, label: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">${body}</svg>\n`;
}
function outline(text: string, x: number, y: number, size: number, fill: string) {
  return `<path fill="${fill}" d="${font.getPath(text,x,y,size,{kerning:true}).toPathData(3)}"/>`;
}
async function write(name: string, data: string) { await Bun.write(join(root,name),data); }
await write("figori-mark.svg",svg(256,256,primary,"Figori folded F"));
await write("figori-mark-mono.svg",svg(256,256,mark(geometry.map(()=>colors.bg)),"Figori monochrome F"));
await write("figori-mark-inverse.svg",svg(256,256,mark(geometry.map(()=>colors.text)),"Figori inverse F"));
await write("figori-mark-lime.svg",svg(256,256,mark(geometry.map(()=>colors.ac3)),"Figori light accent F"));
await write("figori-app.svg",svg(512,512,`<rect width="512" height="512" rx="112" fill="${colors.bg}"/><g transform="translate(76 60) scale(1.4)">${primary}</g>`,"Figori app icon"));
await write("figori-app-light.svg",svg(512,512,`<rect width="512" height="512" rx="112" fill="${colors.text}"/><g transform="translate(76 60) scale(1.4)">${primary}</g>`,"Figori light app icon"));
await write("figori-app-cobalt.svg",svg(512,512,`<rect width="512" height="512" rx="112" fill="${colors.surface}"/><g transform="translate(76 60) scale(1.4)">${mark(geometry.map(()=>colors.ac3))}</g>`,"Figori high contrast app icon"));
const word = outline("Figori",0,110,144,colors.bg);
const wordInverse = outline("Figori",0,110,144,colors.text);
await write("figori-wordmark.svg",svg(415,150,word,"Figori"));
await write("figori-wordmark-inverse.svg",svg(415,150,wordInverse,"Figori"));
await write("figori-lockup.svg",svg(760,256,primary+`<g transform="translate(294 57)">${word}</g>`,"Figori"));
await write("figori-lockup-inverse.svg",svg(760,256,primary+`<g transform="translate(294 57)">${wordInverse}</g>`,"Figori"));
const social = `<rect width="1200" height="630" fill="${colors.bg}"/>
<g transform="translate(68 74) scale(.55)">${mark(geometry.map(()=>colors.ac3))}</g>
${outline("Figori",238,204,144,colors.text)}
${outline("Your numbers, in context.",78,340,66,colors.text)}
${outline("Write naturally. Calculate precisely.",82,405,36,colors.text)}
<rect x="80" y="484" width="730" height="60" rx="30" fill="${colors.ac3}"/>
${outline("Desktop  /  Raycast  /  Terminal  /  Omarchy",108,524,28,colors.bg)}
<g transform="translate(875 336) rotate(-10) scale(.9)">${mark(geometry.map(()=>colors.ac3))}</g>`;
await write("figori-social.svg",svg(1200,630,social,"Figori: numbers with context. Desktop, Raycast, Terminal and Omarchy."));
await write("palette.json",JSON.stringify({name:"Figori",paletteSource:"HedRoom",colors,displayFont:"Space Grotesk",numericFont:"IBM Plex Mono",nativeUiFonts:"system defaults"},null,2)+"\n");
