import { normalizeFinnhubNews, rankNews } from './lib/research.js';
import { upcomingEvents } from './lib/economicEvents.js';
import fs from 'fs';
const src=fs.readFileSync('app/api/event-news/route.js','utf8');
// import the real helpers from the route so this exercises shipped code
const mod=await import('data:text/javascript,'+encodeURIComponent(
  src.match(/function eventTerms[\s\S]*?\n}/)[0]+'\n'+
  src.match(/const MACRO_TERMS = \[.*\];/)[0]+'\n'+
  src.match(/const FOREIGN = \/.*\/i;/)[0]+'\n'+
  src.match(/function isForeign[\s\S]*?\n}/)[0]+'\n'+
  'export {eventTerms, MACRO_TERMS, isForeign};'));
const {eventTerms, MACRO_TERMS, isForeign}=mod;

// unit checks on the geography guard
console.assert(isForeign({title:"Qatar's first-quarter GDP falls 7%"}), 'Qatar should be foreign');
console.assert(!isForeign({title:"U.S. GDP growth revised higher"}), 'US should not be foreign');
console.assert(!isForeign({title:"Fed holds rates steady"}), 'Fed should not be foreign');
console.assert(!isForeign({title:"China trade talks lift U.S. stocks"}), 'US-qualified should pass');

const key=fs.readFileSync('.env.local','utf8').match(/FINNHUB_API_KEY=(.*)/)[1].trim();
const r=await fetch('https://finnhub.io/api/v1/news?category=general&minId=0',{headers:{'X-Finnhub-Token':key}});
const news=normalizeFinnhubNews(await r.json());
const optionalTerms=["forecast","expect","economist","market","upcoming"];
const kindOptional=[...optionalTerms,"U.S.","United States","American"];
const macro=rankNews(news,{termGroups:[MACRO_TERMS],optionalTerms});
const used=new Set();
const pick=(ranked)=>{const f=ranked.filter(i=>!used.has(i.url)&&!isForeign(i));return f.slice(0,5).find(i=>i.image)??f[0]??null;};

function eventKind(t){return t.replace(/\s*No\.\s*\d+/i,'').replace(/\s*\(Day \d+\)/i,'').replace(/^GDP\s+\w+\s+Estimate$/i,'GDP Estimate').trim();}
const kinds=[...new Set(upcomingEvents(5).map(e=>eventKind(e.title)))];
let ok=0;
for(const kind of kinds){
  const ranked=rankNews(news,{termGroups:[eventTerms(kind)],optionalTerms:kindOptional});
  const direct=pick(ranked);
  const a=direct??pick(macro);
  if(a){used.add(a.url);ok++;}
  console.log((a?'OK  ':'FAIL')+' | '+kind.padEnd(26)+' | '+(direct?'direct  ':'fallback')+' | img='+(a?!!a.image:'-')+' | '+(a?a.title.slice(0,55):'NONE'));
}
console.log('\ncovered '+ok+'/'+kinds.length+'  unique stories: '+used.size);
if(ok!==kinds.length) throw new Error('some rows still have no article');
if(used.size!==ok) throw new Error('duplicate story reused across rows');
console.log('PASS');
