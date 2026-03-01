'use strict';
let docs = {}, activeCat = null, statusData = null, curSendType = 'other';
const epStore = Object.create(null);

/* ── Category icon palette ── */
const CAT_PALETTE = [
  { bg:'rgba(91,156,246,.12)',  border:'rgba(91,156,246,.25)',  text:'#5b9cf6'  },
  { bg:'rgba(34,201,151,.12)',  border:'rgba(34,201,151,.25)',  text:'#22c997'  },
  { bg:'rgba(240,106,106,.12)', border:'rgba(240,106,106,.25)', text:'#f06a6a'  },
  { bg:'rgba(167,139,250,.12)', border:'rgba(167,139,250,.25)', text:'#a78bfa'  },
  { bg:'rgba(245,158,91,.12)',  border:'rgba(245,158,91,.25)',  text:'#f59e5b'  },
  { bg:'rgba(232,160,32,.12)',  border:'rgba(232,160,32,.25)',  text:'#e8a020'  },
  { bg:'rgba(8,214,198,.12)',   border:'rgba(8,214,198,.25)',   text:'#08d6c6'  },
  { bg:'rgba(236,72,153,.12)',  border:'rgba(236,72,153,.25)',  text:'#ec4899'  },
];
function catPalette(name) {
  const idx = [...name].reduce((a,c)=>a+c.charCodeAt(0),0) % CAT_PALETTE.length;
  return CAT_PALETTE[idx];
}
function catAbbr(name) {
  const abbrs = {
    Downloader:'DL', Tools:'TL', Random:'RN', Information:'IN', Games:'GM',
    Admin:'AD', Search:'SR', Threads:'TH', Instagram:'IG', TikTok:'TK',
    Music:'MU', Image:'IM', AI:'AI', Social:'SO', Media:'MD', News:'NW',
    Weather:'WT', Finance:'FI',
  };
  return abbrs[name] || name.slice(0,2).toUpperCase();
}

const SEND_META = {
  error:   { title:'Laporan Error Command',    sub:'Ceritakan endpoint mana yang error' },
  request: { title:'Request Fitur / Endpoint', sub:'Jelaskan fitur yang kamu butuhkan' },
  blocked: { title:'Ajukan Unblock Akses',     sub:'Berikan alasan kenapa akses perlu di-unblock' },
  other:   { title:'Laporan Lainnya',          sub:'Saran, pertanyaan, atau masukan umum' },
};

let _tt = null;
function toast(msg, type) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast vis' + (type ? ' ' + type : '');
  clearTimeout(_tt);
  _tt = setTimeout(() => { t.className = 'toast'; }, 2800);
}
function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt !== undefined) e.textContent = txt;
  return e;
}
function span(cls, txt) { return el('span', cls, txt); }
function badge(m) { return span('mb ' + m, m); }
function mkSection(title) {
  const s = el('div','sec');
  const l = el('div','sec-lbl'); l.textContent = title;
  s.appendChild(l); return s;
}

async function fetchStatus() {
  try { const r = await fetch('/api/status/ip'); if (!r.ok) return null; return await r.json(); }
  catch { return null; }
}

function renderStatusChip(data) {
  const chip = document.getElementById('statusChipVal');
  const chipEl = document.getElementById('statusChip');
  const dot = document.querySelector('#statusChip .dot');
  if (!chip) return;
  if (data?.blocked) {
    chip.textContent = 'Diblokir';
    if (dot) { dot.style.background = 'var(--red)'; dot.style.animationPlayState = 'paused'; }
    if (chipEl) { chipEl.style.cssText = 'background:var(--rbg);border:1px solid var(--rbr);color:var(--red)'; }
    return;
  }
  chip.textContent = 'Aktif';
  if (dot) { dot.style.background = ''; dot.style.animationPlayState = ''; }
  if (chipEl) chipEl.style.cssText = '';
}

function buildStatusSheetContent(data) {
  const wrap = document.getElementById('statusSheetContent');
  wrap.innerHTML = '';
  if (!data) { wrap.innerHTML = '<p style="color:var(--red);text-align:center;padding:10px">Gagal memuat status.</p>'; return; }
  if (data.blocked) {
    wrap.innerHTML = `<div style="text-align:center;padding:10px"><p style="color:var(--red);font-size:11px;font-weight:700;margin-bottom:6px">Akses Diblokir</p><p style="color:var(--t3);font-size:9px;line-height:1.9">Kamu melebihi batas request.<br>Gunakan menu Laporan untuk ajukan unblock.</p></div>`;
    return;
  }
  const rows = [
     ['Status','Terhubung','cv-green'],
     ['IP Address', data.ip || '-', 'cv-green'],
     ['Sisa Akses',
       data.remaining + ' limit',
       data.remaining < 100 ? 'cv-red'
         : data.remaining < 300 ? 'cv-yellow'
         : 'cv-normal'
     ],
     ['Endpoint Diakses',
       data.endpoints_used + ' endpoint',
       'cv-normal'
     ],
     ['Reset Pada',
       data.reset_at
         ? new Date(data.reset_at).toLocaleString('id-ID',{
             timeZone:'Asia/Jakarta',
             hour:'2-digit',
             minute:'2-digit',
             day:'2-digit',
             month:'2-digit'
           }) + ' WIB'
         : '-',
       'cv-normal'
     ],
   ];
  rows.forEach(([k,v,cls]) => {
    const row = el('div'); row.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--b1)';
    const kEl = el('span'); kEl.style.cssText='font-size:8px;color:var(--t3);text-transform:uppercase;letter-spacing:1px'; kEl.textContent=k;
    const vEl = el('span',cls); vEl.style.cssText='font-size:10px;font-weight:600;font-family:var(--mono)'; vEl.textContent=v;
    row.append(kEl,vEl); wrap.appendChild(row);
  });
}

function buildStatusCard(data) {
  if (!data) return null;
  if (data.blocked) {
    const w = el('div','sc-blocked-wrap');
    w.innerHTML = `<div class="sc-blocked-title">Akses Diblokir</div><div class="sc-blocked-desc">Kamu melebihi batas request yang diizinkan.<br>Gunakan <b>Laporan</b> untuk mengajukan unblock.</div>`;
    return w;
  }
  const card = el('div','status-card');
  card.innerHTML = `
     <div class="sc-hd">
       <div class="sc-hd-left"><span class="sc-hd-dot"></span>Koneksi API</div>
       <div class="sc-pill ok">Aktif</div>
     </div>
     <div class="sc-body">
       <div class="sc-row">
         <span class="sc-label">Status</span>
         <span class="sc-value cv-green">Terhubung</span>
       </div>
   
       <div class="sc-row">
         <span class="sc-label">IP Address</span>
         <span class="sc-value cv-normal">${data.ip || '-'}</span>
       </div>
   
       <div class="sc-row">
         <span class="sc-label">Endpoint Diakses</span>
         <span class="sc-value cv-normal">${data.endpoints_used || 0} endpoint</span>
       </div>
   
       <div class="sc-row">
         <span class="sc-label">Reset Pada</span>
         <span class="sc-value cv-normal" style="font-size:9px">
           ${data.reset_at
             ? new Date(data.reset_at).toLocaleString('id-ID',{
                 timeZone:'Asia/Jakarta',
                 hour:'2-digit',
                 minute:'2-digit',
                 day:'2-digit',
                 month:'2-digit'
               }) + ' WIB'
             : '-'
           }
         </span>
       </div>
     </div>`;
  return card;
}

function buildReportCard() {
  const card = el('div','report-card');
  const hd = el('div','rc-hd');
  hd.innerHTML = `<span class="rc-hd-title">Menu Laporan</span><span class="rc-hd-badge">via Whatsapp</span>`;
  const grid = el('div','rc-grid');
  const btns = [
    {type:'error',cls:'err',label:'Error Command',desc:'Endpoint tidak berfungsi',svg:'<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>'},
    {type:'request',cls:'req',label:'Request Fitur',desc:'Minta endpoint baru',svg:'<path fill-rule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clip-rule="evenodd"/>'},
    {type:'blocked',cls:'blk',label:'Akses Diblokir',desc:'Ajukan unblock',svg:'<path fill-rule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clip-rule="evenodd"/>'},
    {type:'other',cls:'oth',label:'Lainnya',desc:'Saran & pertanyaan',svg:'<path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/>'},
  ];
  btns.forEach(b => {
    const btn = el('button','rc-btn '+b.cls); btn.type='button'; btn.dataset.type=b.type;
    btn.innerHTML = `<div class="rc-btn-icon"><svg viewBox="0 0 20 20" fill="currentColor">${b.svg}</svg></div><div class="rc-btn-text"><span class="rc-btn-label">${b.label}</span><span class="rc-btn-desc">${b.desc}</span></div>`;
    btn.addEventListener('click', () => openSend(b.type));
    grid.appendChild(btn);
  });
  card.appendChild(hd); card.appendChild(grid);
  return card;
}

function openReport() { document.getElementById('rptSheet').classList.add('vis'); }

function openSend(type) {
  curSendType = type;
  const meta = SEND_META[type] || SEND_META.other;
  document.getElementById('sendTitle').textContent = meta.title;
  document.getElementById('sendSub').textContent   = meta.sub;
  document.getElementById('sendMsg').value = '';
  document.getElementById('rptSheet').classList.remove('vis');
  document.getElementById('sendSheet').classList.add('vis');
  setTimeout(() => document.getElementById('sendMsg').focus(), 300);
}

async function submitReport() {
  const msg = document.getElementById('sendMsg').value.trim();
  if (!msg) { toast('Pesan tidak boleh kosong','err-t'); return; }
  const btn = document.getElementById('sendSubmitBtn');
  btn.disabled = true; btn.textContent = 'Mengirim...';
  try {
    const r = await fetch('/api/user-report', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ type:curSendType, message:msg, timestamp:new Date().toISOString() }) });
    if (r.ok) { toast('Laporan terkirim! Developer akan respon dalam 24 jam','ok-t'); document.getElementById('sendSheet').classList.remove('vis'); }
    else { const err = await r.json().catch(()=>({})); toast('Gagal kirim ('+r.status+'): '+(err.error||''),'err-t'); }
  } catch { toast('Gagal. Cek koneksi internet.','err-t'); }
  btn.disabled = false; btn.textContent = 'Kirim ke Developer';
}

function closeAll() { ['statusSheet','rptSheet','sendSheet'].forEach(id=>document.getElementById(id)?.classList.remove('vis')); }

function mobGo(tab) {
  ['mobCats','mobEps'].forEach(id=>document.getElementById(id)?.classList.remove('vis'));
  document.querySelectorAll('.mob-tab').forEach(t=>t.classList.remove('on'));
  if (tab==='cats')        { document.getElementById('mobCats').classList.add('vis'); document.getElementById('mt-cats').classList.add('on'); }
  else if (tab==='eps')    { document.getElementById('mobEps').classList.add('vis');  document.getElementById('mt-eps').classList.add('on'); }
  else if (tab==='report') { openReport(); document.getElementById('mt-report').classList.add('on'); }
  else if (tab==='status') { buildStatusSheetContent(statusData); document.getElementById('statusSheet').classList.add('vis'); document.getElementById('mt-status').classList.add('on'); }
  else { document.getElementById('mt-home').classList.add('on'); }
}

function goHome() {
  activeCat = null;
  document.querySelectorAll('.scath,.sep,.epc').forEach(e=>e.classList.remove('on'));
  document.getElementById('detEmpty').style.display = '';
  document.getElementById('detInner').style.display = 'none';
  document.getElementById('detInner').innerHTML = '';
  document.getElementById('eppList').innerHTML = '<div class="epp-empty"><div class="ei"></div><p>Pilih kategori<br>untuk melihat endpoint</p></div>';
  document.getElementById('eppTitle').textContent = '// Endpoints';
  mobGo('home');
  document.getElementById('det').scrollTop = 0;
  window.scrollTo({ top: 0 });
}

function openDonate() {
  closeAll();
  document.getElementById('donateModal')?.classList.add('show');
}
function closeDonate() {
  document.getElementById('donateModal')?.classList.remove('show');
}
function openQRIS() {
  document.getElementById('qrisModal')?.classList.add('show');
}
function closeQRIS() {
  document.getElementById('qrisModal')?.classList.remove('show');
}
document.getElementById('qrisModal')?.addEventListener('click', e => {
  if (e.target.id === 'qrisModal') closeQRIS();
});

/* ── APP LOADER ───────────────────── */
window.addEventListener('load', () => {
  const loader = document.getElementById('appLoader');
  setTimeout(() => {
    if (loader) {
      loader.style.animation = 'fadeOut .35s ease forwards';
      setTimeout(() => loader.remove(), 400);
    }
  }, 3000);
});

/* ── LOADER WITH PERCENT ───────────── */
const loader = document.getElementById('appLoader');
const percent = document.getElementById('progressPercent');
let start = performance.now();
const duration = 5000;
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}
function animate(now) {
  const t = Math.min((now - start) / duration, 1);
  const eased = easeOutCubic(t);
  const progress = eased * 100;
  const rounded = Math.floor(progress);
  percent.textContent = rounded + "%";
  
  /* ================= FADE & BLUR ================= */
  if (progress >= 80) {
    const fade = (progress - 80) / 20; // 0 → 1 (smooth)
    loader.style.opacity = (1 - fade).toFixed(2);
    loader.style.transform = `scale(${1 + fade * 0.05})`;
    loader.style.filter = `blur(${fade * 6}px)`;
  }
  if (t < 1) {
    requestAnimationFrame(animate);
  } else {
    loader.style.opacity = "0";
    loader.style.filter = "blur(6px)";
    loader.style.transform = "scale(1.05)";
    setTimeout(() => loader.remove(), 500);
  }
}
requestAnimationFrame(animate);

async function init() {
  const bind = (id, ev, fn) => document.getElementById(id)?.addEventListener(ev, fn);
  bind('mt-home','click',()=>goHome());
  bind('mt-cats','click',()=>mobGo('cats'));
  bind('mt-eps','click',()=>mobGo('eps'));
  bind('mt-donate','click',()=>openDonate());
  bind('mt-report','click',()=>mobGo('report'));
  bind('mt-status','click',()=>mobGo('status'));
  bind('logoBtn','click',goHome);
  bind('logoBtn','keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();goHome();}});
  bind('statusChip','click',()=>{buildStatusSheetContent(statusData);document.getElementById('statusSheet').classList.add('vis');});
  bind('statusSheetClose','click',()=>document.getElementById('statusSheet').classList.remove('vis'));
  bind('statusSheet','click',e=>{if(e.target===e.currentTarget)e.currentTarget.classList.remove('vis');});
  bind('rptSheetClose','click',()=>document.getElementById('rptSheet').classList.remove('vis'));
  bind('rptSheet','click',e=>{if(e.target===e.currentTarget)e.currentTarget.classList.remove('vis');});
  bind('sendSheetClose','click',()=>document.getElementById('sendSheet').classList.remove('vis'));
  bind('sendCancelBtn','click',()=>document.getElementById('sendSheet').classList.remove('vis'));
  bind('sendSubmitBtn','click',submitReport);
  bind('openReportDesktop','click',e=>{e.preventDefault();openReport();});
  document.querySelectorAll('.rpt-opt[data-type]').forEach(btn=>{btn.addEventListener('click',()=>openSend(btn.dataset.type));});
  bind('srchD','input',e=>doSearch(e.target.value));
  bind('srchM','input',e=>doSearch(e.target.value));
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();document.getElementById('srchD')?.focus();}
    if(e.key==='Escape'){
      closeAll();
      closeDonate();
      ['srchD','srchM'].forEach(id=>{const el2=document.getElementById(id);if(el2&&el2===document.activeElement){el2.value='';_doSearchNow('');el2.blur();}});
      if(window.innerWidth<=767)mobGo('home');
    }
  });

  const [docsR, statusR] = await Promise.all([fetch('/api/info').catch(()=>null), fetchStatus()]);
  statusData = statusR;
  renderStatusChip(statusData);

  if (docsR && docsR.ok) {
    try {
      const d = await docsR.json();
      document.getElementById('hdrVer').textContent = d.version ? String(d.version).slice(0,20) : 'v1.1.0';
      document.getElementById('hdrEp').textContent  = (parseInt(d.total_endpoints) || 0) + ' endpoints';
      docs = {};
      (d.apis || []).forEach(api => {
        const cat = api.kategori || api.category || 'Other';
      
        if (!docs[cat]) docs[cat] = [];
      
        docs[cat].push({
          name: api.nama,
          method: api.method,
          path: api.endpoint,
          description: api.deskripsi,
          params: (api.parameter || []).map(p => ({
            name: p.nama,
            type: p.tipe,
            required: p.required,
            dtype: p.dtype,
            desc: p.desc
          })),
          example: {
            url: api.contoh
          }
        });
      });
      const raw = d.docs || {};
      Object.keys(raw).forEach(cat=>{ if(Array.isArray(raw[cat]))docs[cat]=raw[cat].filter(ep=>ep?.path&&ep?.method); });
      buildAll(docs);
      const de = document.getElementById('detEmpty');
      if (de) {
        const stCard = buildStatusCard(statusData);
        const rcCard = buildReportCard();
        if (stCard) de.insertBefore(stCard, de.firstChild);
        if (rcCard) { const emptyDiv=de.querySelector('.det-empty'); emptyDiv?de.insertBefore(rcCard,emptyDiv):de.appendChild(rcCard); }
      }
    } catch(ex) { console.error('Docs parse error:', ex); }
  } else {
    document.getElementById('hdrEp').textContent = 'offline';
  }

  setInterval(async()=>{ statusData=await fetchStatus(); renderStatusChip(statusData); }, 180000);
}

function buildAll(d) {
  ['sbList','mobCatList'].forEach(id=>{
    const c=document.getElementById(id); c.innerHTML='';
    Object.keys(d).forEach(cat=>c.appendChild(mkCatItem(cat,d[cat],id==='mobCatList')));
  });
}

function mkCatItem(cat, eps, isMob) {
  const pal  = catPalette(cat);
  const abbr = catAbbr(cat);
  const wrap = el('div','scat');
  wrap.dataset.cat = cat;
  const hd = el('div','scath' + (cat === activeCat ? ' on' : ''));
  const ico = el('span','cat-icon');
  ico.style.cssText = `background:${pal.bg};border:1px solid ${pal.border};color:${pal.text}`;
  ico.textContent = abbr;
  const nm  = el('span','nm');
  nm.textContent = cat;
  const cnt = el('span','cnt');
  cnt.textContent = eps.length;
  const arr = el('span','arr');
  arr.textContent = '›';
  hd.append(ico, nm, cnt, arr);
  const body = el('div','seps');
  eps.forEach(ep => body.appendChild(mkSepItem(ep, isMob)));
  hd.addEventListener('click', () => {
    const isOn = hd.classList.contains('on');
    hd.closest('.sb-sc,#mobCatList')
      ?.querySelectorAll('.scath.on')
      .forEach(h => {
        if (h !== hd) h.classList.remove('on');
      });
    hd.classList.toggle('on', !isOn);
    if (!isOn) {
      activeCat = cat;
      pickCat(cat, false); // hanya render endpoint panel
    }
  });

  wrap.append(hd, body);
  return wrap;
}

function mkSepItem(ep, isMob) {
  const key=ep.method+'||'+ep.path; epStore[key]=ep;
  const div=el('div','sep '+ep.method); div.dataset.epkey=key;
  const sm=el('span','sm'); sm.textContent=ep.method;
  const sp=el('span','sp'); sp.textContent=ep.path;
  div.append(sm,sp);
  div.addEventListener('click',()=>{pickEp(key);if(isMob)mobGo('home');});
  return div;
}

function pickCat(cat, autoFirst) {
  activeCat=cat;
  const eps=docs[cat]||[];
  document.querySelectorAll('.scath').forEach(h=>{h.classList.toggle('on',h.closest('.scat')?.dataset.cat===cat);});
  document.getElementById('eppTitle').textContent='// '+cat;
  const eppList=document.getElementById('eppList'),mobEpList=document.getElementById('mobEpList');
  eppList.innerHTML=''; mobEpList.innerHTML='';
  eps.forEach(ep=>{eppList.appendChild(mkEpCard(ep,false));mobEpList.appendChild(mkEpCard(ep,true));});
  if(autoFirst&&eps.length)pickEp(eps[0].method+'||'+eps[0].path);
}

function mkEpCard(ep, isMob) {
  const key=ep.method+'||'+ep.path; epStore[key]=ep;
  const card=el('div','epc'); card.dataset.epkey=key;
  const top=el('div','epc-top');
  const mb2=el('span','mb '+ep.method); mb2.textContent=ep.method;
  const ph=el('span','epc-path'); ph.textContent=ep.path;
  const desc=el('div','epc-desc'); desc.textContent=ep.description||'';
  top.append(mb2,ph); card.append(top,desc);
  card.addEventListener('click',()=>{pickEp(key);if(isMob)mobGo('home');});
  return card;
}

function pickEp(key) {
  const ep=epStore[key]; if(!ep)return;
  document.querySelectorAll('.epc,.sep').forEach(e=>e.classList.remove('on'));
  document.querySelectorAll('[data-epkey]').forEach(e=>{if(e.dataset.epkey===key)e.classList.add('on');});
  document.getElementById('detEmpty').style.display='none';
  const inner=document.getElementById('detInner');
  inner.style.display='block'; inner.innerHTML=''; inner.appendChild(buildDetail(ep));
  document.getElementById('det').scrollTop=0; window.scrollTo({top:0});
}

function buildDetail(ep) {
  const uid='u'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
  epStore['_uid_'+uid]=ep;
  const frag=document.createDocumentFragment();

  const hero=el('div','hero-card');
  const hTop=el('div','hero-top');
  const hPath=el('span','hero-path');
  ep.path.split(/(:[a-zA-Z_]+)/g).forEach(p=>{
    if(/^:[a-zA-Z_]+/.test(p)){const s=el('span','prm');s.textContent=p;hPath.appendChild(s);}
    else hPath.appendChild(document.createTextNode(p));
  });
  hTop.append(badge(ep.method),hPath,span('live-tag','Live'));
  const hDesc=el('div','hero-desc'); hDesc.textContent=ep.description||'-';
  hero.append(hTop,hDesc); frag.appendChild(hero);

  const qp=(ep.params||[]).filter(p=>p.type==='query');
  const pp=(ep.params||[]).filter(p=>p.type!=='query');
  if(pp.length)frag.appendChild(mkParamTbl('Path Params',pp,true));
  if(qp.length)frag.appendChild(mkParamTbl('Query Params',qp,true));
  if((ep.bodyParams||[]).length)frag.appendChild(mkParamTbl('Request Body',ep.bodyParams,false));
  if(ep.example?.response){const sec=mkSection('Contoh Response');sec.appendChild(mkCodeBlock('200 OK',JSON.stringify(ep.example.response,null,2),true));frag.appendChild(sec);}
  const ts=mkSection('Coba Langsung');ts.appendChild(mkTryPanel(ep,uid));frag.appendChild(ts);
  frag.appendChild(mkCurlSection(ep, uid));
  frag.appendChild(mkCodeExSection(ep,uid));
  if((ep.responses||[]).length){
    const sec=mkSection('HTTP Status'); const codes=el('div','codes');
    ep.responses.forEach(r=>{const p=el('span','cpill '+(r.code<300?'c2':r.code<500?'c4':'c5'));p.textContent=r.code+' — '+r.desc;codes.appendChild(p);});
    sec.appendChild(codes); frag.appendChild(sec);
  }
  return frag;
}

function mkParamTbl(title, params, isEp) {
  const sec=mkSection(title); const wrap=el('div','ptbl-wrap');
  const tbl=el('table','ptbl'); const thead=el('thead'),tr=el('tr');
  ['Nama','Tipe','Status','Deskripsi'].forEach(h=>{const th=el('th');th.textContent=h;tr.appendChild(th);});
  thead.appendChild(tr); const tbody=el('tbody');
  params.forEach(p=>{
    const row=el('tr');
    const nm=el('td','pn'); nm.textContent=(isEp?(p.type==='query'?'?':':'): '')+p.name;
    const tp=el('td'); const tsp=el('span','pt'); tsp.textContent=p.dtype||'string'; tp.appendChild(tsp);
    const req=el('td'); req.appendChild(el('span',p.required?'pr-t':'po-t',p.required?'required':'optional'));
    const desc=el('td','pd'); desc.textContent=p.desc||'';
    row.append(nm,tp,req,desc); tbody.appendChild(row);
  });
  tbl.append(thead,tbody); wrap.appendChild(tbl);
  const scrl=el('div'); scrl.style.overflowX='auto'; scrl.appendChild(wrap);
  sec.appendChild(scrl); return sec;
}

function mkCodeBlock(label, code, showOk) {
  const blk=el('div','cblk'); const bar=el('div','cblk-bar');
  const lbl=el('span','cblk-lbl');
  if(showOk){const ok=el('span','ok','200');lbl.append(ok,' OK');}else{lbl.textContent=label;}
  const cpb=el('button','cpbtn','Copy'); cpb.addEventListener('click',()=>copyText(code,cpb));
  bar.append(lbl,cpb);
  const body=el('div','cblk-body'); const pre=el('pre'); pre.innerHTML=hlJSON(code);
  body.appendChild(pre); blk.append(bar,body); return blk;
}

function mkTryPanel(ep, uid) {
  const panel=el('div','try');
  const hd=el('div','try-hd');
  const lbl=el('span','try-lbl'); lbl.textContent='Console';
  const btns=el('div','try-btns');
  const runBtn=el('button','run-btn'); runBtn.id='rbtn-'+uid; runBtn.type='button';
  runBtn.innerHTML='<span>&#9654;</span> Kirim';
  runBtn.addEventListener('click',()=>runEp(uid));
  const clrBtn=el('button','clr-btn','Bersihkan'); clrBtn.type='button';
  clrBtn.addEventListener('click',()=>clrResp(uid));
  btns.append(runBtn,clrBtn); hd.append(lbl,btns);

  const body=el('div','try-body'); body.id='tbody-'+uid;
  const params=ep.params||[];
  if(!params.length&&!(ep.bodyParams||[]).length){
    const note=el('p'); note.textContent='// Tidak ada parameter. Langsung klik Kirim.';
    note.style.cssText='font-family:var(--mono);font-size:10px;color:var(--t3)';
    body.appendChild(note);
  }
  params.forEach(p=>body.appendChild(mkField(p,ep,uid)));
  if((ep.bodyParams||[]).length)body.appendChild(mkBodyField(ep,uid));

  const pgwrap=el('div','pgwrap'); const pgbar=el('div','pgbar'); pgbar.id='pgbar-'+uid; pgwrap.appendChild(pgbar);
  const tmsg=el('div','timeout-msg'); tmsg.id='tmsg-'+uid; tmsg.textContent='Request timeout setelah 15 detik.';
  const rsec=el('div','resp-section'); rsec.id='rsec-'+uid;
  const rTop=el('div','resp-top'); const rmeta=el('div','resp-meta'); rmeta.id='rmeta-'+uid;
  const cpBtn=el('button','cpbtn','Copy'); cpBtn.type='button';
  cpBtn.addEventListener('click',()=>{const rc=document.getElementById('rcode-'+uid);if(rc)copyText(rc.textContent,cpBtn);});
  rTop.append(rmeta,cpBtn);
  const rbody=el('div','resp-body'); const rwrap=el('div','resp-code-wrap');
  const rcode=el('pre','resp-code'); rcode.id='rcode-'+uid;
  rwrap.appendChild(rcode); rbody.appendChild(rwrap); rsec.append(rTop,rbody);
  panel.append(hd,body,pgwrap,tmsg,rsec);
  return panel;
}

function mkField(p, ep, uid) {
  const wrap = el('div','tf');
  const lab  = el('label');
  lab.appendChild(document.createTextNode(p.name+' '));
  lab.appendChild(el('span',p.required?'req':'opt',p.required?'*wajib':'opsional'));
  lab.appendChild(document.createTextNode(' '));
  lab.appendChild(el('span','tbg',p.type==='query'?'query':'path'));
  let exampleVal = '';
  try {
    const m = (ep.example?.url || '').match(
      new RegExp('[?&]' + p.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '=([^&]*)')
    );
    if (m) exampleVal = decodeURIComponent(m[1]);
  } catch {}
  const inp = el('input');
  inp.id = 'fi-'+uid+'-'+p.name;
  inp.type = 'text';
  inp.value = '';
  inp.placeholder = exampleVal || (p.dtype || 'string') + '...';
  inp.autocomplete='off';
  inp.spellcheck=false;
  inp.addEventListener('input', () => updateRealtimeCurl(ep, uid));
  wrap.append(lab,inp);
  if(p.desc){
    const hint=el('div','hint');
    hint.textContent='// '+p.desc;
    wrap.appendChild(hint);
  }
  return wrap;
}

function mkBodyField(ep, uid) {
  const wrap = el('div','tf');
  const lab  = el('label');

  lab.appendChild(document.createTextNode('Request Body '));
  lab.appendChild(el('span','req','*'));
  lab.appendChild(document.createTextNode(' '));
  lab.appendChild(el('span','tbg','JSON'));

  let exampleBody = '';
  if (ep.example?.body) {
    try {
      exampleBody = JSON.stringify(ep.example.body, null, 2);
    } catch {}
  }
  const ta = el('textarea');
  ta.id = 'fi-'+uid+'-body';
  ta.spellcheck = false;
  ta.value = '';
  ta.placeholder = exampleBody || '{\n  "key": "value"\n}';
  ta.addEventListener('input', () => updateRealtimeCurl(ep, uid));
  const hint = el('div','hint');
  hint.textContent='// Body JSON raw';
  wrap.append(lab, ta, hint);
  return wrap;
}

function buildRealtimeCurl(ep, uid) {
  let baseUrl = location.origin + ep.path;
  let url = baseUrl;
  let qp = [];
  let hasUserInput = false;
  for (const p of (ep.params || [])) {
    const inp = document.getElementById('fi-'+uid+'-'+p.name);
    if (!inp) continue;
    const val = inp.value.trim();
    if (val) {
      hasUserInput = true;
      if (p.type === 'query') {
        qp.push(encodeURIComponent(p.name)+'='+encodeURIComponent(val));
      } else {
        url = url.replace(':'+p.name, encodeURIComponent(val));
      }
    }
  }
  if (hasUserInput) {
    url = location.origin + ep.path;
    if (qp.length) url += '?' + qp.join('&');
  }
  let raw = `curl -X ${ep.method} "${url}" -H "Content-Type: application/json"`;
  const bodyEl = document.getElementById('fi-'+uid+'-body');
  let bodyVal = bodyEl?.value?.trim();
  if (!bodyVal && ep.example?.body) {
    bodyVal = JSON.stringify(ep.example.body);
  }
  if (bodyVal) {
    raw += ` -d '${bodyVal.replace(/'/g,"\\'")}'`;
  }
  return raw;
}

function updateRealtimeCurl(ep, uid) {
  const pre = document.getElementById('curl-'+uid);
  if (!pre) return;
  const raw = buildRealtimeCurl(ep, uid);
  pre.innerHTML = hlCurl(raw);
}

function mkCurlSection(ep, uid) {
  const sec = mkSection('cURL');
  const blk = el('div','cblk');
  const bar = el('div','cblk-bar');
  const lbl = el('span','cblk-lbl','>_ Command');
  const cpb = el('button','cpbtn','Copy');
  cpb.type = 'button';
  cpb.addEventListener('click', () => {
    const raw = buildRealtimeCurl(ep, uid);
    copyText(raw, cpb);
  });
  bar.append(lbl, cpb);
  const body = el('div','cblk-body');
  const pre = el('pre');
  pre.id = 'curl-'+uid;
  body.appendChild(pre);
  blk.append(bar, body);
  sec.appendChild(blk);
  updateRealtimeCurl(ep, uid);
  return sec;
}

function mkCodeExSection(ep, uid) {
  const url = location.origin + ep.path;
  const body=(ep.bodyParams||[]).length?(ep.example?.body?JSON.stringify(ep.example.body,null,2):'{}'):null;
  const isP=['POST','PUT','PATCH'].includes(ep.method);
  const codes={
    js:  isP?`// JavaScript\nconst res = await fetch('${url}', {\n  method: '${ep.method}',\n  headers: { 'Content-Type': 'application/json' },\n  body: JSON.stringify(${body})\n});\nconst data = await res.json();\nconsole.log(data);`:`// JavaScript\nconst res = await fetch('${url}');\nconst data = await res.json();\nconsole.log(data);`,
    py:  isP?`# Python 3\nimport requests\nr = requests.${ep.method.toLowerCase()}(\n    '${url}',\n    json=${body}\n)\nprint(r.json())`:`# Python 3\nimport requests\nr = requests.get('${url}')\nprint(r.json())`,
    php: isP?`<?php\n$ch = curl_init('${url}');\ncurl_setopt_array($ch, [\n  CURLOPT_RETURNTRANSFER => true,\n  CURLOPT_CUSTOMREQUEST  => '${ep.method}',\n  CURLOPT_POSTFIELDS     => '${body?body.replace(/'/g,"\\'"):'{}'}',\n  CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],\n]);\nprint_r(json_decode(curl_exec($ch), true));`:`<?php\n$ch = curl_init('${url}');\ncurl_setopt($ch, CURLOPT_RETURNTRANSFER, true);\nprint_r(json_decode(curl_exec($ch), true));`,
  };
  const sec=mkSection('Contoh Kode'); const wrap=el('div','ctabs-wrap');
  const tabs=el('div','ctabs'); const langs=[['js','JavaScript'],['py','Python'],['php','PHP']];
  langs.forEach(([lang,label],i)=>{
    const tab=el('button','ctab'+(i===0?' on':''),label); tab.type='button';
    tab.addEventListener('click',()=>swTab(tab,uid,lang)); tabs.appendChild(tab);
  });
  const panes=el('div');
  langs.forEach(([lang],i)=>{
    const pane=el('div','cpane'+(i===0?' on':'')); pane.id='ct-'+uid+'-'+lang;
    const cpb=el('button','cpcpy','copy'); cpb.type='button';
    cpb.addEventListener('click',()=>{const p=document.getElementById('ct-'+uid+'-'+lang)?.querySelector('pre');if(p)copyText(p.textContent,cpb);});
    const pre=el('pre'); pre.innerHTML=hlCode(codes[lang]);
    pane.append(cpb,pre); panes.appendChild(pane);
  });
  wrap.append(tabs,panes); sec.appendChild(wrap); return sec;
}

async function runEp(uid) {
  const ep=epStore['_uid_'+uid]; if(!ep){toast('Endpoint tidak ditemukan','err-t');return;}
  const btnEl=document.getElementById('rbtn-'+uid);
  const pgbar=document.getElementById('pgbar-'+uid);
  const tmsg=document.getElementById('tmsg-'+uid);
  const rsec=document.getElementById('rsec-'+uid);
  const rmeta=document.getElementById('rmeta-'+uid);
  const rcode=document.getElementById('rcode-'+uid);

  tmsg?.classList.remove('vis'); rsec?.classList.remove('vis');
  if(rcode)rcode.innerHTML='';

  let url=location.origin+ep.path, qp=[], hasErr=false;
  for(const p of(ep.params||[])){
    const inp=document.getElementById('fi-'+uid+'-'+p.name); if(!inp)continue;
    inp.classList.remove('err'); const val=inp.value.trim();
    if(!val&&p.required){inp.classList.add('err');toast('"'+p.name+'" wajib diisi','err-t');inp.focus();hasErr=true;break;}
    if(val){if(p.type==='query')qp.push(encodeURIComponent(p.name)+'='+encodeURIComponent(val));else url=url.replace(':'+p.name,encodeURIComponent(val));}
  }
  if(hasErr)return;
  if(qp.length)url+='?'+qp.join('&');

  const opts={method:ep.method,headers:{'Content-Type':'application/json','Accept':'application/json'}};
  if((ep.bodyParams||[]).length){
    const bEl=document.getElementById('fi-'+uid+'-body');
    if(bEl){const bval=bEl.value.trim()||'{}';try{JSON.parse(bval);opts.body=bval;bEl.classList.remove('err');}catch{bEl.classList.add('err');toast('Body JSON tidak valid','err-t');return;}}
  }

  if(btnEl){btnEl.disabled=true;btnEl.className='run-btn loading';btnEl.innerHTML='<span class="run-spinner"></span> Mengirim...';}
  if(pgbar){pgbar.style.transition='none';pgbar.style.width='0%';requestAnimationFrame(()=>{pgbar.style.transition='width 13s linear';pgbar.style.width='88%';});}

  const t0=Date.now(); let r=null,data=null;
  const ctrl=new AbortController(); const tid=setTimeout(()=>ctrl.abort(),180000);
  try {
    opts.signal=ctrl.signal; r=await fetch(url,opts); clearTimeout(tid);
    const ct=r.headers.get('content-type')||'';
    if(ct.includes('application/json')||ct.includes('text/json')){data=await r.json();}
    else if(ct.includes('image/')||ct.includes('audio/')||ct.includes('video/')){data={_info:'Binary response ('+ct+')',contentType:ct,status:r.status};}
    else{const txt=await r.text();try{data=JSON.parse(txt);}catch{data={response:txt.substring(0,500)};}}
  } catch(e){
    clearTimeout(tid);
    if(btnEl){btnEl.disabled=false;btnEl.className='run-btn';btnEl.innerHTML='<span>&#9654;</span> Kirim';}
    if(pgbar){pgbar.style.transition='none';pgbar.style.width='0%';}
    if(e.name==='AbortError'){tmsg?.classList.add('vis');toast('Timeout 15s','err-t');}
    else{toast('Network error: '+e.message,'err-t');if(rcode)rcode.innerHTML=hlJSON(JSON.stringify({error:e.message},null,2));rsec?.classList.add('vis');}
    return;
  }

  const ms=Date.now()-t0;
  if(btnEl){btnEl.disabled=false;btnEl.className='run-btn';btnEl.innerHTML='<span>&#9654;</span> Kirim';}
  if(pgbar){pgbar.style.transition='width .2s ease';pgbar.style.width='100%';setTimeout(()=>{pgbar.style.transition='none';pgbar.style.width='0%';},350);}

  const status=r?r.status:0; const ok=status>=200&&status<300;
  if(status===429){statusData=await fetchStatus();renderStatusChip(statusData);toast('Batas request terlampaui.','err-t');}

  if(rmeta){
    rmeta.innerHTML='';
    const s1=el('span');s1.textContent='Status: ';s1.appendChild(el('span',ok?'s-ok':'s-err',status+(ok?' OK':' ERROR')));
    const s2=el('span');s2.textContent='Waktu: ';s2.appendChild(el('span','mv',ms+'ms'));
    const s3=el('span');s3.style.cssText='word-break:break-all;flex:1';s3.textContent='URL: ';
    const usp=el('span','mv');usp.textContent=url;s3.appendChild(usp);
    rmeta.append(s1,s2,s3);
  }
  if(rcode)rcode.innerHTML=hlJSON(JSON.stringify(data,null,2));
  rsec?.classList.add('vis');
  if(window.innerWidth<=767)rsec?.scrollIntoView({behavior:'smooth',block:'nearest'});
  toast(ok?status+' OK · '+ms+'ms':status+' Error',ok?'ok-t':'err-t');

  try{fetch('/api/run-notify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:ep.path,method:ep.method,status,ms,url})}).catch(()=>{});}catch{}
  if(ok){statusData=await fetchStatus();renderStatusChip(statusData);}
}

let _st=null;
function doSearch(q){clearTimeout(_st);_st=setTimeout(()=>_doSearchNow(q),150);}
function _doSearchNow(q){
  q=String(q||'').toLowerCase().trim();
  const src=document.getElementById('srchD'),srm=document.getElementById('srchM');
  if(src&&src!==document.activeElement)src.value=q;
  if(srm&&srm!==document.activeElement)srm.value=q;
  if(!q){buildAll(docs);if(activeCat)pickCat(activeCat,false);return;}
  const f={};
  Object.keys(docs).forEach(cat=>{
    const eps=docs[cat].filter(ep=>[ep.method,ep.path,ep.description||'',cat].join(' ').toLowerCase().includes(q));
    if(eps.length)f[cat]=eps;
  });
  buildAll(f);
  const fc=Object.keys(f)[0];if(fc)pickCat(fc,false);
}

function hlJSON(j){
  const safe=String(j||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return safe.replace(/("(?:[^"\\]|\\.)*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,m=>{
    if(/^"/.test(m))return/:$/.test(m)?`<span class="jk">${m}</span>`:`<span class="js">${m}</span>`;
    if(/true|false/.test(m))return`<span class="jb">${m}</span>`;
    if(/null/.test(m))return`<span class="jnull">${m}</span>`;
    return`<span class="jn">${m}</span>`;
  });
}
function hlCurl(s){
  const safe=s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return safe.replace(/^(curl)/,'<span class="ck">$1</span>').replace(/"([^"]+)"/g,'<span class="cs">"$1"</span>');
}
function hlCode(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g,m=>`<span class="cs">${m}</span>`)
    .replace(/\b(const|let|var|await|async|return|import|from|if|else|true|false|null|undefined|print|echo)\b/g,m=>`<span class="ck">${m}</span>`)
    .replace(/(?<!["\w\-])(\d+(?:\.\d+)?)(?!["\w])/g,m=>`<span class="cn">${m}</span>`)
    .replace(/(\/\/[^\n]*|#[^\n]*)/g,m=>`<span class="cc">${m}</span>`);
}

function clrResp(uid){document.getElementById('rsec-'+uid)?.classList.remove('vis');document.getElementById('tmsg-'+uid)?.classList.remove('vis');}
function swTab(btn,uid,lang){
  const wrap=btn.closest('.ctabs-wrap');if(!wrap)return;
  wrap.querySelectorAll('.ctab').forEach(t=>t.classList.remove('on'));
  wrap.querySelectorAll('.cpane').forEach(p=>p.classList.remove('on'));
  btn.classList.add('on');document.getElementById('ct-'+uid+'-'+lang)?.classList.add('on');
}
function copyText(txt,btn){
  if(!txt)return;
  const done=()=>{toast('Disalin!','ok-t');if(btn){const o=btn.textContent;btn.classList.add('ok');btn.textContent='OK';setTimeout(()=>{btn.classList.remove('ok');btn.textContent=o;},1500);}};
  if(navigator.clipboard?.writeText)navigator.clipboard.writeText(txt).then(done).catch(()=>fallbackCopy(txt,done));
  else fallbackCopy(txt,done);
}
function fallbackCopy(txt,cb){
  const ta=document.createElement('textarea');
  ta.value=txt;ta.style.cssText='position:fixed;top:-9999px;left:-9999px;opacity:0';
  document.body.appendChild(ta);ta.focus();ta.select();
  try{document.execCommand('copy');cb();}catch{}
  document.body.removeChild(ta);
}

init();