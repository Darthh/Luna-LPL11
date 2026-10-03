// Documentation-only renderer. Mermaid is fetched through npm exec, without
// adding it to the app's dependencies or changing the root lockfile.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../..');
const scratch = mkdtempSync(path.join(os.tmpdir(), 'luna-architecture-'));
const readme = path.join(directory, 'README.md');
const diagramDirectory = path.join(directory, 'diagrams');
mkdirSync(diagramDirectory, { recursive: true });
const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
if (!existsSync(npmCli)) throw new Error('Run this renderer with npm exec -- node docs/architecture/render.mjs so npm_execpath is available.');
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

let source = readFileSync(readme, 'utf8').replace(/\r\n/g, '\n');
const files = execFileSync('git', ['ls-files', 'app'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/);
const publicPath = file => '/' + file.replace(/^app\//, '').replace(/\/(page|route)\.js$/, '').replace(/^(page|route)\.js$/, '').split('/').filter(segment => !/^\(.+\)$/.test(segment)).join('/');
const pages = files.filter(file => /(^|\/)page\.js$/.test(file));
const routes = files.filter(file => /(^|\/)route\.js$/.test(file));
const inventory = [
  `<!-- ROUTE_INVENTORY -->\n\n**${pages.length} page entry points and ${routes.length} HTTP route handlers.**\n`,
  '| Page | Source |', '|---|---|',
  ...pages.map(file => `| \`${publicPath(file)}\` | [${file}](../../${file}) |`),
  '', '| HTTP path | Exported methods | Source |', '|---|---|---|',
  ...routes.map(file => {
    const content = readFileSync(path.join(root, file), 'utf8');
    const methods = [...new Set([...content.matchAll(/export\s+(?:async\s+function|function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)].map(match => match[1]))];
    for (const match of content.matchAll(/export\s+(?:const\s+)?\{([^}]+)\}/g)) {
      for (const method of match[1].match(/\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g) || []) if (!methods.includes(method)) methods.push(method);
    }
    return `| \`${publicPath(file)}\` | ${methods.sort().join(', ') || 'See handler exports'} | [${file}](../../${file}) |`;
  }),
  '\n<!-- END_ROUTE_INVENTORY -->',
].join('\n');
source = source.replace(/<!-- ROUTE_INVENTORY -->[\s\S]*?(?:<!-- END_ROUTE_INVENTORY -->|(?=\n## Regenerating))/, inventory);
writeFileSync(readme, source);
const charts = [...source.matchAll(/## (\d+)\. ([^\n]+)[\s\S]*?```mermaid\n([\s\S]*?)```/g)].map(match => ({ number: match[1], title: match[2], code: match[3] }));
if (charts.length !== 8) throw new Error(`Expected 8 diagrams, found ${charts.length}.`);
const input = path.join(scratch, 'atlas.md');
writeFileSync(input, charts.map(chart => `## ${chart.number}. ${chart.title}\n\n\`\`\`mermaid\n${chart.code}\`\`\``).join('\n\n'));
const browserCandidates = [process.env.ARCHITECTURE_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
const executablePath = browserCandidates.find(candidate => existsSync(candidate));
const browserConfig = path.join(scratch, 'browser.json');
writeFileSync(browserConfig, JSON.stringify(executablePath ? { executablePath } : {}));
function render(args) {
  const result = spawnSync(process.execPath, [npmCli, 'exec', '--yes', '--package', '@mermaid-js/mermaid-cli@12.0.0', '--', 'mmdc', ...args, '-c', path.join(directory, 'mermaid.config.json'), '-p', browserConfig, '-j', '2'], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Mermaid renderer exited with ${result.status}.`);
}
render(['-i', input, '-o', path.join(scratch, 'rendered.md'), '-a', diagramDirectory, '-e', 'svg']);
render(['-i', input, '-o', path.join(scratch, 'print.md'), '-a', scratch, '-e', 'pdf']);
const overviewInput = path.join(scratch, 'overview.mmd');
writeFileSync(overviewInput, charts[0].code);
render(['-i', overviewInput, '-o', path.join(directory, 'overview.png'), '--size', '3200']);

const pdf = await PDFDocument.create();
pdf.setTitle('Luna Terminal - complete architecture');
pdf.setAuthor('Luna Terminal');
pdf.setSubject('Repository architecture snapshot, October 3, 2026');
const font = await pdf.embedFont(StandardFonts.Helvetica);
for (const chart of charts) {
  const chartPdf = path.join(scratch, `print-${chart.number}.pdf`);
  const loaded = await PDFDocument.load(readFileSync(chartPdf));
  const embedded = await pdf.embedPage(loaded.getPage(0));
  const width = Math.max(embedded.width, 1000);
  const page = pdf.addPage([width, embedded.height + 100]);
  page.drawText(`LUNA TERMINAL  /  ${chart.number.padStart(2, '0')}`, { x: 28, y: page.getHeight() - 28, size: 12, font, color: rgb(.30, .38, .50) });
  page.drawText(chart.title, { x: 28, y: page.getHeight() - 55, size: 22, font, color: rgb(.08, .14, .24) });
  page.drawPage(embedded, { x: (width - embedded.width) / 2, y: 30 });
  page.drawText('Source snapshot: October 3, 2026 | main at e332191 | solid = implemented; dashed = conditional or planned (see labels)', { x: 28, y: 12, size: 10, font, color: rgb(.30, .38, .50) });
}
writeFileSync(path.join(directory, 'luna-terminal-architecture.pdf'), await pdf.save());

const svgs = charts.map(chart => {
  const svgPath = path.join(diagramDirectory, `rendered-${chart.number}.svg`);
  if (!existsSync(svgPath)) throw new Error(`Missing rendered SVG: ${svgPath}`);
  let svg = readFileSync(svgPath, 'utf8').replace(/<\?xml[^>]*\?>/, '');
  // Mermaid uses repeated IDs across independent exports. Prefix all IDs and
  // internal references when embedding several drawings in the same document.
  const ids = [...new Set([...svg.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]))];
  for (const id of ids.sort((a, b) => b.length - a.length)) {
    const replacement = `view${chart.number}-${id}`;
    svg = svg.replaceAll(`id="${id}"`, `id="${replacement}"`).replaceAll(`#${id}`, `#${replacement}`);
  }
  return svg;
});
const descriptions = [
  'Clients, web hosting, AI execution, research processing, databases and market feeds.',
  'Product surfaces, analytical modules, external providers and bundled datasets.',
  'Hosted and local chat context, tool routing, evidence, memory and document drafts.',
  'Uploads, asynchronous extraction, embeddings, document retrieval and research archives.',
  'Authentication, account records, chat persistence, quotas, exports and alert delivery.',
  'Electron isolation, local Ollama execution, hosted navigation and installer builds.',
  'Public HTTP MCP, browser WebMCP and private internal agent tools.',
  'CI, gated deployment, infrastructure code, runtime permissions and monitoring.',
];
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Luna Terminal - Architecture atlas</title>
<style>
:root{color-scheme:light;--ink:#14243a;--muted:#536780;--line:#d5dfe9;--paper:#fff;--wash:#f3f6fa}
*{box-sizing:border-box}body{margin:0;background:var(--wash);color:var(--ink);font:16px/1.55 'Segoe UI',Arial,sans-serif}
header{padding:36px clamp(20px,5vw,76px);background:var(--ink);color:#fff}header .brand{font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#b5c9e1}h1{font-size:36px;line-height:1.2;margin:12px 0}header p{max-width:850px;color:#d3dfed;margin:12px 0 0}.links{display:flex;flex-wrap:wrap;gap:12px;margin-top:22px}.links a{color:#fff;text-underline-offset:4px}
nav{padding:18px clamp(20px,5vw,76px);display:flex;flex-wrap:wrap;gap:8px;background:var(--paper);border-bottom:1px solid var(--line)}nav a{padding:8px 12px;text-decoration:none;color:var(--ink);border:1px solid var(--line);border-radius:4px;font-size:14px}nav a:hover{background:var(--wash)}a:focus-visible,button:focus-visible{outline:3px solid #527ca9;outline-offset:3px}
main{padding:24px clamp(16px,4vw,60px);max-width:1800px;margin:auto}section{margin:0 0 32px;background:var(--paper);border:1px solid var(--line);border-radius:6px;scroll-margin-top:20px}.heading{padding:24px 24px 16px}.eyebrow{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.13em;color:var(--muted)}h2{font-size:25px;margin:5px 0}section p{color:var(--muted);margin:4px 0 0}.actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:14px}button,.actions a{font:inherit;font-size:14px;color:var(--ink);background:var(--paper);border:1px solid var(--line);border-radius:4px;padding:6px 11px;text-decoration:none;cursor:pointer}.actions .hint{font-size:13px;color:var(--muted)}.viewport{overflow:auto;padding:18px 24px 28px;border-top:1px solid var(--line)}.viewport svg{display:block;max-width:none;width:100%;height:auto;margin:0 auto}.viewport.actual svg{width:auto}.note{padding:20px 24px;margin:0 0 28px;border-left:3px solid #8aa0bf;background:var(--paper);color:var(--muted)}footer{padding:12px 24px 36px;color:var(--muted);font-size:14px}footer a{color:var(--ink)}
@media(max-width:600px){h1{font-size:29px}.heading{padding:18px}.viewport{padding:14px}nav a{font-size:13px}.actions .hint{width:100%}}
@media print{header,nav,.note,footer,.actions{display:none}main{padding:0}section{border:0;break-after:page;margin:0}.viewport{overflow:visible;border:0}.viewport svg,.viewport.actual svg{width:100%;max-height:80vh}.heading{padding:12px}h2{font-size:20px}}
</style></head><body>
<header><div class="brand">Luna Terminal / Engineering</div><h1>Complete architecture atlas</h1><p>Eight views of the terminal, from the client to market feeds and AWS infrastructure. Source snapshot: October 3, 2026, main at e332191. Cloud deployment status is repository-reported; this is not a new AWS inventory.</p><div class="links"><a href="luna-terminal-architecture.pdf">Architecture PDF</a><a href="overview.png">Overview PNG</a><a href="README.md">Editable Mermaid + complete route inventory</a></div></header>
<nav aria-label="Architecture views">${charts.map(chart => `<a href="#view-${chart.number}">${chart.number}. ${escape(chart.title)}</a>`).join('')}</nav>
<main><div class="note">Solid arrows: implemented flow. Dashed arrows: optional, control-plane or planned connections; read each label. Planned services and provisioned but unused storage are explicitly named. Use “Readable size” to inspect dense diagrams and scroll within the drawing.</div>
${charts.map((chart, index) => `<section id="view-${chart.number}" aria-labelledby="title-${chart.number}"><div class="heading"><div class="eyebrow">Architecture / ${chart.number.padStart(2, '0')}</div><h2 id="title-${chart.number}">${escape(chart.title)}</h2><p>${descriptions[index]}</p><div class="actions"><button type="button" aria-pressed="false" aria-controls="drawing-${chart.number}" data-view="${chart.number}">Readable size</button><a href="diagrams/rendered-${chart.number}.svg">Open SVG</a><span class="hint">SVG and PDF remain sharp when enlarged.</span></div></div><div class="viewport" id="drawing-${chart.number}" role="region" aria-label="${escape(chart.title)} diagram">${svgs[index]}</div></section>`).join('\n')}
</main><footer>Source and caveats: <a href="README.md">architecture documentation</a> · <a href="../HANDOFF.md">project handoff</a>. Includes ${pages.length} page entry points and ${routes.length} HTTP route handlers. No external scripts, fonts or network access are needed to view this atlas.</footer>
<script>for(const button of document.querySelectorAll('[data-view]')){button.addEventListener('click',()=>{const drawing=document.getElementById('drawing-'+button.dataset.view);const actual=drawing.classList.toggle('actual');button.setAttribute('aria-pressed',String(actual));button.textContent=actual?'Fit to width':'Readable size';});}</script>
</body></html>`;
writeFileSync(path.join(directory, 'index.html'), html);
console.log(`Architecture exports complete: ${charts.length} SVG views, overview PNG, 8-page PDF, offline HTML, ${pages.length} pages / ${routes.length} route handlers.`);
