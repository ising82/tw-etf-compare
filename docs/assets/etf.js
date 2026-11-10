/* ETF 績效比較（台股／美股）：依市場載入 data/etf.js 或 data/us.js，所有期間／含息／風險／主題彙總都在瀏覽器端計算 */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const DAY = 86400000;
  const QUICK = [["1w", "1週"], ["1m", "1月"], ["3m", "3月"], ["6m", "6月"], ["ytd", "今年"], ["1y", "1年"],
                 ["3y", "3年"], ["5y", "5年"], ["10y", "10年"], ["max", "上市以來"]];
  const QLABEL = Object.fromEntries(QUICK);
  const UNITS = { td: "個交易日", d: "天", w: "週", m: "個月", y: "年" };
  const MODES = { price: "不含息（價格報酬）", tr: "含息（配息再投入）", trx: "含息（配息不再投入）" };
  const COLORS = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7", "--s8"];
  const MAX_SEL = 8;
  const LEV = "槓桿/反向";

  // ---------- 市場設定
  const MKT = {
    tw: {
      label: "台股", file: "data/etf.js", global: "ETF_DATA", workflow: "台灣 ETF 績效資料",
      cats: ["市值型", "高股息", "主題/產業", "債券", LEV, "商品/期貨", "多重資產/其他"],
      regions: ["台灣", "海外", "跨國"], benchChips: ["0050", "0056", "006208"], exchangeSel: true,
      vol: (e) => e.vol20 / 1000, volLabel: "20日均量(張)", volFilter: "20日均量 ≥", volUnit: "張", volStep: 100,
      listedLabel: "上市日", ccy: "", regionCls: (r) => (r === "台灣" ? "tw" : r === "跨國" ? "mix" : "ov"),
      link: (e) => [`https://tw.stock.yahoo.com/quote/${encodeURIComponent(e.code)}${e.market === "上櫃" ? ".TWO" : ".TW"}`, "Yahoo 股市"],
      note: "主動／被動、分類、主題與投資地區依證交所代號末碼、名稱關鍵字與人工覆寫表判斷，「跨國」指同時持有台灣與海外股票，標「?」者為推測。槓桿／反向 ETF 每日重設，長期績效不等於指數倍數。",
    },
    us: {
      label: "美股", file: "data/us.js", global: "ETF_DATA_US", workflow: "台灣 ETF 績效資料",
      cats: ["大盤", "風格因子", "高股息/收益", "產業", "主題", "國家/區域", "債券", "商品", "加密貨幣", LEV, "多重資產"],
      regions: ["美國", "非美", "全球"], benchChips: ["SPY", "QQQ", "VT"], exchangeSel: false,
      vol: (e) => e.vol20 * e.last / 1e6, volLabel: "20日均成交值(百萬美元)", volFilter: "20日均成交值 ≥", volUnit: "百萬美元", volStep: 10,
      listedLabel: "掛牌日", ccy: "US$", regionCls: (r) => (r === "美國" ? "ov" : r === "全球" ? "mix" : "tw"),
      link: (e) => [`https://finance.yahoo.com/quote/${encodeURIComponent(e.code)}`, "Yahoo Finance"],
      note: "美股為人工挑選的代表性 ETF（非全部美國掛牌 ETF），主題為人工標註；價格與報酬以美元計，未計匯率。資料自 2010 年起，「上市以來」對更早掛牌者是從 2010 年起算。槓桿／反向 ETF 每日重設，長期績效不等於指數倍數。",
    },
  };

  // ---------- 日期工具（全部用「自 1970 起的天數」整數，避免時區問題）
  const toDay = (iso) => { const [y, m, d] = iso.split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); };
  const fromDay = (n) => new Date(n * DAY).toISOString().slice(0, 10);
  const ymdOf = (n) => { const t = new Date(n * DAY); return [t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()]; };
  function shiftMonths(n, months) {            // 往前 months 個月，日數超過月底則取月底
    const [y, m, d] = ymdOf(n);
    const first = new Date(Date.UTC(y, m - months, 1));
    const dim = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return Math.round(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, dim)) / DAY);
  }
  const upperBound = (arr, v) => { let lo = 0, hi = arr.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] <= v) lo = mid + 1; else hi = mid; } return lo; };
  const lastIdxLE = (arr, v) => upperBound(arr, v) - 1;

  // ---------- 格式
  const NA = '<span class="na">—</span>';
  const pct = (v, dp = 2) => (v == null || !isFinite(v) ? NA
    : `<span class="${v > 0 ? "up" : v < 0 ? "down" : "flat"}">${v > 0 ? "+" : ""}${(v * 100).toFixed(dp)}%</span>`);
  const pctTxt = (v, dp = 1) => (v == null || !isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(dp)}%`);
  const pctPlain = (v, dp = 2) => (v == null || !isFinite(v) ? "" : (v * 100).toFixed(dp));
  const num = (v, dp = 2) => (v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }));
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

  // ---------- 目前市場的資料（切換市場時整組換掉）
  let M = null, DATA = null, ETFS = [], BENCH = [], byCode = {}, ASOF = 0, THEMES = [], YEARS = [];
  const LOADED = {};

  function prep(e) {
    const dates = new Array(e.dd.length);
    let d = toDay(e.d0);
    for (let i = 0; i < e.dd.length; i++) { d += e.dd[i]; dates[i] = d; }
    const c = e.c, n = c.length;
    const divAt = new Float64Array(n);
    (e.div || []).forEach(([i, a]) => { if (i > 0 && i < n) divAt[i] += a; });
    const tr = new Float64Array(n), cd = new Float64Array(n);   // 含息指數、累計配息
    tr[0] = c[0];
    for (let i = 1; i < n; i++) { tr[i] = tr[i - 1] * (c[i] + divAt[i]) / c[i - 1]; cd[i] = cd[i - 1] + divAt[i]; }
    const divs = (e.div || []).filter(([i]) => i < n).map(([i, a]) => ({ day: dates[i], amount: a, close: c[i] }));
    return Object.assign({}, e, { dates, c, tr, cd, divs, n, theme: e.theme || e.cat });
  }
  function loadMarket(key) {
    return new Promise((resolve, reject) => {
      if (LOADED[key]) return resolve(LOADED[key]);
      const cfg = MKT[key];
      const done = () => {
        const raw = window[cfg.global];
        if (!raw || !raw.etfs || !raw.etfs.length) return reject(new Error("empty"));
        LOADED[key] = { raw, etfs: raw.etfs.map(prep), bench: (raw.bench || []).map(prep) };
        resolve(LOADED[key]);
      };
      if (window[cfg.global]) return done();
      const s = document.createElement("script");
      s.src = cfg.file; s.onload = done; s.onerror = () => reject(new Error("load"));
      document.head.appendChild(s);
    });
  }

  // ---------- 期間解析：回傳 {s, e} 索引，或 null（資料不足）
  function resolve(etf, period) {
    const dates = etf.dates;
    let endDay = ASOF;
    if (period.kind === "range") endDay = Math.min(ASOF, toDay(period.to));
    const en = lastIdxLE(dates, endDay);
    if (en < 1) return null;
    let s;
    if (period.kind === "quick" && period.key === "max") s = 0;
    else if (period.kind === "custom" && period.unit === "td") s = en - period.n;
    else {
      let startDay;
      const end = dates[en];
      if (period.kind === "range") startDay = toDay(period.from);
      else if (period.kind === "quick") {
        const k = period.key;
        if (k === "ytd") startDay = toDay(`${ymdOf(end)[0] - 1}-12-31`);
        else if (k.endsWith("w")) startDay = end - 7 * parseInt(k, 10);
        else if (k.endsWith("m")) startDay = shiftMonths(end, parseInt(k, 10));
        else startDay = shiftMonths(end, 12 * parseInt(k, 10));
      } else {
        const n = period.n, u = period.unit;
        startDay = u === "d" ? end - n : u === "w" ? end - 7 * n : u === "m" ? shiftMonths(end, n) : shiftMonths(end, 12 * n);
      }
      if (startDay >= end) return null;
      s = lastIdxLE(dates, startDay);
      if (s < 0) return null;
      if (dates[s] < startDay - 14) return null;  // 起點前有長期缺資料（例如暫停交易、尚未掛牌）
    }
    if (s < 0 || s >= en) return null;
    return { s, e: en };
  }
  function retOf(etf, r, mode) {
    const { s, e } = r, c = etf.c;
    return mode === "price" ? c[e] / c[s] - 1 : mode === "tr" ? etf.tr[e] / etf.tr[s] - 1 : (c[e] + etf.cd[e] - etf.cd[s]) / c[s] - 1;
  }
  const annOf = (ret, days) => (days >= 365 ? Math.pow(1 + ret, 365.25 / days) - 1 : null);
  function metrics(etf, r, mode) {
    const { s, e } = r;
    const ret = retOf(etf, r, mode);
    const days = etf.dates[e] - etf.dates[s];
    const ser = mode === "price" ? etf.c : etf.tr;
    let sum = 0, sum2 = 0, k = 0, peak = ser[s], mdd = 0;
    for (let i = s + 1; i <= e; i++) {
      const lr = Math.log(ser[i] / ser[i - 1]); sum += lr; sum2 += lr * lr; k++;
      if (ser[i] > peak) peak = ser[i];
      const dd = ser[i] / peak - 1; if (dd < mdd) mdd = dd;
    }
    const vol = k >= 10 ? Math.sqrt(Math.max(0, (sum2 - sum * sum / k) / (k - 1)) * 252) : null;
    return { ret, ann: annOf(ret, days), days, vol, mdd, divSum: etf.cd[e] - etf.cd[s], start: etf.dates[s], end: etf.dates[e] };
  }
  function quickRet(etf, key, mode, annualize) {
    const r = resolve(etf, { kind: "quick", key }); if (!r) return null;
    const v = retOf(etf, r, mode);
    return annualize ? annOf(v, etf.dates[r.e] - etf.dates[r.s]) : v;
  }
  function yearRet(etf, y, mode) {
    const r = resolve(etf, { kind: "range", from: `${y - 1}-12-31`, to: `${y}-12-31` });
    return r ? retOf(etf, r, mode) : null;
  }
  function yield12(etf) {
    const e = etf.n - 1, since = etf.dates[e] - 365;
    let sum = 0, cnt = 0;
    etf.divs.forEach((d) => { if (d.day > since && d.day <= etf.dates[e]) { sum += d.amount; cnt++; } });
    return { y: sum / etf.c[e], cnt };
  }

  // ---------- 狀態（期間與報酬模式跨市場共用；篩選各市場各自保存）
  const state = { mkt: "tw", view: "theme", period: { kind: "quick", key: "1y" }, mode: "tr", ann: false, themeMode: "recent", incLev: false,
                  themeSort: { key: "cur", dir: -1 }, sort: { key: "ret", dir: -1 }, hideShort: true };
  const FILTERS = {};
  const freshFilters = (key) => ({ q: "", type: "all", cats: new Set(MKT[key].cats), regions: new Set(MKT[key].regions), exchange: "all",
                                   minVol: 0, theme: "", sel: [], bench: new Set([key === "tw" ? "^TWII" : "^GSPC"]) });
  let F = null;

  function periodLabel(p) { return p.kind === "quick" ? QLABEL[p.key] : p.kind === "custom" ? `${p.n} ${UNITS[p.unit]}` : `${p.from} ～ ${p.to}`; }
  function periodCode(p) { return p.kind === "quick" ? p.key : p.kind === "custom" ? `c${p.n}${p.unit}` : `r${p.from}_${p.to}`; }
  function parsePeriod(s) {
    if (!s) return null;
    if (QLABEL[s]) return { kind: "quick", key: s };
    let m = /^c(\d+)(td|d|w|m|y)$/.exec(s);
    if (m) return { kind: "custom", n: +m[1], unit: m[2] };
    m = /^r(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(s);
    return m ? { kind: "range", from: m[1], to: m[2] } : null;
  }
  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    state.mkt = MKT[h.get("k")] ? h.get("k") : "tw";
    if (!FILTERS[state.mkt]) FILTERS[state.mkt] = freshFilters(state.mkt);
    F = FILTERS[state.mkt];
    const cfg = MKT[state.mkt];
    state.view = h.get("w") === "rank" ? "rank" : h.has("w") ? "theme" : (h.get("s") ? "rank" : "theme");
    const p = parsePeriod(h.get("p")); if (p) state.period = p;
    if (MODES[h.get("m")]) state.mode = h.get("m");
    state.ann = h.get("a") === "1";
    state.themeMode = h.get("tm") === "years" ? "years" : "recent";
    state.incLev = h.get("lv") === "1";
    state.hideShort = h.get("h") !== "0";
    if (["all", "passive", "active"].includes(h.get("t"))) F.type = h.get("t");
    if (h.has("c")) F.cats = new Set(h.get("c").split(",").filter((c) => cfg.cats.includes(c)));
    if (h.has("r")) F.regions = new Set(h.get("r").split(",").filter((c) => cfg.regions.includes(c)));
    if (h.has("q")) F.q = h.get("q");
    if (h.has("th")) F.theme = h.get("th");
    if (h.has("s")) F.sel = h.get("s").split(",").filter(Boolean).slice(0, MAX_SEL);
    if (h.has("b")) F.bench = new Set(h.get("b").split(",").filter(Boolean));
    if (h.has("v")) F.minVol = +h.get("v") || 0;
    if (h.has("x")) F.exchange = h.get("x");
    if (h.get("o")) { const [k, d] = h.get("o").split("."); state.sort = { key: k, dir: d === "a" ? 1 : -1 }; }
  }
  function writeHash() {
    const h = new URLSearchParams(), cfg = MKT[state.mkt];
    if (state.mkt !== "tw") h.set("k", state.mkt);
    h.set("w", state.view); h.set("p", periodCode(state.period)); h.set("m", state.mode);
    if (state.ann) h.set("a", "1");
    if (state.themeMode === "years") h.set("tm", "years");
    if (state.incLev) h.set("lv", "1");
    if (!state.hideShort) h.set("h", "0");
    if (F.type !== "all") h.set("t", F.type);
    if (F.cats.size !== cfg.cats.length) h.set("c", [...F.cats].join(","));
    if (F.regions.size !== cfg.regions.length) h.set("r", [...F.regions].join(","));
    if (F.q) h.set("q", F.q);
    if (F.theme) h.set("th", F.theme);
    if (F.sel.length) h.set("s", F.sel.join(","));
    const defBench = state.mkt === "tw" ? "^TWII" : "^GSPC";
    if (!(F.bench.size === 1 && F.bench.has(defBench))) h.set("b", [...F.bench].join(","));
    if (F.minVol) h.set("v", String(F.minVol));
    if (F.exchange !== "all") h.set("x", F.exchange);
    if (!(state.sort.key === "ret" && state.sort.dir === -1)) h.set("o", `${state.sort.key}.${state.sort.dir > 0 ? "a" : "d"}`);
    history.replaceState(null, "", "#" + h.toString());
  }

  // ---------- 篩選後的 ETF 集合（主題總覽與排行共用；搜尋字與主題下拉只作用在排行）
  function baseSet() {
    return ETFS.filter((e) =>
      (F.type === "all" || (F.type === "active") === !!e.active) &&
      F.cats.has(e.cat) && F.regions.has(e.region) &&
      (F.exchange === "all" || e.market === F.exchange) &&
      (!F.minVol || M.vol(e) >= F.minVol));
  }

  // ---------- 控制列
  function renderControls() {
    document.querySelectorAll("#mkt .mkt-btn").forEach((b) => b.setAttribute("aria-selected", b.dataset.mkt === state.mkt));
    document.querySelectorAll("#views .view-btn").forEach((b) => b.setAttribute("aria-selected", b.dataset.view === state.view));
    $("#view-theme").hidden = state.view !== "theme"; $("#view-rank").hidden = state.view !== "rank";
    $("#quick").innerHTML = QUICK.map(([k, l]) =>
      `<button class="chip" data-q="${k}" aria-pressed="${state.period.kind === "quick" && state.period.key === k}">${l}</button>`).join("");
    if (state.period.kind === "custom") { $("#c-n").value = state.period.n; $("#c-unit").value = state.period.unit; }
    if (state.period.kind === "range") { $("#r-from").value = state.period.from; $("#r-to").value = state.period.to; }
    else { $("#r-to").value = DATA.asof; $("#r-from").value = fromDay(shiftMonths(ASOF, 12)); }
    document.querySelectorAll("#mode .chip").forEach((b) => b.setAttribute("aria-pressed", b.dataset.mode === state.mode));
    document.querySelectorAll("#type .chip").forEach((b) => b.setAttribute("aria-pressed", b.dataset.type === F.type));
    document.querySelectorAll("#theme-mode .chip").forEach((b) => b.setAttribute("aria-pressed", b.dataset.tm === state.themeMode));
    $("#ann").checked = state.ann; $("#q").value = F.q; $("#inc-lev").checked = state.incLev;
    $("#market").hidden = !M.exchangeSel; $("#market").value = F.exchange;
    $("#minvol").value = F.minVol; $("#minvol").step = M.volStep; $("#minvol-lbl").textContent = M.volFilter; $("#minvol-unit").textContent = M.volUnit;
    $("#hide-short").checked = state.hideShort;
    const cc = {}, rc = {};
    ETFS.forEach((e) => { cc[e.cat] = (cc[e.cat] || 0) + 1; rc[e.region] = (rc[e.region] || 0) + 1; });
    $("#cats").innerHTML = M.cats.map((c) =>
      `<button class="chip" data-cat="${esc(c)}" aria-pressed="${F.cats.has(c)}">${esc(c)}<span class="cnt">${cc[c] || 0}</span></button>`).join("") +
      `<button class="chip" data-cat="*">全選／全不選</button>`;
    $("#regions").innerHTML = M.regions.map((r) =>
      `<button class="chip" data-region="${esc(r)}" aria-pressed="${F.regions.has(r)}">${esc(r)}<span class="cnt">${rc[r] || 0}</span></button>`).join("");
    const benchOpts = BENCH.map((b) => [b.code, b.name]).concat(M.benchChips.map((c) => [c, c])).filter(([c]) => byCode[c]);
    $("#bench").innerHTML = benchOpts.map(([c, l]) =>
      `<button class="chip" data-bench="${esc(c)}" aria-pressed="${F.bench.has(c)}">對照 ${esc(l)}</button>`).join("");
    const tc = {};
    baseSet().forEach((e) => { tc[e.theme] = (tc[e.theme] || 0) + 1; });
    const names = Object.keys(tc).sort((a, b) => a.localeCompare(b, "zh-Hant"));
    if (F.theme && !tc[F.theme]) names.unshift(F.theme);
    $("#theme").innerHTML = `<option value="">全部主題</option>` + names.map((t) =>
      `<option value="${esc(t)}" ${t === F.theme ? "selected" : ""}>${esc(t)}（${tc[t] || 0}）</option>`).join("");
  }

  // ---------- 主題彙總
  function themeGroups() {
    const groups = {};
    baseSet().forEach((e) => {
      if (!state.incLev && e.cat === LEV) return;
      (groups[e.theme] = groups[e.theme] || { theme: e.theme, cat: e.cat, etfs: [] }).etfs.push(e);
    });
    return Object.values(groups);
  }
  function themeStats() {
    const mode = state.mode;
    return themeGroups().map((g) => {
      const cur = [];
      let best = null;
      g.etfs.forEach((e) => {
        const r = resolve(e, state.period); if (!r) return;
        let v = retOf(e, r, mode);
        if (state.ann) { const a = annOf(v, e.dates[r.e] - e.dates[r.s]); if (a != null) v = a; }
        cur.push(v);
        if (!best || v > best.v) best = { e, v };
      });
      return Object.assign(g, { n: g.etfs.length, nCur: cur.length, cur: mean(cur), best });
    });
  }
  const RECENT = [["1m", "1月", false], ["3m", "3月", false], ["6m", "6月", false], ["ytd", "今年", false], ["1y", "1年", false], ["3y", "3年年化", true], ["5y", "5年年化", true]];
  function heat(v, cap) {
    if (v == null || !isFinite(v)) return `<td class="heat">${NA}</td>`;
    const a = Math.round(Math.min(Math.abs(v) / cap, 1) * 46);
    return `<td class="heat" style="background:color-mix(in srgb, var(${v >= 0 ? "--up" : "--down"}) ${a}%, transparent)">${pctTxt(v)}</td>`;
  }
  function renderThemes() {
    const stats = themeStats();
    const mode = state.mode, years = state.themeMode === "years";
    const cols = years ? YEARS.map((y) => [String(y), y === YEARS[0] ? `${y}至今` : String(y)]) : RECENT.map(([k, l]) => [k, l]);
    stats.forEach((g) => {
      g.vals = {};
      if (years) YEARS.forEach((y) => { g.vals[y] = mean(g.etfs.map((e) => yearRet(e, y, mode)).filter((v) => v != null)); });
      else RECENT.forEach(([k, , ann]) => { g.vals[k] = mean(g.etfs.map((e) => quickRet(e, k, mode, ann)).filter((v) => v != null)); });
    });
    const { key, dir } = state.themeSort;
    const val = (g) => (key === "cur" ? g.cur : key === "name" ? g.theme : key === "n" ? g.n : g.vals[key]);
    stats.sort((a, b) => {
      const x = val(a), y = val(b);
      const xn = x == null || (typeof x === "number" && !isFinite(x)), yn = y == null || (typeof y === "number" && !isFinite(y));
      if (xn && yn) return a.theme.localeCompare(b.theme, "zh-Hant");
      if (xn) return 1; if (yn) return -1;
      return typeof x === "string" ? dir * x.localeCompare(y, "zh-Hant") : dir * (x - y);
    });
    const maxAbs = Math.max(0.0001, ...stats.map((g) => Math.abs(g.cur || 0)));
    const th = (k, label, cls) => `<th class="${cls || ""}${state.themeSort.key === k ? " sorted" : ""}" data-tsort="${esc(k)}">${esc(label)}${state.themeSort.key === k ? (dir > 0 ? " ▲" : " ▼") : ""}</th>`;
    const curLabel = `${periodLabel(state.period)}${state.ann ? "年化" : ""}平均`;
    const head = `<tr><th class="rank">#</th>${th("name", "主題", "l")}${th("n", "檔數", "c")}${th("cur", curLabel, "l")}<th class="l hide-sm">期間最佳</th>${cols.map(([k, l]) => th(k, l)).join("")}</tr>`;
    const cap = years ? 0.5 : 0.4;
    const body = stats.map((g, i) => {
      const w = g.cur == null ? 0 : Math.round(Math.abs(g.cur) / maxAbs * 90);
      const bar = g.cur == null ? "" : `<i class="bar ${g.cur >= 0 ? "pos" : "neg"}" style="width:${w}px"></i>`;
      const best = g.best ? `<span class="best"><b>${esc(g.best.e.code)}</b> ${esc(g.best.e.name.length > 14 ? g.best.e.name.slice(0, 14) + "…" : g.best.e.name)} ${pct(g.best.v, 1)}</span>` : NA;
      return `<tr data-theme="${esc(g.theme)}" title="點一下看這個主題的 ETF 排行">
        <td class="rank">${i + 1}</td>
        <td class="l"><span class="theme-name">${esc(g.theme)}</span><span class="theme-cat">${esc(g.cat)}</span></td>
        <td class="c">${g.n}${g.nCur < g.n ? `<span class="cnt-s">（${g.nCur} 有資料）</span>` : ""}</td>
        <td class="l"><div class="barcell"><span class="v num">${pct(g.cur, 1)}</span>${bar}</div></td>
        <td class="l hide-sm">${best}</td>
        ${cols.map(([k]) => heat(g.vals[k], cap)).join("")}
      </tr>`;
    }).join("");
    $("#theme-tbl").innerHTML = `<thead>${head}</thead><tbody>${body}</tbody>`;
    $("#theme-sub").textContent = `${stats.length} 個主題｜${MODES[mode]}｜各主題內 ETF 等權平均`;
    const notes = [`顏色：<span class="heat-legend"><i style="background:color-mix(in srgb, var(--down) 46%, transparent)"></i>跌 <i style="background:color-mix(in srgb, var(--up) 46%, transparent)"></i>漲</span>（台灣慣例紅漲綠跌，越深幅度越大）。`,
      "主題報酬＝該主題內有完整資料的 ETF 等權平均，成分檔數少的主題代表性較低；新 ETF 會讓近年平均的成分與早年不同。"];
    if (!state.incLev) notes.push("槓桿／反向 ETF 未納入，可勾選「納入槓桿／反向」。");
    if (years) notes.push(`歷年報酬為各年度首尾收盤計算，${YEARS[0]} 為年初至今。`);
    notes.push("上方摘要卡只取至少 2 檔有資料的主題。點任一列可看該主題的 ETF 排行。");
    if (!stats.length) notes.push("沒有符合篩選條件的 ETF。");
    $("#theme-note").innerHTML = notes.join(" ");
    renderHero(stats);
  }
  function renderHero(stats) {
    // 只有 1 檔的主題不算「主題趨勢」，摘要卡只取至少 2 檔有資料者（表格仍全部列出）
    const ok = stats.filter((g) => g.cur != null && g.cat !== LEV && g.nCur >= 2).sort((a, b) => b.cur - a.cur);
    const lab = `${periodLabel(state.period)}${state.ann ? "年化" : ""}`;
    const tiles = [];
    const tile = (k, g) => `<button class="tile" data-theme="${esc(g.theme)}"><div class="tile-k">${esc(k)}</div><div class="tile-n">${esc(g.theme)}</div>
      <div class="tile-v">${pct(g.cur, 1)}</div><div class="tile-s">${g.nCur} 檔平均${g.best ? `｜最佳 ${esc(g.best.e.code)} ${pctTxt(g.best.v)}` : ""}</div></button>`;
    ok.slice(0, 3).forEach((g, i) => tiles.push(tile(`${lab} 最強主題 #${i + 1}`, g)));
    if (ok.length > 3) tiles.push(tile(`${lab} 最弱主題`, ok[ok.length - 1]));
    const b = BENCH[0];
    if (b) {
      const r = resolve(b, state.period);
      let v = r ? retOf(b, r, "price") : null;
      if (r && state.ann) { const a = annOf(v, b.dates[r.e] - b.dates[r.s]); if (a != null) v = a; }
      tiles.push(`<div class="tile"><div class="tile-k">${esc(lab)} 大盤對照</div><div class="tile-n">${esc(b.name)}</div><div class="tile-v">${pct(v, 1)}</div><div class="tile-s">價格指數，不含股息</div></div>`);
    }
    $("#hero").innerHTML = tiles.join("");
  }

  // ---------- 排行表
  function cols() {
    return [
      { key: "rank", label: "#", cls: "rank" },
      { key: "sel", label: "", cls: "c" },
      { key: "code", label: "ETF", cls: "l", sortable: true },
      { key: "type", label: "類型", cls: "c hide-sm" },
      { key: "theme", label: "主題", cls: "l hide-sm", sortable: true },
      { key: "region", label: "地區", cls: "c hide-sm", sortable: true },
      { key: "last", label: `收盤${M.ccy ? `(${M.ccy})` : ""}`, sortable: true },
      { key: "ret", label: "期間報酬", sortable: true },
      { key: "vol", label: "年化波動", sortable: true },
      { key: "mdd", label: "最大回撤", sortable: true },
      { key: "divSum", label: "期間配息", sortable: true },
      { key: "y12", label: "近12月配息率", sortable: true },
      { key: "vol20", label: M.volLabel, sortable: true },
      { key: "listed", label: M.listedLabel, sortable: true, cls: "hide-sm" },
    ];
  }
  let rowsCache = [];
  function computeRows() {
    const q = F.q.trim().toLowerCase();
    return baseSet().filter((e) =>
      (!F.theme || e.theme === F.theme) &&
      (!q || e.code.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)))
    .map((e) => {
      const r = resolve(e, state.period);
      const m = r ? metrics(e, r, state.mode) : null;
      const y = yield12(e);
      return { e, m, y12: y.y, cnt12: y.cnt, retShown: m ? (state.ann && m.ann != null ? m.ann : m.ret) : null };
    });
  }
  function sortRows(rows) {
    const { key, dir } = state.sort;
    const val = (r) => {
      switch (key) {
        case "code": return r.e.code; case "theme": return r.e.theme; case "region": return r.e.region; case "listed": return r.e.listed || "";
        case "last": return r.e.last; case "vol20": return M.vol(r.e); case "y12": return r.y12;
        case "ret": return r.retShown; case "vol": return r.m ? r.m.vol : null;
        case "mdd": return r.m ? r.m.mdd : null; case "divSum": return r.m ? r.m.divSum : null;
        default: return null;
      }
    };
    rows.sort((a, b) => {
      const x = val(a), y = val(b);
      const xn = x == null || x === "" || (typeof x === "number" && !isFinite(x)), yn = y == null || y === "" || (typeof y === "number" && !isFinite(y));
      if (xn && yn) return a.e.code < b.e.code ? -1 : 1;
      if (xn) return 1; if (yn) return -1;
      if (typeof x === "string") return dir * x.localeCompare(y, "zh-Hant");
      return dir * (x - y);
    });
  }
  function renderTable() {
    let rows = computeRows();
    const short = rows.filter((r) => !r.m).length;
    if (state.hideShort) rows = rows.filter((r) => r.m);
    sortRows(rows);
    rowsCache = rows;
    const retLabel = `${periodLabel(state.period)}${state.ann ? "年化" : ""}報酬`;
    const head = cols().map((c) => {
      const sorted = state.sort.key === c.key;
      const label = c.key === "ret" ? retLabel : c.label;
      const arrow = sorted ? (state.sort.dir > 0 ? " ▲" : " ▼") : "";
      return `<th class="${c.cls || ""}${sorted ? " sorted" : ""}" ${c.sortable ? `data-sort="${c.key}"` : ""}>${esc(label)}${arrow}</th>`;
    }).join("");
    const selSet = new Set(F.sel);
    const body = rows.map((r, i) => {
      const e = r.e, m = r.m, v = M.vol(e);
      return `<tr class="${selSet.has(e.code) ? "is-sel" : ""}" data-code="${esc(e.code)}">
        <td class="rank">${i + 1}</td>
        <td class="c"><input type="checkbox" aria-label="比較 ${esc(e.code)}" data-sel="${esc(e.code)}" ${selSet.has(e.code) ? "checked" : ""} ${!selSet.has(e.code) && F.sel.length >= MAX_SEL ? "disabled" : ""}></td>
        <td class="l"><span class="name" data-detail="${esc(e.code)}"><span class="code">${esc(e.code)}</span>${esc(e.name)}</span></td>
        <td class="c hide-sm"><span class="tag ${e.active ? "active" : "passive"}">${e.active ? "主動" : "被動"}</span></td>
        <td class="l hide-sm" title="${esc(e.cat)}">${esc(e.theme)}</td>
        <td class="c hide-sm"><span class="tag ${M.regionCls(e.region)}${e.regionGuess ? " guess" : ""}"${e.regionGuess ? ' title="依名稱推測，尚未人工確認"' : ""}>${esc(e.region)}${e.regionGuess ? "?" : ""}</span></td>
        <td class="num">${num(e.last)}${e.lastDate < DATA.asof ? `<div class="stale" title="資料來源尚未更新此檔，期間終點較其他檔早">至 ${esc(e.lastDate.slice(5).replace("-", "/"))}</div>` : ""}</td>
        <td class="num">${m ? pct(r.retShown) : `<span class="na">資料不足</span>`}</td>
        <td class="num">${m && m.vol != null ? (m.vol * 100).toFixed(1) + "%" : NA}</td>
        <td class="num">${m ? pct(m.mdd, 1) : NA}</td>
        <td class="num">${m ? (m.divSum ? num(m.divSum, 3) : '<span class="na">0</span>') : NA}</td>
        <td class="num">${r.y12 ? `${(r.y12 * 100).toFixed(2)}% <span class="na">(${r.cnt12}次)</span>` : NA}</td>
        <td class="num">${v ? Math.round(v).toLocaleString() : NA}</td>
        <td class="hide-sm">${esc(e.listed || "")}</td>
      </tr>`;
    }).join("");
    $("#tbl").innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
    $("#rank-sub").textContent = `${rows.length} 檔｜${MODES[state.mode]}｜${periodLabel(state.period)}${F.theme ? `｜主題：${F.theme}` : ""}`;
    const notes = [];
    if (short) notes.push(state.hideShort ? `另有 ${short} 檔因掛牌未滿此期間（或期間內無資料）未列出，取消「隱藏資料不足」可顯示。` : `${short} 檔資料不足，排在最後。`);
    if (state.period.kind === "quick" && state.period.key === "max") notes.push("「上市以來」各檔起點不同，不宜直接相互比較。");
    if (state.ann) notes.push("年化報酬只對期間 ≥ 1 年者顯示，其餘仍為累積報酬。");
    const staleN = rows.filter((r) => r.e.lastDate < DATA.asof).length;
    if (staleN) notes.push(`${staleN} 檔資料未更新到 ${DATA.asof}，收盤欄有標示，短期間報酬不宜直接比較。`);
    if (!rows.length) notes.push("沒有符合條件的 ETF。");
    $("#tbl-note").textContent = notes.join(" ");
  }

  // ---------- 比較圖
  function renderCompare() {
    const picks = F.sel.map((c) => byCode[c]).filter(Boolean);
    const benches = [...F.bench].map((c) => byCode[c]).filter((b) => b && !F.sel.includes(b.code));
    const all = picks.concat(benches);
    const host = $("#chart");
    const bn = BENCH[0] ? BENCH[0].name : "";
    $("#cmp-sub").textContent = `${MODES[state.mode]}｜${periodLabel(state.period)}${state.mode !== "price" && bn ? `｜${bn}為價格指數（不含息）` : ""}`;
    if (!picks.length) {
      host.innerHTML = '<div class="hint">在下方排行勾選最多 8 檔 ETF，這裡會畫出同一起點（0%）的走勢比較。</div>';
      $("#cmp-table").innerHTML = "";
      return;
    }
    const lines = [];
    let x0 = Infinity, x1 = -Infinity, y0 = 0, y1 = 0;
    all.forEach((etf, i) => {
      const isBench = i >= picks.length, color = isBench ? "--bench" : COLORS[i % COLORS.length];
      const r = resolve(etf, state.period);
      if (!r) { lines.push({ etf, pts: null, isBench, color }); return; }
      const mode = BENCH.includes(etf) ? "price" : state.mode;
      const ser = mode === "price" ? etf.c : etf.tr, base = ser[r.s];
      const pts = [];
      for (let k = r.s; k <= r.e; k++) {
        const v = mode === "trx" ? (etf.c[k] + etf.cd[k] - etf.cd[r.s]) / etf.c[r.s] - 1 : ser[k] / base - 1;
        pts.push([etf.dates[k], v]);
        if (v < y0) y0 = v; if (v > y1) y1 = v;
      }
      x0 = Math.min(x0, pts[0][0]); x1 = Math.max(x1, pts[pts.length - 1][0]);
      lines.push({ etf, pts, isBench, color });
    });
    const W = 860, H = 320, L = 52, R = 14, T = 12, B = 26;
    if (!isFinite(x0) || x1 <= x0) { host.innerHTML = '<div class="hint">所選 ETF 在此期間都沒有足夠資料。</div>'; $("#cmp-table").innerHTML = ""; return; }
    const pad = (y1 - y0) * 0.06 || 0.01; y0 -= pad; y1 += pad;
    const sx = (x) => L + (x - x0) / (x1 - x0) * (W - L - R);
    const sy = (y) => T + (y1 - y) / (y1 - y0) * (H - T - B);
    const yt = niceTicks(y0, y1, 5), xt = dateTicks(x0, x1, 6);
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="走勢比較圖"><g class="grid">`;
    yt.forEach((v) => { svg += `<line x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}" ${Math.abs(v) < 1e-9 ? 'class="zero"' : ""}/>`; });
    svg += `</g><g class="axis">`;
    yt.forEach((v) => { svg += `<text x="${L - 6}" y="${sy(v) + 4}" text-anchor="end">${(v * 100).toFixed(Math.abs(y1 - y0) < 0.1 ? 1 : 0)}%</text>`; });
    xt.forEach((d, i) => { svg += `<text x="${sx(d)}" y="${H - 8}" text-anchor="${i === 0 ? "start" : i === xt.length - 1 ? "end" : "middle"}">${fromDay(d).slice(0, 7)}</text>`; });
    svg += `</g>`;
    lines.forEach((ln) => {
      if (!ln.pts) return;
      const d = ln.pts.map((p, i) => `${i ? "L" : "M"}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join("");
      svg += `<path class="line${ln.isBench ? " bench" : ""}" stroke="var(${ln.color})" d="${d}"/>`;
    });
    svg += `<line class="cursor" id="cursor" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/></svg>`;
    const legend = lines.map((ln) => `<span><i class="sw" style="background:var(${ln.color})"></i>${esc(ln.etf.code)} ${esc(ln.etf.name)}${ln.pts ? "" : "（資料不足）"}${ln.isBench ? "" : `<span class="x" data-unsel="${esc(ln.etf.code)}" title="移除">✕</span>`}</span>`).join("");
    host.innerHTML = svg + `<div class="legend">${legend}</div><div class="tip" id="tip" hidden></div>`;
    hookHover(host, lines, sx, x0, x1, W, L, R);

    const qc = QUICK.filter(([k]) => k !== "max");
    let t = `<table class="cmp"><thead><tr><th class="l">ETF</th><th>目前期間</th>${qc.map(([, l]) => `<th>${l}</th>`).join("")}<th>期間波動</th><th>期間回撤</th></tr></thead><tbody>`;
    all.forEach((etf, i) => {
      const mode = BENCH.includes(etf) ? "price" : state.mode;
      const cur = resolve(etf, state.period), m = cur ? metrics(etf, cur, mode) : null;
      t += `<tr><td class="l"><i class="sw" style="background:var(${i < picks.length ? COLORS[i % COLORS.length] : "--bench"})"></i>${esc(etf.code)} ${esc(etf.name)}</td>`;
      t += `<td>${m ? pct(state.ann && m.ann != null ? m.ann : m.ret) : NA}</td>`;
      qc.forEach(([k]) => { t += `<td>${pct(quickRet(etf, k, mode, false))}</td>`; });
      t += `<td>${m && m.vol != null ? (m.vol * 100).toFixed(1) + "%" : "—"}</td><td>${m ? pct(m.mdd, 1) : "—"}</td></tr>`;
    });
    $("#cmp-table").innerHTML = t + "</tbody></table>";
  }
  function niceTicks(a, b, n) {
    const raw = (b - a) / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
    const out = []; for (let v = Math.ceil(a / step) * step; v <= b + 1e-12; v += step) out.push(+v.toFixed(10)); return out;
  }
  function dateTicks(a, b, n) { const out = []; for (let i = 0; i <= n; i++) out.push(Math.round(a + (b - a) * i / n)); return out; }
  function hookHover(host, lines, sx, x0, x1, W, L, R) {
    const svg = host.querySelector("svg"), tip = host.querySelector("#tip"), cur = host.querySelector("#cursor");
    const xs = lines.map((ln) => (ln.pts ? ln.pts.map((p) => p[0]) : null));
    const show = (clientX) => {
      const rect = svg.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width * W;
      if (x < L || x > W - R) { tip.hidden = true; cur.setAttribute("visibility", "hidden"); return; }
      const day = Math.round(x0 + (x - L) / (W - L - R) * (x1 - x0));
      let html = `<b>${fromDay(day)}</b>`;
      lines.forEach((ln, k) => {
        if (!ln.pts) return;
        const i = lastIdxLE(xs[k], day);
        if (i < 0) return;
        html += `<div class="row"><span><i class="sw" style="background:var(${ln.color})"></i>${esc(ln.etf.code)}</span>${pct(ln.pts[i][1])}</div>`;
      });
      tip.innerHTML = html; tip.hidden = false;
      const px = (x - L) / (W - L - R);
      tip.style.left = px > 0.6 ? "8px" : "auto"; tip.style.right = px > 0.6 ? "auto" : "8px";
      cur.setAttribute("x1", sx(day)); cur.setAttribute("x2", sx(day)); cur.setAttribute("visibility", "visible");
    };
    svg.addEventListener("mousemove", (ev) => show(ev.clientX));
    svg.addEventListener("touchmove", (ev) => { show(ev.touches[0].clientX); ev.preventDefault(); }, { passive: false });
    svg.addEventListener("mouseleave", () => { tip.hidden = true; cur.setAttribute("visibility", "hidden"); });
  }

  // ---------- 明細
  function openDetail(code) {
    const e = byCode[code]; if (!e) return;
    const y = yield12(e), v = M.vol(e);
    const rows = QUICK.map(([k, l]) => {
      const r = resolve(e, { kind: "quick", key: k });
      if (!r) return `<tr><td class="l">${l}</td><td colspan="4"><span class="na">資料不足</span></td></tr>`;
      const a = metrics(e, r, "price"), b = metrics(e, r, "tr"), c = metrics(e, r, "trx");
      return `<tr><td class="l">${l}<span class="na"> ${fromDay(a.start)}起</span></td><td>${pct(a.ret)}</td><td>${pct(b.ret)}</td><td>${pct(c.ret)}</td><td>${b.ann != null ? pct(b.ann) : NA}</td></tr>`;
    }).join("");
    const yrs = YEARS.map((yy) => [yy, yearRet(e, yy, "price"), yearRet(e, yy, "tr")]).filter((r) => r[1] != null);
    const yearTbl = yrs.length ? `<table class="cmp"><thead><tr><th class="l">年度</th>${yrs.map((r) => `<th>${r[0] === YEARS[0] ? r[0] + "至今" : r[0]}</th>`).join("")}</tr></thead><tbody>
      <tr><td class="l">不含息</td>${yrs.map((r) => `<td>${pct(r[1], 1)}</td>`).join("")}</tr>
      <tr><td class="l">含息再投入</td>${yrs.map((r) => `<td>${pct(r[2], 1)}</td>`).join("")}</tr></tbody></table>` : '<div class="na">掛牌未滿一個完整年度。</div>';
    const divs = e.divs.slice().reverse().slice(0, 24).map((d) =>
      `<tr><td class="l">${fromDay(d.day)}</td><td>${num(d.amount, 3)}</td><td>${(d.amount / d.close * 100).toFixed(2)}%</td></tr>`).join("");
    const [href, linkText] = M.link(e);
    $("#detail").innerHTML = `
      <div class="dlg-head"><h3>${esc(e.code)} ${esc(e.name)} <span class="tag ${e.active ? "active" : "passive"}">${e.active ? "主動式" : "被動式"}</span></h3>
        <button class="btn" data-close>關閉</button></div>
      <div class="dlg-body">
        <div class="kv">
          <div><span>主題</span><b>${esc(e.theme)}</b></div><div><span>分類</span><b>${esc(e.cat)}</b></div>
          <div><span>投資地區</span><b>${esc(e.region)}${e.regionGuess ? "（依名稱推測）" : ""}</b></div><div><span>市場</span><b>${esc(e.market)}</b></div>
          <div><span>${esc(M.listedLabel)}</span><b>${esc(e.listed || "—")}</b></div><div><span>資料起點</span><b>${esc(e.d0)}</b></div>
          <div><span>最新收盤</span><b>${M.ccy}${num(e.last)}</b> <span>(${esc(e.lastDate)})</span></div>
          <div><span>近 12 月配息率</span><b>${y.y ? (y.y * 100).toFixed(2) + "%" : "—"}</b> <span>${y.cnt} 次</span></div>
          <div><span>${esc(M.volLabel)}</span><b>${v ? Math.round(v).toLocaleString() : "—"}</b></div>
          <div><span>外部連結</span><a href="${href}" target="_blank" rel="noopener">${esc(linkText)}</a></div>
        </div>
        ${(e.adj || []).length ? `<div class="na" style="margin-top:8px">價格已依偵測到的分割／反分割回溯調整：${e.adj.map(([d, f]) => `${esc(d)} ×${f}`).join("、")}</div>` : ""}
        <h4>標準期間報酬</h4>
        <table class="cmp"><thead><tr><th class="l">期間</th><th>不含息</th><th>含息再投入</th><th>含息不再投入</th><th>含息年化</th></tr></thead><tbody>${rows}</tbody></table>
        <h4>歷年報酬</h4>
        <div class="tbl-wrap">${yearTbl}</div>
        <h4>配息紀錄（最近 24 次，除息日／每單位／以當日收盤計之單次殖利率）</h4>
        ${divs ? `<table class="cmp"><thead><tr><th class="l">除息日</th><th>配息</th><th>單次殖利率</th></tr></thead><tbody>${divs}</tbody></table>` : '<div class="na">沒有配息紀錄（或資料來源未收錄）。</div>'}
      </div>`;
    $("#detail").showModal();
  }

  // ---------- 其他
  function stampAndFooter() {
    $("#stamp").textContent = `${M.label}資料至 ${DATA.asof}｜更新 ${DATA.generated}`;
    const errs = (DATA.errors || []);
    $("#footer").innerHTML = `
      <div>來源：${esc(DATA.sources.list)}；價格與配息：${esc(DATA.sources.prices)}。共 ${DATA.count} 檔，每個交易日收盤後自動更新。</div>
      <div>說明：報酬以<b>市價（收盤價）</b>計算，非基金淨值；「含息再投入」假設除息日以收盤價買回，「含息不再投入」為價格差＋累計配息；
      天／週／月／年以日曆推算，起點取該日或之前最近一個交易日；年化波動以日報酬標準差 ×√252。${esc(M.note)}
      未計手續費、交易稅、匯差與配息相關稅費。僅供參考，非投資建議。</div>
      ${errs.length ? `<details><summary>本次更新有 ${errs.length} 項提示（抓取失敗者沿用前次資料）</summary>${errs.map((x) => `<div>${esc(x)}</div>`).join("")}</details>` : ""}`;
  }
  function refresh() {
    writeHash();
    renderThemes();
    if (state.view === "rank") { renderTable(); renderCompare(); }
  }
  function rerender() { renderControls(); refresh(); }
  function goTheme(theme) {
    F.theme = theme; F.q = ""; state.view = "rank"; state.sort = { key: "ret", dir: -1 };
    rerender();
    $("#views").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function bind() {
    $("#mkt").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-mkt]"); if (!b || b.dataset.mkt === state.mkt) return;
      state.mkt = b.dataset.mkt;
      if (!FILTERS[state.mkt]) FILTERS[state.mkt] = freshFilters(state.mkt);
      F = FILTERS[state.mkt];
      start();
    });
    $("#views").addEventListener("click", (ev) => { const b = ev.target.closest("[data-view]"); if (!b) return; state.view = b.dataset.view; rerender(); });
    $("#quick").addEventListener("click", (ev) => { const b = ev.target.closest("[data-q]"); if (!b) return; state.period = { kind: "quick", key: b.dataset.q }; rerender(); });
    $("#custom-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const n = parseInt($("#c-n").value, 10); if (!(n > 0)) return;
      state.period = { kind: "custom", n, unit: $("#c-unit").value }; rerender();
    });
    $("#range-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const from = $("#r-from").value, to = $("#r-to").value;
      if (!from || !to || from >= to) { alert("起日必須早於訖日"); return; }
      state.period = { kind: "range", from, to }; rerender();
    });
    $("#mode").addEventListener("click", (ev) => { const b = ev.target.closest("[data-mode]"); if (!b) return; state.mode = b.dataset.mode; rerender(); });
    $("#type").addEventListener("click", (ev) => { const b = ev.target.closest("[data-type]"); if (!b) return; F.type = b.dataset.type; rerender(); });
    $("#theme-mode").addEventListener("click", (ev) => { const b = ev.target.closest("[data-tm]"); if (!b) return; state.themeMode = b.dataset.tm; state.themeSort = { key: "cur", dir: -1 }; rerender(); });
    $("#ann").addEventListener("change", (ev) => { state.ann = ev.target.checked; refresh(); });
    $("#inc-lev").addEventListener("change", (ev) => { state.incLev = ev.target.checked; refresh(); });
    $("#hide-short").addEventListener("change", (ev) => { state.hideShort = ev.target.checked; refresh(); });
    $("#market").addEventListener("change", (ev) => { F.exchange = ev.target.value; rerender(); });
    $("#theme").addEventListener("change", (ev) => { F.theme = ev.target.value; refresh(); });
    $("#minvol").addEventListener("change", (ev) => { F.minVol = Math.max(0, +ev.target.value || 0); rerender(); });
    let qt; $("#q").addEventListener("input", (ev) => { clearTimeout(qt); qt = setTimeout(() => { F.q = ev.target.value; refresh(); }, 150); });
    $("#cats").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-cat]"); if (!b) return;
      const c = b.dataset.cat;
      if (c === "*") F.cats = F.cats.size === M.cats.length ? new Set() : new Set(M.cats);
      else if (F.cats.has(c)) F.cats.delete(c); else F.cats.add(c);
      rerender();
    });
    $("#regions").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-region]"); if (!b) return;
      const r = b.dataset.region; if (F.regions.has(r)) F.regions.delete(r); else F.regions.add(r);
      rerender();
    });
    $("#bench").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-bench]"); if (!b) return;
      const c = b.dataset.bench; if (F.bench.has(c)) F.bench.delete(c); else F.bench.add(c);
      rerender();
    });
    $("#theme-tbl").addEventListener("click", (ev) => {
      const th = ev.target.closest("th[data-tsort]");
      if (th) { const k = th.dataset.tsort; state.themeSort = state.themeSort.key === k ? { key: k, dir: -state.themeSort.dir } : { key: k, dir: k === "name" ? 1 : -1 }; refresh(); return; }
      const tr = ev.target.closest("tr[data-theme]"); if (tr) goTheme(tr.dataset.theme);
    });
    $("#hero").addEventListener("click", (ev) => { const b = ev.target.closest("[data-theme]"); if (b) goTheme(b.dataset.theme); });
    $("#tbl").addEventListener("click", (ev) => {
      const th = ev.target.closest("th[data-sort]");
      if (th) { const k = th.dataset.sort; state.sort = state.sort.key === k ? { key: k, dir: -state.sort.dir } : { key: k, dir: ["code", "theme", "region", "listed"].includes(k) ? 1 : -1 }; refresh(); return; }
      const d = ev.target.closest("[data-detail]"); if (d) openDetail(d.dataset.detail);
    });
    $("#tbl").addEventListener("change", (ev) => {
      const cb = ev.target.closest("[data-sel]"); if (!cb) return;
      const c = cb.dataset.sel;
      if (cb.checked) { if (!F.sel.includes(c) && F.sel.length < MAX_SEL) F.sel.push(c); }
      else F.sel = F.sel.filter((x) => x !== c);
      refresh();
    });
    $("#chart").addEventListener("click", (ev) => { const x = ev.target.closest("[data-unsel]"); if (!x) return; F.sel = F.sel.filter((c) => c !== x.dataset.unsel); refresh(); });
    $("#clear-sel").addEventListener("click", () => { F.sel = []; refresh(); });
    $("#detail").addEventListener("click", (ev) => { if (ev.target.closest("[data-close]") || ev.target === ev.currentTarget) $("#detail").close(); });
    $("#csv").addEventListener("click", () => {
      const head = ["排名", "代號", "名稱", "類型", "分類", "主題", "地區", "市場", "收盤", `${periodLabel(state.period)}報酬%(${MODES[state.mode]})`, "年化報酬%", "起日", "訖日", "年化波動%", "最大回撤%", "期間配息", "近12月配息率%", "近12月配息次數", M.volLabel, M.listedLabel];
      const lines = rowsCache.map((r, i) => {
        const e = r.e, m = r.m;
        return [i + 1, e.code, e.name, e.active ? "主動" : "被動", e.cat, e.theme, e.region, e.market, e.last,
          m ? pctPlain(m.ret) : "", m && m.ann != null ? pctPlain(m.ann) : "", m ? fromDay(m.start) : "", m ? fromDay(m.end) : "",
          m && m.vol != null ? pctPlain(m.vol, 1) : "", m ? pctPlain(m.mdd, 1) : "", m ? m.divSum.toFixed(3) : "",
          pctPlain(r.y12), r.cnt12, Math.round(M.vol(e)), e.listed || ""].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
      });
      const blob = new Blob(["﻿" + [head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `${state.mkt}-etf-${periodCode(state.period)}-${state.mode}-${DATA.asof}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    window.addEventListener("hashchange", () => { const prev = state.mkt; readHash(); if (state.mkt !== prev) start(); else rerender(); });
  }

  // ---------- 啟動／切換市場
  let token = 0;
  function start() {
    const my = ++token, key = state.mkt;
    document.querySelectorAll("#mkt .mkt-btn").forEach((b) => b.setAttribute("aria-selected", b.dataset.mkt === key));
    if (!LOADED[key]) { $("#app").hidden = true; $("#loading").hidden = false; $("#loading").textContent = `${MKT[key].label} ETF 資料載入中…`; }
    loadMarket(key).then((pack) => {
      if (my !== token) return;
      M = MKT[key]; DATA = pack.raw; ETFS = pack.etfs; BENCH = pack.bench;
      byCode = {}; ETFS.concat(BENCH).forEach((e) => { byCode[e.code] = e; });
      ASOF = toDay(DATA.asof);
      const y1 = ymdOf(ASOF)[0], y0 = Math.max(y1 - 10, Math.min(...ETFS.map((e) => ymdOf(e.dates[0])[0])) + 1);
      YEARS = []; for (let y = y1; y >= y0; y--) YEARS.push(y);
      F.sel = F.sel.filter((c) => byCode[c]);
      if (F.theme && !ETFS.some((e) => e.theme === F.theme)) F.theme = "";
      $("#loading").hidden = true; $("#app").hidden = false;
      stampAndFooter(); rerender();
    }).catch(() => {
      if (my !== token) return;
      $("#app").hidden = true; $("#loading").hidden = false;
      $("#loading").textContent = `尚無${MKT[key].label} ETF 資料。請到 GitHub 的 Actions 分頁手動執行一次「ETF 績效資料」。`;
      $("#stamp").textContent = "";
    });
  }

  readHash();
  bind();
  start();
})();
