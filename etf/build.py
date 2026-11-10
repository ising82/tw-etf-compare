"""組裝：ETF 清單 + Yahoo 日線 → docs/data/etf.js（網頁直接以 <script> 載入，本機開檔也能用）。

資料格式（每檔）：
  d0   第一筆日期（ISO）
  dd   與前一筆相隔天數（第一筆為 0），累加即可還原日期
  c    收盤價（Yahoo 已就分割回溯調整）
  div  [[列索引, 每單位配息], ...]（除息日對應的列；含息報酬在網頁端計算）
  vol20 近 20 日平均成交量（股）
  adj  [[日期, 倍數], ...] 偵測到的分割／反分割（Yahoo 常漏掉台灣槓反 ETF 的反分割），舊價已乘上倍數
含息／年化／波動／回撤等全部在網頁端計算，Python 只負責抓資料與合併快取。
"""
import json
import os
import time
from datetime import date, datetime, timedelta

from concurrent.futures import ThreadPoolExecutor

from .util import now_tw
from . import universe, us, yahoo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STALE_DAYS = 25      # 快取最後日期太舊就全抓
PAUSE = 0.3          # 每個執行緒每檔之間停一下，避免被 Yahoo 限流
WORKERS = 3
MAX_STREAK = 12      # 連續失敗這麼多檔就判定被限流，其餘沿用快取，讓部署不被拖住

MARKETS = {
    "tw": {"label": "台股", "file": "etf.js", "prefix": "window.ETF_DATA=", "collect": universe.collect,
           "start": yahoo.EPOCH_2000, "close_hour": 14, "detect_splits": True, "yahoo_names": False,
           "bench": [{"code": "^TWII", "name": "加權指數", "yahoo": "^TWII", "cat": "指數", "note": "價格指數，不含股息"}],
           "sources": {"list": "證交所／櫃買中心 ISIN 名冊", "prices": "Yahoo Finance（市價、除息）"}},
    "us": {"label": "美股", "file": "us.js", "prefix": "window.ETF_DATA_US=", "collect": us.collect,
           "start": 1262304000, "close_hour": 17, "detect_splits": False, "yahoo_names": True,   # 2010-01-01 起
           "bench": [{"code": "^GSPC", "name": "S&P 500 指數", "yahoo": "^GSPC", "cat": "指數", "note": "價格指數，不含股息"}],
           "sources": {"list": "人工挑選的約 250 檔代表性美股 ETF（etf/us.py）", "prices": "Yahoo Finance（市價、配息；2010 年起）"}},
}
OUT = os.path.join(ROOT, "docs", "data", MARKETS["tw"]["file"])   # 目前處理中的輸出檔（run 會依市場改寫）
PREFIX = MARKETS["tw"]["prefix"]


# ---------------------------------------------------------------- 快取

def load_cache():
    try:
        with open(OUT, encoding="utf-8") as f:
            text = f.read()
        text = text[text.index("{"):].rstrip().rstrip(";")
        data = json.loads(text)
        out = {}
        for e in data.get("etfs", []) + data.get("bench", []):
            out[e["code"]] = decode(e)
        return out
    except Exception:  # noqa: BLE001 — 沒有快取或格式不對就全抓
        return {}


def load_previous_list():
    """前次資料檔裡的 ETF 清單（代號、名稱、市場、上市日），給清單來源失敗時備援。"""
    try:
        with open(OUT, encoding="utf-8") as f:
            text = f.read()
        data = json.loads(text[text.index("{"):].rstrip().rstrip(";"))
        return [{k: e.get(k, "") for k in ("code", "name", "market", "listed")} for e in data.get("etfs", [])]
    except Exception:  # noqa: BLE001
        return []


def decode(e):
    """壓縮格式 → {"rows": {日期: [收盤, 量]}, "div": {日期: 金額}}。"""
    rows, div = {}, {}
    if e.get("d0") and e.get("dd"):
        d = date.fromisoformat(e["d0"])
        dates = []
        for i, gap in enumerate(e["dd"]):
            d = d + timedelta(days=gap)
            dates.append(d.isoformat())
            rows[d.isoformat()] = [e["c"][i], 0]
        for idx, amt in e.get("div") or []:
            if 0 <= idx < len(dates):
                div[dates[idx]] = amt
    return {"rows": rows, "div": div, "splits": [], "adj": [list(a) for a in e.get("adj") or []],
            "name": e.get("name", ""), "first": e.get("listed", "")}


def encode(hist):
    dates = sorted(hist["rows"])
    if not dates:
        return None
    dd, prev = [], None
    for d in dates:
        cur = date.fromisoformat(d)
        dd.append(0 if prev is None else (cur - prev).days)
        prev = cur
    closes = [round(hist["rows"][d][0], 2) for d in dates]
    pos = {d: i for i, d in enumerate(dates)}
    div = []
    for d in sorted(hist["div"]):
        i = pos.get(d)
        if i is None:  # 除息日不是交易日（罕見），對到之後第一個交易日
            later = [x for x in dates if x > d]
            i = pos[later[0]] if later else None
        if i is not None and i > 0:
            div.append([i, round(hist["div"][d], 4)])
    vols = [hist["rows"][d][1] for d in dates[-20:] if hist["rows"][d][1]]
    return {"d0": dates[0], "dd": dd, "c": closes, "div": div, "adj": hist.get("adj") or [],
            "vol20": int(sum(vols) / len(vols)) if vols else 0,
            "last": closes[-1], "lastDate": dates[-1]}


SPLIT_N = (2, 3, 4, 5, 8, 10)


def adjust_splits(hist):
    """偵測未被 Yahoo 調整的分割／反分割：相鄰兩日收盤比接近整數倍（±12%）就把之前的價格與配息乘上倍數。

    ETF 單日漲跌不可能接近 2 倍或腰斬（台股有漲跌幅限制，海外槓桿 ETF 也遠不到），所以誤判機率極低；
    偵測結果會存進 adj 欄位，網頁明細會標示。"""
    rows, div = hist["rows"], hist["div"]
    dates = sorted(rows)
    found = []
    for i in range(1, len(dates)):
        p0, p1 = rows[dates[i - 1]][0], rows[dates[i]][0]
        if not p0 or not p1:
            continue
        r = p1 / p0
        factor = None
        for n in SPLIT_N:
            if abs(r - n) / n < 0.12:
                factor = float(n)          # 反分割 n 合 1：舊價 ×n
            elif abs(r - 1 / n) * n < 0.12:
                factor = 1 / n             # 分割 1 拆 n：舊價 ÷n
        if factor:
            for d in dates[:i]:
                rows[d][0] *= factor
                rows[d][1] = int(rows[d][1] / factor)
            for d in list(div):
                if d < dates[i]:
                    div[d] *= factor
            found.append([dates[i], round(factor, 4)])
    known = {a[0] for a in hist.get("adj") or []}
    hist["adj"] = sorted((hist.get("adj") or []) + [a for a in found if a[0] not in known])
    return found


def merge(old, new):
    rows = dict(old["rows"]) if old else {}
    rows.update(new["rows"])                       # 同日期以新資料為準
    div = dict(old["div"]) if old else {}
    div.update(new["div"])
    return {"rows": rows, "div": div, "splits": new.get("splits", []),
            "adj": (old or {}).get("adj") or [], "filled": new.get("filled", False),
            "name": new.get("name") or (old or {}).get("name", ""),
            "first": new.get("first") or (old or {}).get("first", "")}


# ---------------------------------------------------------------- 主流程

def _update(symbol, cached, full, errors, label, cfg):
    last = max(cached["rows"]) if cached and cached["rows"] else None
    stale = (not last) or (date.today() - date.fromisoformat(last)).days > STALE_DAYS
    need_full = full or stale
    kw = {"start": cfg["start"], "close_hour": cfg["close_hour"]}
    try:
        new = yahoo.fetch_history(symbol, "max" if need_full else "1mo", **kw)
        if not need_full and new["splits"] and max(new["splits"]) > last:
            new = yahoo.fetch_history(symbol, "max", **kw)   # 期間有分割：Yahoo 會回溯調整舊價，要整段重抓
            need_full = True
    except Exception as e:  # noqa: BLE001
        errors.append(f"{label}：{e}")
        return cached
    if not new["rows"]:
        errors.append(f"{label}：Yahoo 沒有價格資料")
        return cached
    return new if need_full else merge(cached, new)


def run(full=False, limit=None, market="tw"):
    global OUT, PREFIX
    cfg = MARKETS[market]
    OUT = os.path.join(os.path.dirname(OUT), cfg["file"])
    PREFIX = cfg["prefix"]
    t0 = time.time()
    errors = []
    if not full and now_tw().weekday() == 5:
        full = True          # 每週六整段重抓，吸收 Yahoo 的事後修正
    etfs = cfg["collect"](errors, load_previous_list())
    t_list = time.time() - t0
    if limit:
        etfs = etfs[:limit]
    if not etfs:
        print(f"{cfg['label']}：抓不到 ETF 清單，保留原檔不動")
        for e in errors:
            print(" -", e)
        return 1
    cache = load_cache()
    print(f"{cfg['label']} ETF {len(etfs)} 檔（清單 {t_list:.0f} 秒），快取 {len(cache)} 檔，{'全抓' if full else '增量'}", flush=True)

    def work(e):
        errs = []
        hist = _update(e["yahoo"], cache.get(e["code"]), full, errs, f"{e['code']} {e['name']}", cfg)
        time.sleep(PAUSE)
        return hist, errs

    out_etfs = []
    filled, done = 0, 0
    streak, halted = 0, False
    with ThreadPoolExecutor(WORKERS) as pool:
        for i in range(0, len(etfs), 12):
            chunk = etfs[i:i + 12]
            results = [(cache.get(e["code"]), []) for e in chunk] if halted else list(pool.map(work, chunk))
            for e, (hist, errs) in zip(chunk, results):
                done += 1
                errors.extend(errs)
                streak = streak + 1 if errs else 0
                if streak >= MAX_STREAK and not halted:
                    halted = True
                    errors.append(f"連續 {MAX_STREAK} 檔抓取失敗（可能被 Yahoo 限流），其餘 {len(etfs) - done} 檔沿用前次資料")
                    print(" !", errors[-1])
                if not hist:
                    continue
                if hist.get("filled"):
                    filled += 1
                if cfg["detect_splits"]:
                    for day, factor in adjust_splits(hist):
                        print(f"  {e['code']} {e['name']}：{day} 偵測到{'反' if factor > 1 else ''}分割 ×{factor:g}，已回溯調整")
                enc = encode(hist)
                if not enc:
                    continue
                item = {k: e[k] for k in ("code", "name", "market", "listed", "active", "cat", "theme", "region", "regionGuess")}
                if cfg["yahoo_names"]:
                    item["name"] = hist.get("name") or e["name"]
                    item["listed"] = hist.get("first") or e["listed"]
                item.update(enc)
                out_etfs.append(item)
            if done % 48 == 0:
                print(f"  {done}/{len(etfs)}（{time.time() - t0:.0f} 秒）", flush=True)

    bench = []
    for b in cfg["bench"]:
        hist = cache.get(b["code"]) if halted else _update(b["yahoo"], cache.get(b["code"]), full, errors, b["name"], cfg)
        enc = encode(hist) if hist else None
        if enc:
            item = dict(b)
            item.update(enc)
            bench.append(item)

    if filled:
        print(f"  以 Yahoo 即時報價補上最新收盤：{filled} 檔")
    asof = max((e["lastDate"] for e in out_etfs), default="")
    stale = [e["code"] for e in out_etfs if e["lastDate"] < asof]
    if stale:
        errors.append(f"{len(stale)} 檔最新資料早於 {asof}（Yahoo 尚未更新），網頁會標示：{' '.join(stale[:20])}{' …' if len(stale) > 20 else ''}")
    data = {"market": market, "generated": now_tw().strftime("%Y-%m-%d %H:%M"), "asof": asof,
            "count": len(out_etfs), "errors": errors, "sources": cfg["sources"],
            "etfs": out_etfs, "bench": bench}
    if not out_etfs:
        print(f"{cfg['label']}：沒有任何價格資料，保留原檔不動")
        for e in errors[:30]:
            print(" -", e)
        return 1
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(PREFIX + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    size = os.path.getsize(OUT) / 1e6
    print(f"{cfg['label']}完成：{len(out_etfs)} 檔，最新交易日 {asof}，{size:.1f} MB，{time.time() - t0:.0f} 秒，錯誤 {len(errors)} 筆")
    for e in errors[:30]:
        print(" -", e)
    return 0
