
// Arnsicle — client-side, citation-first generator + TTS (fixed)
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const state = JSON.parse(localStorage.getItem('arnsicle_state') || '{"history":[]}');
function save(){ localStorage.setItem('arnsicle_state', JSON.stringify(state)); }

// Theme
$('#theme').onclick = () => { document.body.classList.toggle('light'); };

// PWA install
let deferred=null;
window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); deferred=e; $('#install').style.display='inline-block'; });
$('#install').onclick = () => { if(deferred){ deferred.prompt(); deferred=null; } };
if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js'); }

// Utilities
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function setStatus(msg){ const el = $('#status'); if(el) el.textContent = msg; }
function mdEscape(s){ return s.replace(/[<>]/g, m=> m==='<'?'&lt;':'&gt;'); }
function toSentenceArray(text){
  const t = text.replace(/\s+/g,' ').trim();
  return t.split(/(?<=[.!?])\s+(?=[A-Z(])/).filter(Boolean);
}
function topSentences(text, q, max){
  const sents = toSentenceArray(text);
  const terms = q.toLowerCase().split(/\W+/).filter(Boolean);
  const scored = sents.map(s=>{
    const ls = s.toLowerCase();
    let score = 0;
    for(const t of terms){ if(ls.includes(t)) score += 1; }
    score += Math.min(3, Math.round(s.length/120)); // prefer informative length
    return {s, score};
  });
  scored.sort((a,b)=> b.score - a.score);
  return scored.slice(0, max).map(o=>o.s);
}

// Data fetching (CORS-friendly)
async function wikiSearch(query, limit=5){
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${limit}&format=json&origin=*`;
  const res = await fetch(url); if(!res.ok) throw new Error('Wikipedia search failed');
  const data = await res.json();
  return data?.query?.search || [];
}
async function wikiExtractById(pageid){
  const url = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&pageids=${pageid}&format=json&origin=*`;
  const res = await fetch(url); if(!res.ok) throw new Error('Wikipedia extract failed');
  const data = await res.json();
  const page = data?.query?.pages?.[pageid];
  if(!page) return null;
  return { title: page.title, extract: page.extract || '', url:`https://en.wikipedia.org/?curid=${pageid}` };
}
async function crossrefPapers(query, yearsBack){
  const now = new Date();
  const to = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const from = `${now.getFullYear()-yearsBack}-01-01`;
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&filter=from-pub-date:${from},until-pub-date:${to},type:journal-article&sort=published&order=desc&rows=12`;
  const res = await fetch(url);
  if(!res.ok) return [];
  const data = await res.json();
  const items = data?.message?.items || [];
  return items.map(x=> ({
    title: (Array.isArray(x.title) ? x.title[0] : x.title) || 'Untitled',
    year: (x.created && x.created['date-parts'] && x.created['date-parts'][0] && x.created['date-parts'][0][0]) || null,
    journal: (Array.isArray(x['container-title']) ? x['container-title'][0] : x['container-title']) || '',
    url: x.URL || (x.DOI ? `https://doi.org/${x.DOI}` : ''),
    doi: x.DOI || ''
  }));
}

// Article composer (extractive + citations)
function composeArticle({query, years, length, wikiDocs, papers}){
  const maxPerSection = { short: 2, medium: 4, long: 6 }[length] || 4;
  const sources = [];
  const citeIndex = (url, title) => {
    const idx = sources.findIndex(s=>s.url===url);
    if(idx>=0) return idx+1;
    sources.push({url, title});
    return sources.length;
  };

  const title = `Explainer: ${query.trim().replace(/^\w/, c=>c.toUpperCase())}`;
  const subtitle = `A cited overview using Wikipedia and Crossref from the last ${years} year(s).`;

  const overviewSents = [];
  for(const doc of wikiDocs){
    if(!doc.extract) continue;
    const picked = topSentences(doc.extract, query, Math.ceil(maxPerSection/2));
    const c = citeIndex(doc.url, doc.title);
    picked.forEach(s=> overviewSents.push(`${s} [${c}]`));
    if(overviewSents.length >= maxPerSection) break;
  }

  const developments = papers.slice(0, maxPerSection).map(p=>{
    const c = citeIndex(p.url, p.title + (p.journal?` — ${p.journal}`:''));
    const yr = p.year ? ` (${p.year})` : '';
    return `• ${p.title}${yr}${p.journal?` — *${p.journal}*`:''} [${c}]`;
  });

  const timeline = [];
  for(const doc of wikiDocs){
    const c = citeIndex(doc.url, doc.title);
    const sents = toSentenceArray(doc.extract).filter(s=> /\b(20\d{2}|19\d{2})\b/.test(s));
    sents.slice(0, maxPerSection).forEach(s=> timeline.push(`${s} [${c}]`));
    if(timeline.length >= maxPerSection) break;
  }

  const outlook = [];
  for(const doc of wikiDocs){
    const c = citeIndex(doc.url, doc.title);
    const sents = toSentenceArray(doc.extract);
    const tail = sents.slice(-Math.max(1, Math.floor(maxPerSection/2)));
    tail.forEach(s=> outlook.push(`${s} [${c}]`));
    if(outlook.length >= maxPerSection) break;
  }

  const body = [];
  if(overviewSents.length){
    body.push(`<h3>Overview</h3>`);
    overviewSents.forEach(s=> body.push(`<p>${mdEscape(s)}</p>`));
  }
  if(developments.length){
    body.push(`<h3>Key developments (last ${years} years)</h3>`);
    body.push(`<ul>${developments.map(li=>`<li>${mdEscape(li)}</li>`).join('')}</ul>`);
  }
  if(timeline.length){
    body.push(`<h3>Timeline</h3>`);
    timeline.forEach(s=> body.push(`<p>${mdEscape(s)}</p>`));
  }
  if(outlook.length){
    body.push(`<h3>Outlook</h3>`);
    outlook.forEach(s=> body.push(`<p>${mdEscape(s)}</p>`));
  }

  // Build Markdown safely (no invalid spread)
  const mdParts = [
    `# ${title}`,
    ``,
    `*${subtitle}*`,
    ``,
    `## Overview`,
    ...overviewSents
  ];
  if(developments.length){
    mdParts.push(``, `## Key developments (last ${years} years)`, ...developments);
  }
  if(timeline.length){
    mdParts.push(``, `## Timeline`, ...timeline);
  }
  if(outlook.length){
    mdParts.push(``, `## Outlook`, ...outlook);
  }
  mdParts.push(``, `## Sources`, ...sources.map((s,i)=> `${i+1}. ${s.title} — ${s.url}`));
  const md = mdParts.join('\n');

  return { title, subtitle, html: body.join('\n'), sources, markdown: md };
}

// Renderers
function renderArticle(art){
  $('#article-card').hidden = false;
  $('#art-title').textContent = art.title;
  $('#art-subtitle').textContent = art.subtitle;
  $('#art-body').innerHTML = art.html;
  const ol = $('#art-sources'); ol.innerHTML='';
  art.sources.forEach((s,i)=>{
    const li=document.createElement('li');
    const a=document.createElement('a'); a.href=s.url; a.target="_blank"; a.textContent = s.title;
    li.appendChild(a); ol.appendChild(li);
  });
  state.history.unshift({ ts: Date.now(), title: art.title, subtitle: art.subtitle, markdown: art.markdown });
  state.history = state.history.slice(0, 20);
  save();
  renderHistory();
}

function renderHistory(){
  const c = $('#history'); c.innerHTML='';
  if(!state.history.length){ c.innerHTML = '<p class="muted">No items yet.</p>'; return; }
  state.history.forEach(item=>{
    const div = document.createElement('div'); div.className='item';
    const h = document.createElement('div'); h.innerHTML = `<strong>${item.title}</strong><br><span class="muted small">${new Date(item.ts).toLocaleString()}</span>`;
    const row=document.createElement('div'); row.className='row';
    const btn1=document.createElement('button'); btn1.textContent='View'; btn1.onclick=()=>{
      $('#article-card').hidden=false;
      $('#art-title').textContent=item.title;
      $('#art-subtitle').textContent=item.subtitle;
      const md = item.markdown;
      $('#art-body').innerHTML = md
        .replace(/^## (.*)$/gm,'<h3>$1</h3>')
        .replace(/^# (.*)$/m,'<h2>$1</h2>')
        .replace(/\n\n/g,'<br><br>')
        .replace(/^- (.*)$/gm,'• $1');
      $('#art-sources').innerHTML = ''; // not stored
    };
    const btn2=document.createElement('button'); btn2.textContent='Copy .md'; btn2.onclick=()=> navigator.clipboard.writeText(item.markdown);
    row.append(btn1, btn2);
    div.append(h,row);
    c.appendChild(div);
  });
}

// TTS
let speaking=false;
function pickFemaleVoice(){
  const voices = speechSynthesis.getVoices();
  const prefer = [/female/i,/samantha/i,/victoria/i,/karen/i,/serena/i,/zira/i,/jenny/i,/aria/i,/lisa/i,/natasha/i];
  for(const re of prefer){
    const v = voices.find(v=> re.test(v.name) || re.test(v.voiceURI));
    if(v) return v;
  }
  return voices[0] || null;
}
function speak(text){
  if(!('speechSynthesis' in window)) return alert('Speech synthesis not supported in this browser.');
  speechSynthesis.cancel();
  const chunks = text.match(/(.|[\r\n]){1,1500}/g) || [text];
  const voice = pickFemaleVoice();
  speaking=true;
  (function queue(i){
    if(i>=chunks.length || !speaking) return;
    const u = new SpeechSynthesisUtterance(chunks[i]);
    if(voice) u.voice = voice;
    u.rate = 0.92; u.pitch = 1; u.volume = 0.9;
    u.onend = ()=> queue(i+1);
    speechSynthesis.speak(u);
  })(0);
}
$('#tts').onclick = ()=>{
  const body = $('#art-body').innerText;
  speak($('#art-title').innerText + ". " + $('#art-subtitle').innerText + ". " + body);
};
$('#tts-stop').onclick = ()=>{ speaking=false; speechSynthesis.cancel(); };

// Export
$('#copy-md').onclick = ()=>{
  const body = buildMarkdownFromDOM();
  navigator.clipboard.writeText(body);
};
$('#download-md').onclick = ()=>{
  const body = buildMarkdownFromDOM();
  const blob = new Blob([body], {type:'text/markdown'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'article.md'; a.click();
  URL.revokeObjectURL(url);
};
function buildMarkdownFromDOM(){
  const title = $('#art-title').innerText;
  const subtitle = $('#art-subtitle').innerText;
  const paras = Array.from($('#art-body').querySelectorAll('h3, p, li')).map(el=>{
    if(el.tagName==='H3') return `## ${el.innerText}`;
    if(el.tagName==='LI') return `- ${el.innerText}`;
    return el.innerText;
  }).join('\n');
  const sources = Array.from($('#art-sources').querySelectorAll('li')).map((li,i)=> `${i+1}. ${li.innerText} — ${li.querySelector('a')?.href||''}`).join('\n');
  return `# ${title}\n\n*${subtitle}*\n\n${paras}\n\n## Sources\n${sources}\n`;
}

// Generate
let abort=false;
$('#stop').onclick = ()=>{ abort=true; setStatus('Stopped.'); };

$('#go').onclick = async ()=>{
  abort=false;
  const query = $('#query').value.trim();
  const years = Math.max(1, Math.min(10, parseInt($('#years').value || '3', 10)));
  const length = $('#length').value;
  const includeCR = $('#use-crossref').checked;
  if(!query) return alert('Type a topic first.');

  try{
    setStatus('Searching Wikipedia…');
    const hits = await wikiSearch(query, 6);
    if(abort) return;
    setStatus(`Found ${hits.length} Wikipedia results. Fetching extracts…`);
    const wikiDocs = [];
    for(const h of hits){
      if(abort) return;
      const ex = await wikiExtractById(h.pageid);
      if(ex && ex.extract) wikiDocs.push(ex);
      await sleep(120);
    }
    if(!wikiDocs.length){ setStatus('No Wikipedia extracts found. Try a broader query.'); return; }

    let papers = [];
    if(includeCR){
      setStatus('Querying Crossref for recent papers…');
      papers = await crossrefPapers(query, years);
      if(abort) return;
      setStatus(`Found ${papers.length} papers.`);
    }

    setStatus('Composing article…');
    const art = composeArticle({query, years, length, wikiDocs, papers});
    renderArticle(art);
    setStatus('Done.');
    const card = document.getElementById('article-card');
    if(card){ window.scrollTo({top: card.offsetTop - 8, behavior:'smooth'}); }
  }catch(e){
    console.error(e);
    setStatus('Error: '+ e.message);
  }
};

// History controls
$('#export-data').onclick = ()=>{
  const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'arnsicle_data.json'; a.click();
  URL.revokeObjectURL(url);
};
$('#import-data').onclick = ()=>{
  const f = $('#import-file').files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = ()=>{ try{ const obj = JSON.parse(r.result); localStorage.setItem('arnsicle_state', JSON.stringify(obj)); location.reload(); } catch(e){ alert('Bad file.'); } };
  r.readAsText(f);
};
$('#clear-data').onclick = ()=>{
  if(confirm('Clear local history?')){ localStorage.removeItem('arnsicle_state'); location.reload(); }
};

// Initial render
(function(){ const h = document.getElementById('history'); if(h) { /* no-op, renderHistory called below */ } })();
renderHistory();
