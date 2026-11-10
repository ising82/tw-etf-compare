"""台灣 ETF 清單與分類。

清單來源：證交所 ISIN 名冊（上市 strMode=2、上櫃 strMode=4，含上市日），
備援：證交所／櫃買中心每日收盤 OpenAPI（只有代號與名稱）。
分類：依證交所代號末碼規則（A 主動式、B 債券、L 槓桿、R 反向、U 期貨）加上名稱關鍵字，
屬啟發式判斷，網頁上有說明。
"""
import re

from .util import fetch, fetch_json

ISIN = "https://isin.twse.com.tw/isin/C_public.jsp?strMode={}"
TWSE_CLOSE = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"
TPEX_CLOSE = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes"

CODE = re.compile(r"^00\d{2,4}[A-Z]?$")
_TR = re.compile(r"<tr[^>]*>(.*?)</tr>", re.S | re.I)
_TD = re.compile(r"<td[^>]*>(.*?)</td>", re.S | re.I)
_TAG = re.compile(r"<[^>]+>")

MARKETS = (("2", "上市", ".TW"), ("4", "上櫃", ".TWO"))


def _cells(row):
    return [_TAG.sub("", c).replace("\xa0", " ").replace("&nbsp;", " ").strip() for c in _TD.findall(row)]


def _isin(mode, market):
    """ISIN 名冊欄位：有價證券代號及名稱、ISIN、上市日、市場別、產業別、CFICode、備註。"""
    html = fetch(ISIN.format(mode), timeout=60).decode("cp950", errors="replace")
    out = []
    for row in _TR.findall(html):
        cells = _cells(row)
        if len(cells) < 6:
            continue
        parts = re.split(r"[　\s]+", cells[0], maxsplit=1)
        if len(parts) != 2 or not CODE.match(parts[0]):
            continue
        cfi = cells[5]
        if cfi and not cfi.upper().startswith("CE"):  # CE = 集合投資／ETF
            continue
        listed = re.sub(r"[/.]", "-", cells[2])
        out.append({"code": parts[0], "name": parts[1], "market": market,
                    "listed": listed if re.match(r"^\d{4}-\d{2}-\d{2}$", listed) else ""})
    if not out:
        raise ValueError("名冊解析不到任何 ETF")
    return out


def _fallback(market):
    if market == "上市":
        rows = fetch_json(TWSE_CLOSE, timeout=60)
        pairs = [(r.get("Code"), r.get("Name")) for r in rows]
    else:
        rows = fetch_json(TPEX_CLOSE, timeout=60)
        pairs = [(r.get("SecuritiesCompanyCode"), r.get("CompanyName")) for r in rows]
    return [{"code": c, "name": (n or "").strip(), "market": market, "listed": ""}
            for c, n in pairs if c and CODE.match(c)]


def collect(errors):
    """回傳 [{code, name, market, listed, yahoo, active, cat, region}]，依代號排序。"""
    seen = {}
    for mode, market, suffix in MARKETS:
        try:
            rows = _isin(mode, market)
        except Exception as e:  # noqa: BLE001
            errors.append(f"ETF 名冊（{market}）：{e}，改用每日收盤清單")
            try:
                rows = _fallback(market)
            except Exception as e2:  # noqa: BLE001
                errors.append(f"ETF 清單備援（{market}）：{e2}")
                rows = []
        for r in rows:
            if r["code"] in seen:
                continue
            r["yahoo"] = r["code"] + suffix
            r.update(classify(r["code"], r["name"]))
            seen[r["code"]] = r
    return [seen[k] for k in sorted(seen)]


# ---------------------------------------------------------------- 分類
#
# 兩個維度：
#   cat    市值型 / 高股息 / 主題/產業 / 債券 / 槓桿/反向 / 商品/期貨 / 多重資產/其他
#   region 台灣 / 海外 / 跨國（同時持有台灣與海外，例如台日韓 PCB、臺韓科技）
# 先用代號末碼（A 主動股票、D 主動債券、T 平衡/多資產、B 債券、L 槓桿、R 反向、U 期貨）與名稱關鍵字推斷，
# 再套用人工整理的覆寫表（ISIN 名冊的簡稱常看不出投資地區，例如「國泰智能電動車」其實是全球）。

_OVERSEAS = ("美國", "美股", "標普", "S&P", "SP500", "那斯達克", "納斯達克", "NASDAQ", "道瓊", "費城", "費半",
             "日本", "日經", "東證", "中國", "中証", "中證", "上證", "上証", "滬深", "深証", "深證", "深100", "A50",
             "A股", "恒生", "恆生", "香港", "印度", "越南", "韓國", "KOSPI", "歐洲", "歐元", "德國", "英國", "法國",
             "全球", "世界", "亞洲", "亞太", "新興", "東協", "拉美", "巴西", "泰國", "印尼", "馬來", "菲律賓", "澳洲",
             "加拿大", "FANG", "MAG7", "已開發", "國際", "海外", "北美", "US", "ARK")
_TW = ("台灣", "臺灣", "台股", "臺股", "台50", "臺50", "富櫃", "摩台", "上櫃", "中型100", "加權")
_CAP = ("台灣50", "臺灣50", "台50", "臺50", "中型100", "MSCI台灣", "MSCI臺灣", "臺灣加權", "台灣加權", "大盤",
        "領袖50", "TOP50", "富櫃50", "摩台", "藍籌", "標普500", "S&P500", "美國500", "NASDAQ", "納斯達克", "那斯達克",
        "道瓊", "日經", "東證", "上證50", "上証", "滬深", "A50", "深100", "深証中小", "中証500", "中國50", "恒生國企",
        "歐洲50", "新興市場", "印度", "日本", "越南", "KOSPI", "世界股票", "全球藍籌", "美國50", "卓越50", "全球50")
_DIV = ("高股息", "高息", "優息", "股利", "股息", "配息", "收益", "息收", "月配", "季配", "入息", "鑫收", "填息", "存股")
_THEME = ("半導體", "科技", "生技", "醫療", "地產", "不動產", "REIT", "商社", "AI", "電動車", "未來車", "能源", "電力",
          "5G", "通訊", "金融", "創新", "研發", "航運", "資安", "機器人", "基因", "電池", "太空", "衛星", "防衛",
          "國防", "稀土", "算力", "PCB", "IC", "晶圓", "電子", "網路", "元宇宙", "支付", "綠能", "工業", "FANG", "MAG7")
_COMMODITY = ("黃金", "原油", "石油", "白銀", "期貨", "黃豆", "銅", "布蘭特", "天然氣", "美元指", "日圓")

# 投資地區覆寫（名稱看不出來或會誤判者）
_REGION = {}
for c in ("00401A 00403A 00404A 00405A 00407A 00410A 00411A 0052 0053 0055 0057 006201 00690 00692 00728 00733 00850 "
          "00881 00888 00891 00892 00894 00896 00901 00904 00905 00912 00913 00917 00918 00921 00923 00928 00935 00938 "
          "00947 00952 009802 009803 009804 009808 009809 00980A 009816 00981A 00982A 00986A 00987A 00991A 00992A "
          "00993A 00994A 00995A 00996A 00400A 00406A 00408A 0056 00701 00713 00730 00731 00878 00900 00907 00915 "
          "00919 00927 00929 00930 00932 00934 00936 00939 00940 00943 00944 00946 00961 00962 00984A 00998A 00999A "
          "0050 0051 006203 006204 006208 00922 00985A 00631L 00632R 00663L 00664R 00675L 00676R 00685L 00686R").split():
    _REGION[c] = "台灣"
for c in ("006205 00625K 00639 00703 00712 00737 00739 00770 00875 00893 00895 00897 00898 00899 00902 00903 00908 "
          "00909 00910 00920 00941 00951 00965 009805 009806 009807 009819 009821 009822 00983A 00990A 00702 00771 "
          "00882 00956 00963 00964 00972 00409A 00926 009810 009826 009827 00980T").split():
    _REGION[c] = "海外"
for c in "00735 00911 009828 00981T 00982T".split():
    _REGION[c] = "跨國"

# 名稱看不出、也還沒人工確認的推測（網頁會標「?」）
_REGION_GUESS = {"00412A": "跨國",   # 主動安聯亞半導體：亞洲半導體，通常含台股
                 "009831": "海外",   # FT 核心 AI 電力算力：FT 系列名稱無「臺灣」者皆為海外
                 "00413A": "台灣", "00415A": "台灣"}   # 名稱無地區字樣的主動式，暫依投信過往產品推測

# 類別覆寫
_CAT = {"00401A": "高股息", "00938": "主題/產業", "00690": "市值型", "006201": "市值型", "0057": "市值型",
        "009802": "市值型", "009803": "市值型", "009804": "市值型", "009808": "市值型", "009816": "市值型",
        "00922": "市值型", "00985A": "市值型", "00403A": "市值型", "00407A": "市值型", "00993A": "市值型",
        "00736": "市值型", "00752": "市值型", "00700": "市值型", "009811": "市值型", "009813": "市值型",
        "00409A": "市值型", "00858": "市值型"}


def classify(code, name):
    tail = code[-1]
    base = code[:-1] if tail in "KC" and len(code) >= 6 else code   # 雙幣 ETF 的外幣交易單位（+U／+R）
    n = name.replace(" ", "")
    active = tail in "AD" or "主動" in n
    lev = tail in "LR" or any(k in n for k in ("正2", "反1", "正二", "反一", "槓桿", "反向", "2X", "-1X"))
    bond = tail in "BD" or ("債" in n and "可轉" not in n)
    commodity = tail == "U" or (any(k in n for k in _COMMODITY) and not bond)
    overseas = any(k in n for k in _OVERSEAS)
    taiwan = any(k in n for k in _TW)

    if lev:
        cat = "槓桿/反向"
    elif bond:
        cat = "債券"
    elif commodity:
        cat = "商品/期貨"
    elif tail == "T" or any(k in n for k in ("平衡", "多重資產", "多元資產", "資產配置")):
        cat = "多重資產/其他"
    elif any(k in n for k in _DIV):
        cat = "高股息"
    elif any(k in n for k in _THEME):
        cat = "主題/產業"          # 主題字優先於國家／指數名，例如「日本半導體」不是日本大盤
    elif any(k in n for k in _CAP):
        cat = "市值型"
    else:
        cat = "主題/產業"
    cat = _CAT.get(base, cat)

    guess = False
    if base in _REGION:
        region = _REGION[base]
    elif base in _REGION_GUESS:
        region, guess = _REGION_GUESS[base], True
    elif cat in ("債券", "商品/期貨"):
        region = "台灣" if any(k in n for k in ("台債", "臺債", "台灣公債", "臺灣公債")) else "海外"
    elif overseas and taiwan:
        region = "跨國"
    elif overseas:
        region = "海外"
    elif taiwan:
        region = "台灣"
    else:
        region = "台灣"   # 台灣掛牌且名稱無任何地區字樣，預設台灣
        guess = cat not in ("債券", "商品/期貨", "槓桿/反向")   # 股票類純屬推測，網頁標「?」
    return {"active": active, "cat": cat, "region": region, "regionGuess": guess,
            "theme": _theme(tail, n, cat, region, active)}


# ---------------------------------------------------------------- 主題（比分類更細，供「主題總覽」彙總）

_SECTOR = (("半導體", ("半導體", "晶圓", "IC設計", "費城", "費半")),
           ("AI與科技", ("AI", "科技", "電子", "5G", "通訊", "資安", "網路", "雲端", "機器人", "FANG", "MAG7", "創新",
                      "元宇宙", "數位", "算力", "PCB", "數據", "太空", "衛星", "航太", "防衛", "研發")),
           ("電動車與綠能", ("電動車", "未來車", "智能車", "電池", "儲能", "綠能", "潔淨", "綠色電力", "電力", "稀土")),
           ("ESG永續", ("ESG", "永續", "公司治理", "低碳", "淨零")),
           ("金融", ("金融", "銀行")),
           ("生技醫療", ("生技", "基因", "醫療", "健康")),
           ("不動產", ("不動產", "REIT", "地產")),
           ("中小型股", ("中小", "富櫃", "上櫃", "中型")),
           ("航運與商社", ("航運", "商社")))
_COUNTRY = (("美國大盤", ("標普", "S&P", "NASDAQ", "納斯達克", "那斯達克", "道瓊", "美國", "美股")),
            ("日本", ("日本", "日經", "東證")), ("印度", ("印度",)), ("越南", ("越南",)), ("韓國", ("韓國", "KOSPI")),
            ("中國與香港", ("中國", "上證", "上証", "滬深", "深証", "深證", "深100", "A50", "A股", "中証", "中證", "恒生", "恆生", "香港")),
            ("歐洲", ("歐洲", "歐元", "德國")), ("新興市場", ("新興",)), ("全球股票", ("全球", "世界", "國際")))


def _theme(tail, n, cat, region, active):
    if cat == "槓桿/反向":
        return "反向" if tail == "R" or "反" in n else "槓桿"
    if cat == "債券":
        if any(k in n for k in ("非投", "高收益")):
            return "非投等債"
        if "新興" in n or "EM" in n:
            return "新興市場債"
        if any(k in n for k in ("金融債", "銀行債", "金融")):
            return "金融債"
        if any(k in n for k in ("投等", "投資級", "公司債", "IG", "A級", "A債", "Aa", "BBB", "電信債", "科技債", "醫療債",
                                "能源債", "製藥債", "信用債", "公用債", "電能債")):
            return "投資等級公司債"
        if any(k in n for k in ("美債", "公債", "政府債", "美國政府")):
            return "美國公債" if "中國" not in n and "澳洲" not in n else "其他債券"
        return "其他債券"
    if cat == "商品/期貨":
        return "黃金" if "黃金" in n else "原油" if any(k in n for k in ("原油", "石油", "布蘭特")) else "其他商品"
    if cat == "多重資產/其他":
        return "平衡與多重資產"
    home = region == "台灣"
    if cat == "高股息" or "特別股" in n:
        return "高股息" if home else "海外高股息"
    if cat == "市值型":
        if home:
            return "台股大盤"
        return next((t for t, ks in _COUNTRY if any(k in n for k in ks)), "海外其他")
    for t, ks in _SECTOR:
        if any(k in n for k in ks):
            return t if home else "海外" + t
    if not home:
        hit = next((t for t, ks in _COUNTRY if any(k in n for k in ks)), None)
        if hit:
            return hit
    if active:
        return "主動選股" if home else "海外主動選股"
    return "其他主題" if home else "海外其他"
