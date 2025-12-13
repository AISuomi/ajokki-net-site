// 1) LIITÄ TÄHÄN GOOGLE SHEETSIN "Publish to web" CSV -LINKKI:
const SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/1coJILtNPhy66E56n8tyANe7-JrTZEwF0lDrOs_ZXnrA/gviz/tq?tqx=out:csv";
function cleanText(s){
  return (s ?? "")
    .toString()
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00A0/g, " ")          // oikea non-breaking space
    .replace(/\s+/g, " ")
    .trim();
}
function cleanUrl(u){
  let s = cleanText(u);

  // jos url on tyhjä tai data-url, anna olla
  if (!s) return "";
  if (/^(data:|https?:\/\/)/i.test(s)) return s;

  // siisti mahdolliset ./ ja ../ alut
  s = s.replace(/^\.\//, "");
  s = s.replace(/^(\.\.\/)+/, "");

  // jos polku ei ala /:lla, pakota juureen
  if (!s.startsWith("/")) s = "/" + s;

  // poista tuplaviivat
  s = s.replace(/\/{2,}/g, "/");
  return s;
}


function isLikelyRealImage(url){
  const u = (url || "").toLowerCase();
  if (!u) return false;

  // hyväksy yleisimmät kuvapäätteet
  const okExt = /\.(jpe?g|png|webp|gif)$/i.test(u);
  if (!okExt) return false;

  // suodata tyhjät/placeholderit (näitä tulee vanhoista sivuista paljon)
  const bad = [
    "spacer", "blank", "pixel", "transparent", "clear", "tyhja", "empty",
    "15x15", "1x1", "0.gif"
  ];
  if (bad.some(x => u.includes(x))) return false;

  return true;
}


function qs(sel){ return document.querySelector(sel); }
function qsa(sel){ return [...document.querySelectorAll(sel)]; }

function parseCSV(text){
  // kevyt CSV-parseri joka kestää lainausmerkit
  const rows = [];
  let cur = "", row = [], inQ = false;
  for (let i=0; i<text.length; i++){
    const ch = text[i];
    if (ch === '"'){
      if (inQ && text[i+1] === '"'){ cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === "," && !inQ){
      row.push(cur); cur = "";
    } else if ((ch === "\n" || ch === "\r") && !inQ){
      if (cur.length || row.length) { row.push(cur); rows.push(row); }
      cur = ""; row = [];
      // skip \r\n
      if (ch === "\r" && text[i+1] === "\n") i++;
    } else {
      cur += ch;
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function norm(s){ return cleanText(s); }
function low(s){ return norm(s).toLowerCase(); }

function toObj(headers, row){
  const o = {};
  headers.forEach((h, i)=> o[h] = row[i] ?? "");
  return o;
}

function imagesFrom(p){
  const imgs = [];
  for (let i=1;i<=6;i++){
    const raw = p[`kuva${i}`];
    const v = cleanUrl(raw);
    if (!v) continue;
    if (!isLikelyRealImage(v)) continue;
    imgs.push(v);
  }
  // poista duplikaatit
  return [...new Set(imgs)];
}


function pillSold(val){
  const v = low(val);
  if (v === "kyllä" || v === "yes" || v === "true" || v === "1") return {txt:"Myyty", cls:"sold"};
  return {txt:"Myynnissä", cls:"live"};
}

async function loadProducts(){
  if (!SHEETS_CSV_URL || SHEETS_CSV_URL.includes("PASTE_YOUR_CSV_URL_HERE")){
    throw new Error("Puuttuu Google Sheets CSV -linkki (SHEETS_CSV_URL).");
  }
  const res = await fetch(SHEETS_CSV_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("Tuotteiden lataus epäonnistui (Sheets).");
  const text = await res.text();

  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => norm(h));
  const out = [];
  for (let i=1;i<rows.length;i++){
    const o = toObj(headers, rows[i]);
    // piilossa = kyllä -> ei näytetä
    const hidden = low(o.piilossa) === "kyllä";
    if (hidden) continue;
    // id pakollinen
    if (!norm(o.id)) continue;
    out.push(o);
  }
  return out;
}

// --------- LISTASIVU ----------
function initList(products){
  const grid = qs("#grid");
  const status = qs("#status");
  const q = qs("#q");
  const cat = qs("#cat");
  const sold = qs("#sold");

  if (!grid) return; // ei listan sivulla

  // täytä kategoriat
  const cats = [...new Set(products.map(p => norm(p.kategoria)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fi'));
  for (const c of cats){
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    cat.appendChild(opt);
  }

  function card(p){
    const imgs = imagesFrom(p);
    const img = imgs[0] || "";
    const soldInfo = pillSold(p.myyty);

    const a = document.createElement("a");
    a.className = "card";
    a.href = `tuote.html?id=${encodeURIComponent(norm(p.id))}`;

    const im = document.createElement("img");
    im.className = "cardimg";
    im.alt = norm(p.otsikko) || "Tuote";
    if (img) im.src = img;
    a.appendChild(im);

    const body = document.createElement("div");
    body.className = "cardbody";

    const title = document.createElement("div");
    title.className = "ctitle";
    title.textContent = norm(p.otsikko);
    body.appendChild(title);

    const muted = document.createElement("div");
    muted.className = "cmuted";
    muted.textContent = norm(p.lyhyt);
    body.appendChild(muted);

    const row = document.createElement("div");
    row.className = "crow";

    const price = document.createElement("div");
    price.className = "price";
    price.textContent = norm(p.hinta);
    row.appendChild(price);

    const meta = document.createElement("div");
    meta.style.display = "flex";
    meta.style.gap = "8px";
    meta.style.flexWrap = "wrap";

    const pill1 = document.createElement("span");
    pill1.className = "pill";
    pill1.textContent = norm(p.kategoria);
    meta.appendChild(pill1);

    const pill2 = document.createElement("span");
    pill2.className = `pill ${soldInfo.cls}`;
    pill2.textContent = soldInfo.txt;
    meta.appendChild(pill2);

    row.appendChild(meta);
    body.appendChild(row);

    a.appendChild(body);
    return a;
  }

  function apply(){
    const query = low(q.value);
    const c = norm(cat.value);
    const s = norm(sold.value);

    const filtered = products.filter(p => {
      if (c && norm(p.kategoria) !== c) return false;

      const soldVal = low(p.myyty) === "kyllä" ? "kyllä" : "ei";
      if (s && soldVal !== s) return false;

      if (!query) return true;
      const hay = [
        p.id, p.kategoria, p.otsikko, p.hinta, p.lyhyt
      ].map(low).join(" | ");
      return hay.includes(query);
    });

    grid.innerHTML = "";
    for (const p of filtered) grid.appendChild(card(p));

    status.textContent = filtered.length
      ? `${filtered.length} tuotetta`
      : "Ei osumia (kokeile toista hakua tai suodatusta).";
  }

  q.addEventListener("input", apply);
  cat.addEventListener("change", apply);
  sold.addEventListener("change", apply);

  apply();
}

// --------- TUOTESIVU ----------
function initProduct(products){
  const pstatus = qs("#pstatus");
  const section = qs("#product");
  if (!pstatus || !section) return; // ei tuotesivulla

  const params = new URLSearchParams(location.search);
  const id = norm(params.get("id"));
  const p = products.find(x => norm(x.id) === id);

  if (!p){
    pstatus.textContent = "Tuotetta ei löytynyt (tarkista linkki).";
    return;
  }

  pstatus.hidden = true;
  section.hidden = false;

  qs("#ptitle").textContent = norm(p.otsikko);
  qs("#pprice").textContent = norm(p.hinta);
  qs("#pshort").textContent = norm(p.lyhyt);

  qs("#pcat").textContent = norm(p.kategoria);

  const soldInfo = pillSold(p.myyty);
  const psold = qs("#psold");
  psold.textContent = soldInfo.txt;
  psold.className = `pill ${soldInfo.cls}`;

  const imgs = imagesFrom(p);
  const hero = qs("#hero");
  const thumbs = qs("#thumbs");

  const dlg = qs("#dlg");
  const dlgImg = qs("#dlgImg");
  const dlgClose = qs("#dlgClose");

  function openDlg(src, alt){
    dlgImg.src = src;
    dlgImg.alt = alt || "";
    dlg.showModal();
  }
  dlgClose?.addEventListener("click", ()=> dlg.close());
  dlg?.addEventListener("click", (e)=>{
    if (e.target === dlg) dlg.close();
  });

  function setHero(src){
    hero.src = src;
  }

  if (imgs.length){
    setHero(imgs[0]);
    hero.alt = norm(p.otsikko);
    hero.addEventListener("click", ()=> openDlg(hero.src, hero.alt));

    thumbs.innerHTML = "";
    for (const src of imgs){
      const t = document.createElement("img");
      t.className = "thumb";
      t.src = src;
      t.alt = norm(p.otsikko);
      t.addEventListener("click", ()=>{
        setHero(src);
      });
      thumbs.appendChild(t);
    }
  } else {
    hero.alt = "Ei kuvia";
  }

  // Video (YouTube tai mp4)
  const v = norm(p.video);
  const videoWrap = qs("#videoWrap");
  const videoInner = qs("#videoInner");

  if (v){
    videoWrap.hidden = false;
    const yt = /youtu\.be\/|youtube\.com\/watch\?v=/.test(v);

    if (yt){
      let id = "";
      try{
        const u = new URL(v);
        if (u.hostname.includes("youtu.be")) id = u.pathname.replace("/","");
        else id = u.searchParams.get("v") || "";
      } catch {}
      const src = id ? `https://www.youtube.com/embed/${id}` : v;

      const iframe = document.createElement("iframe");
      iframe.src = src;
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      iframe.allowFullscreen = true;
      iframe.style.minHeight = "340px";
      videoInner.innerHTML = "";
      videoInner.appendChild(iframe);
    } else {
      const vid = document.createElement("video");
      vid.controls = true;
      vid.src = v;
      vid.style.minHeight = "340px";
      videoInner.innerHTML = "";
      videoInner.appendChild(vid);
    }
  }
}

(async function main(){
  try{
    const products = await loadProducts();
    initList(products);
    initProduct(products);
  } catch (e){
    const msg = (e && e.message) ? e.message : "Tuntematon virhe.";
    const status = qs("#status");
    const pstatus = qs("#pstatus");
    if (status) status.textContent = `Virhe: ${msg}`;
    if (pstatus) pstatus.textContent = `Virhe: ${msg}`;
    console.error(e);
  }
})();
