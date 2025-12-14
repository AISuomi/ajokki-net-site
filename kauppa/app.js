// 1) LIITÄ TÄHÄN GOOGLE SHEETSIN "Publish to web" CSV -LINKKI:
const SHEETS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1coJILtNPhy66E56n8tyANe7-JrTZEwF0lDrOs_ZXnrA/gviz/tq?tqx=out:csv";

// jos joskus siirrät kuvat /images-kansioon, syötä Sheetsiin: images/kuva.jpg
// tämä tukee sekä root-kuvia (/kuva.jpg) että images/kuva.jpg
const DEFAULT_IMAGE_ALT = "Tuotekuva";

function cleanText(s) {
  let x = (s ?? "").toString();

  // HTML-roskat
  x = x.replace(/&nbsp;/gi, " ");
  x = x.replace(/\u00A0/g, " "); // NBSP

  // poista script/JS-rivit joita vanhoista sivuista tulee mukaan
  x = x.replace(/<script[\s\S]*?<\/script>/gi, " ");
  x = x.replace(/document\.write\([\s\S]*?\);?/gi, " ");
  x = x.replace(/var\s+uri\s*=.*$/gmi, " ");

  // poista urlit (jättää pelkän tekstin)
  x = x.replace(/https?:\/\/\S+/gi, " ");
  x = x.replace(/\bwww\.\S+/gi, " ");

  // poista HTML-tagit jos niitä eksyy mukaan
  x = x.replace(/<[^>]+>/g, " ");

  // siivoa whitespace
  x = x.replace(/\s+/g, " ").trim();
  return x;
}

function clampText(s, n) {
  const x = cleanText(s);
  if (!x) return "";
  if (x.length <= n) return x;
  return x.slice(0, n - 1).trimEnd() + "…";
}

function cleanUrl(u) {
  let s = cleanText(u);
  if (!s) return "";

  // jos data-url tai http(s) -> ok sellaisenaan
  if (/^(data:|https?:\/\/)/i.test(s)) return s;

  // siisti ./ ja ../
  s = s.replace(/^\.\//, "");
  s = s.replace(/^(\.\.\/)+/, "");

  // hyväksy "images/xxx.jpg" myös
  if (!s.startsWith("/") && !s.startsWith("images/")) {
    // jos käyttäjä on syöttänyt vain tiedostonimen, oletetaan rootiin
    s = "/" + s;
  } else if (s.startsWith("images/")) {
    s = "/" + s; // -> /images/xxx.jpg
  }

  // poista tuplaviivat
  s = s.replace(/\/{2,}/g, "/");
  return s;
}

function isLikelyRealImage(url) {
  const u = (url || "").toLowerCase();
  if (!u) return false;

  // hyväksy yleisimmät kuvapäätteet
  const okExt = /\.(jpe?g|png|webp|gif)$/i.test(u);
  if (!okExt) return false;

  // suodata tyhjät/placeholderit
  const bad = ["spacer", "blank", "pixel", "transparent", "clear", "tyhja", "empty", "15x15", "1x1", "0.gif"];
  if (bad.some((x) => u.includes(x))) return false;

  return true;
}

// tyylikäs placeholder rikkinäisen kuvan sijaan
function placeholderDataSvg(title = "Ei kuvaa") {
  const t = cleanText(title) || "Ei kuvaa";
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
    <defs>
      <linearGradient id="g" x1="0" x2="1">
        <stop offset="0" stop-color="#f2f2f2"/>
        <stop offset="1" stop-color="#e8e8e8"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <g fill="#9aa0a6" font-family="Arial, sans-serif">
      <text x="50%" y="48%" font-size="34" text-anchor="middle">Ei kuvaa</text>
      <text x="50%" y="56%" font-size="18" text-anchor="middle">${t.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>
    </g>
  </svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.trim());
}

function qs(sel) {
  return document.querySelector(sel);
}

function parseCSV(text) {
  const rows = [];
  let cur = "",
    row = [],
    inQ = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQ && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      row.push(cur);
      cur = "";
    } else if ((ch === "\n" || ch === "\r") && !inQ) {
      if (cur.length || row.length) {
        row.push(cur);
        rows.push(row);
      }
      cur = "";
      row = [];
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else {
      cur += ch;
    }
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

function norm(s) {
  return cleanText(s);
}
function low(s) {
  return norm(s).toLowerCase();
}

function toObj(headers, row) {
  const o = {};
  headers.forEach((h, i) => (o[h] = row[i] ?? ""));
  return o;
}

function imagesFrom(p) {
  const imgs = [];
  for (let i = 1; i <= 6; i++) {
    const raw = p[`kuva${i}`];
    const v = cleanUrl(raw);
    if (!v) continue;
    if (!isLikelyRealImage(v)) continue;
    imgs.push(v);
  }
  return [...new Set(imgs)];
}

function pillSold(val) {
  const v = low(val);
  if (v === "kyllä" || v === "yes" || v === "true" || v === "1") return { txt: "Myyty", cls: "sold" };
  return { txt: "Myynnissä", cls: "live" };
}

function formatPrice(raw) {
  const x = cleanText(raw);
  if (!x) return "";
  // jos on jo € mukana, anna olla
  if (x.includes("€")) return x;
  // jos pelkkä numero, lisää €
  if (/^\d+([.,]\d+)?$/.test(x)) return x.replace(",", ".") + " €";
  return x;
}

async function loadProducts() {
  if (!SHEETS_CSV_URL) throw new Error("Puuttuu Google Sheets CSV -linkki (SHEETS_CSV_URL).");

  const res = await fetch(SHEETS_CSV_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("Tuotteiden lataus epäonnistui (Sheets).");

  const text = await res.text();
  const rows = parseCSV(text);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => norm(h));
  const out = [];

  for (let i = 1; i < rows.length; i++) {
    const o = toObj(headers, rows[i]);

    // piilossa = kyllä -> ei näytetä
    if (low(o.piilossa) === "kyllä") continue;

    // id pakollinen
    if (!norm(o.id)) continue;

    out.push(o);
  }
  return out;
}

// --------- LISTASIVU ----------
function initList(products) {
  const grid = qs("#grid");
  const status = qs("#status");
  const q = qs("#q");
  const cat = qs("#cat");
  const sold = qs("#sold");

  if (!grid) return;

  // täytä kategoriat
  const cats = [...new Set(products.map((p) => norm(p.kategoria)).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "fi")
  );
  for (const c of cats) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    cat.appendChild(opt);
  }

  function card(p) {
    const imgs = imagesFrom(p);
    const img = imgs[0] || "";
    const soldInfo = pillSold(p.myyty);

    const a = document.createElement("a");
    a.className = "card";
    a.href = `tuote.html?id=${encodeURIComponent(norm(p.id))}`;

    // kuva (jos ei ole kuvaa -> placeholder)
    const im = document.createElement("img");
    im.className = "cardimg";
    im.alt = norm(p.otsikko) || DEFAULT_IMAGE_ALT;
    im.loading = "lazy";
    im.src = img ? img : placeholderDataSvg(im.alt);
    im.onerror = () => {
      im.onerror = null;
      im.src = placeholderDataSvg(im.alt);
    };
    a.appendChild(im);

    const body = document.createElement("div");
    body.className = "cardbody";

    const title = document.createElement("div");
    title.className = "ctitle";
    title.textContent = clampText(p.otsikko, 80);
    body.appendChild(title);

    const muted = document.createElement("div");
    muted.className = "cmuted";
    muted.textContent = clampText(p.lyhyt, 140);
    body.appendChild(muted);

    const row = document.createElement("div");
    row.className = "crow";

    const price = document.createElement("div");
    price.className = "price";
    price.textContent = formatPrice(p.hinta);
    row.appendChild(price);

    const meta = document.createElement("div");
    meta.className = "meta";

    const pill1 = document.createElement("span");
    pill1.className = "pill";
    pill1.textContent = norm(p.kategoria) || "Tuotteet";
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

  function apply() {
    const query = low(q.value);
    const c = norm(cat.value);
    const s = norm(sold.value);

    const filtered = products.filter((p) => {
      if (c && norm(p.kategoria) !== c) return false;

      const soldVal = low(p.myyty) === "kyllä" ? "kyllä" : "ei";
      if (s && soldVal !== s) return false;

      if (!query) return true;

      const hay = [p.id, p.kategoria, p.otsikko, p.hinta, p.lyhyt].map(low).join(" | ");
      return hay.includes(query);
    });

    grid.innerHTML = "";
    for (const p of filtered) grid.appendChild(card(p));

    status.textContent = filtered.length ? `${filtered.length} tuotetta` : "Ei osumia (kokeile toista hakua tai suodatusta).";
  }

  q.addEventListener("input", apply);
  cat.addEventListener("change", apply);
  sold.addEventListener("change", apply);

  apply();
}

// --------- TUOTESIVU ----------
function initProduct(products) {
  const pstatus = qs("#pstatus");
  const section = qs("#product");
  if (!pstatus || !section) return;

  const params = new URLSearchParams(location.search);
  const id = norm(params.get("id"));
  const p = products.find((x) => norm(x.id) === id);

  if (!p) {
    pstatus.textContent = "Tuotetta ei löytynyt (tarkista linkki).";
    return;
  }

  pstatus.hidden = true;
  section.hidden = false;

  qs("#ptitle").textContent = norm(p.otsikko);
  qs("#pprice").textContent = formatPrice(p.hinta);
  qs("#pshort").textContent = cleanText(p.lyhyt);

  qs("#pcat").textContent = norm(p.kategoria) || "Tuotteet";

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

  function openDlg(src, alt) {
    dlgImg.src = src;
    dlgImg.alt = alt || "";
    dlg.showModal();
  }
  dlgClose?.addEventListener("click", () => dlg.close());
  dlg?.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close();
  });

  function setHero(src) {
    hero.src = src;
  }

  const heroAlt = norm(p.otsikko) || DEFAULT_IMAGE_ALT;

  if (imgs.length) {
    setHero(imgs[0]);
    hero.alt = heroAlt;
  } else {
    hero.src = placeholderDataSvg(heroAlt);
    hero.alt = heroAlt;
  }

  hero.onerror = () => {
    hero.onerror = null;
    hero.src = placeholderDataSvg(heroAlt);
  };

  hero.addEventListener("click", () => openDlg(hero.src, hero.alt));

  thumbs.innerHTML = "";
  for (const src of imgs) {
    const t = document.createElement("img");
    t.className = "thumb";
    t.src = src;
    t.alt = heroAlt;
    t.loading = "lazy";
    t.onerror = () => {
      t.onerror = null;
      t.src = placeholderDataSvg(heroAlt);
    };
    t.addEventListener("click", () => setHero(src));
    thumbs.appendChild(t);
  }

  // Video (YouTube tai mp4)
  const v = norm(p.video);
  const videoWrap = qs("#videoWrap");
  const videoInner = qs("#videoInner");

  if (v) {
    videoWrap.hidden = false;
    const yt = /youtu\.be\/|youtube\.com\/watch\?v=/.test(v);

    if (yt) {
      let vidId = "";
      try {
        const u = new URL(v);
        if (u.hostname.includes("youtu.be")) vidId = u.pathname.replace("/", "");
        else vidId = u.searchParams.get("v") || "";
      } catch {}
      const src = vidId ? `https://www.youtube.com/embed/${vidId}` : v;

      const iframe = document.createElement("iframe");
      iframe.src = src;
      iframe.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
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

(async function main() {
  try {
    const products = await loadProducts();
    initList(products);
    initProduct(products);
  } catch (e) {
    const msg = e?.message ? e.message : "Tuntematon virhe.";
    const status = qs("#status");
    const pstatus = qs("#pstatus");
    if (status) status.textContent = `Virhe: ${msg}`;
    if (pstatus) pstatus.textContent = `Virhe: ${msg}`;
    console.error(e);
  }
})();
