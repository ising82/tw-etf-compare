"""美股 ETF 清單（人工挑選、人工標主題）。

美國掛牌 ETF 約四千檔，全抓既慢又多是成交稀少的重複商品；這裡收錄各主題規模／成交量具代表性的約 250 檔。
名稱與掛牌日以 Yahoo Finance 回傳為準（抓不到時用這裡的簡稱）。要增減直接改下面的清單即可。

欄位：分類 cat、主題 theme、地區 region（美國／非美／全球）、是否主動式。
"""

_ROWS = []


def _add(cat, theme, region, items, active=()):
    for it in items.split(";"):
        it = it.strip()
        if not it:
            continue
        code, _, name = it.partition(":")
        _ROWS.append({"code": code.strip(), "name": name.strip(), "cat": cat, "theme": theme, "region": region,
                      "active": code.strip() in active})


# ---- 大盤
_add("大盤", "美國大盤", "美國", "SPY:SPDR S&P 500; VOO:Vanguard S&P 500; IVV:iShares Core S&P 500; VTI:Vanguard Total Stock Market;"
     " ITOT:iShares Core S&P Total US; SCHB:Schwab US Broad Market; DIA:SPDR Dow Jones Industrial Average;"
     " DFAC:Dimensional US Core Equity 2", active=("DFAC",))
_add("大盤", "那斯達克100", "美國", "QQQ:Invesco QQQ; QQQM:Invesco NASDAQ 100")
_add("大盤", "超大型股", "美國", "XLG:Invesco S&P 500 Top 50; OEF:iShares S&P 100; MGC:Vanguard Mega Cap; MAGS:Roundhill Magnificent Seven")
_add("大盤", "美國中小型股", "美國", "IWM:iShares Russell 2000; IJR:iShares Core S&P Small-Cap; VB:Vanguard Small-Cap;"
     " IJH:iShares Core S&P Mid-Cap; MDY:SPDR S&P MidCap 400; VO:Vanguard Mid-Cap")
_add("大盤", "等權重", "美國", "RSP:Invesco S&P 500 Equal Weight")
_add("大盤", "全球股票", "全球", "VT:Vanguard Total World Stock; ACWI:iShares MSCI ACWI")

# ---- 風格因子
_add("風格因子", "成長", "美國", "VUG:Vanguard Growth; IWF:iShares Russell 1000 Growth; SCHG:Schwab US Large-Cap Growth; MGK:Vanguard Mega Cap Growth")
_add("風格因子", "價值", "美國", "VTV:Vanguard Value; IWD:iShares Russell 1000 Value; SCHV:Schwab US Large-Cap Value;"
     " COWZ:Pacer US Cash Cows 100; AVUV:Avantis US Small Cap Value", active=("AVUV",))
_add("風格因子", "動能", "美國", "MTUM:iShares MSCI USA Momentum Factor")
_add("風格因子", "品質", "美國", "QUAL:iShares MSCI USA Quality Factor; MOAT:VanEck Morningstar Wide Moat")
_add("風格因子", "低波動", "美國", "USMV:iShares MSCI USA Min Vol Factor; SPLV:Invesco S&P 500 Low Volatility")

# ---- 高股息／收益
_add("高股息/收益", "高股息", "美國", "VYM:Vanguard High Dividend Yield; SCHD:Schwab US Dividend Equity; DVY:iShares Select Dividend;"
     " HDV:iShares Core High Dividend; SDY:SPDR S&P Dividend; SPYD:SPDR Portfolio S&P 500 High Dividend")
_add("高股息/收益", "股息成長", "美國", "VIG:Vanguard Dividend Appreciation; DGRO:iShares Core Dividend Growth; NOBL:ProShares S&P 500 Dividend Aristocrats")
_add("高股息/收益", "掩護性買權", "美國", "JEPI:JPMorgan Equity Premium Income; JEPQ:JPMorgan Nasdaq Equity Premium Income;"
     " QYLD:Global X NASDAQ 100 Covered Call; XYLD:Global X S&P 500 Covered Call; DIVO:Amplify CWP Enhanced Dividend Income",
     active=("JEPI", "JEPQ", "DIVO"))
_add("高股息/收益", "特別股", "美國", "PFF:iShares Preferred & Income Securities")

# ---- 產業
_add("產業", "科技", "美國", "XLK:Technology Select Sector SPDR; VGT:Vanguard Information Technology; IYW:iShares US Technology")
_add("產業", "金融", "美國", "XLF:Financial Select Sector SPDR; VFH:Vanguard Financials")
_add("產業", "銀行", "美國", "KBE:SPDR S&P Bank; KRE:SPDR S&P Regional Banking")
_add("產業", "能源", "美國", "XLE:Energy Select Sector SPDR; VDE:Vanguard Energy")
_add("產業", "油氣探勘與服務", "美國", "XOP:SPDR S&P Oil & Gas Exploration & Production; OIH:VanEck Oil Services")
_add("產業", "醫療保健", "美國", "XLV:Health Care Select Sector SPDR; VHT:Vanguard Health Care")
_add("產業", "生技", "美國", "IBB:iShares Biotechnology; XBI:SPDR S&P Biotech")
_add("產業", "醫療器材", "美國", "IHI:iShares US Medical Devices")
_add("產業", "工業", "美國", "XLI:Industrial Select Sector SPDR")
_add("產業", "運輸與航空", "美國", "IYT:iShares US Transportation; JETS:US Global Jets")
_add("產業", "非必需消費", "美國", "XLY:Consumer Discretionary Select Sector SPDR; XRT:SPDR S&P Retail")
_add("產業", "住宅建商", "美國", "ITB:iShares US Home Construction; XHB:SPDR S&P Homebuilders")
_add("產業", "必需消費", "美國", "XLP:Consumer Staples Select Sector SPDR")
_add("產業", "公用事業", "美國", "XLU:Utilities Select Sector SPDR")
_add("產業", "原物料", "美國", "XLB:Materials Select Sector SPDR")
_add("產業", "不動產", "美國", "XLRE:Real Estate Select Sector SPDR; VNQ:Vanguard Real Estate; IYR:iShares US Real Estate; SCHH:Schwab US REIT")
_add("產業", "通訊服務", "美國", "XLC:Communication Services Select Sector SPDR")

# ---- 主題
_add("主題", "半導體", "美國", "SMH:VanEck Semiconductor; SOXX:iShares Semiconductor; XSD:SPDR S&P Semiconductor; SOXQ:Invesco PHLX Semiconductor")
_add("主題", "軟體", "美國", "IGV:iShares Expanded Tech-Software Sector")
_add("主題", "網路安全", "全球", "CIBR:First Trust NASDAQ Cybersecurity; HACK:Amplify Cybersecurity; BUG:Global X Cybersecurity")
_add("主題", "雲端運算", "美國", "SKYY:First Trust Cloud Computing; CLOU:Global X Cloud Computing; WCLD:WisdomTree Cloud Computing")
_add("主題", "AI與機器人", "全球", "BOTZ:Global X Robotics & Artificial Intelligence; ROBO:ROBO Global Robotics and Automation;"
     " AIQ:Global X Artificial Intelligence & Technology; CHAT:Roundhill Generative AI & Technology", active=("CHAT",))
_add("主題", "破壞式創新", "美國", "ARKK:ARK Innovation; ARKW:ARK Next Generation Internet; ARKG:ARK Genomic Revolution;"
     " ARKQ:ARK Autonomous Technology & Robotics; ARKF:ARK Fintech Innovation; FINX:Global X FinTech",
     active=("ARKK", "ARKW", "ARKG", "ARKQ", "ARKF"))
_add("主題", "數據中心與數位基建", "全球", "SRVR:Pacer Data & Infrastructure Real Estate; DTCR:Global X Data Center & Digital Infrastructure")
_add("主題", "潔淨能源", "全球", "ICLN:iShares Global Clean Energy; TAN:Invesco Solar; QCLN:First Trust NASDAQ Clean Edge Green Energy; PBW:Invesco WilderHill Clean Energy")
_add("主題", "電動車與電池", "全球", "LIT:Global X Lithium & Battery Tech; DRIV:Global X Autonomous & Electric Vehicles; IDRV:iShares Self-Driving EV and Tech")
_add("主題", "核能與鈾", "全球", "URA:Global X Uranium; URNM:Sprott Uranium Miners; NLR:VanEck Uranium and Nuclear")
_add("主題", "國防航太", "美國", "ITA:iShares US Aerospace & Defense; XAR:SPDR S&P Aerospace & Defense; PPA:Invesco Aerospace & Defense; SHLD:Global X Defense Tech")
_add("主題", "太空", "全球", "UFO:Procure Space; ARKX:ARK Space Exploration & Innovation", active=("ARKX",))
_add("主題", "基礎建設與電網", "美國", "PAVE:Global X US Infrastructure Development; IFRA:iShares US Infrastructure; GRID:First Trust NASDAQ Clean Edge Smart Grid Infrastructure")
_add("主題", "貴金屬礦業", "全球", "GDX:VanEck Gold Miners; GDXJ:VanEck Junior Gold Miners; SIL:Global X Silver Miners; SILJ:Amplify Junior Silver Miners")
_add("主題", "工業金屬礦業", "全球", "COPX:Global X Copper Miners; REMX:VanEck Rare Earth and Strategic Metals; XME:SPDR S&P Metals & Mining;"
     " PICK:iShares MSCI Global Metals & Mining Producers; SLX:VanEck Steel")
_add("主題", "水資源與農業", "全球", "PHO:Invesco Water Resources; MOO:VanEck Agribusiness")
_add("主題", "遊戲電競", "全球", "ESPO:VanEck Video Gaming and eSports; HERO:Global X Video Games & Esports")
_add("主題", "區塊鏈", "全球", "BLOK:Amplify Transformational Data Sharing; BKCH:Global X Blockchain", active=("BLOK",))
_add("主題", "大麻", "美國", "MSOS:AdvisorShares Pure US Cannabis", active=("MSOS",))

# ---- 加密貨幣
_add("加密貨幣", "比特幣", "全球", "IBIT:iShares Bitcoin Trust; FBTC:Fidelity Wise Origin Bitcoin; GBTC:Grayscale Bitcoin Trust; BITO:ProShares Bitcoin")
_add("加密貨幣", "以太幣", "全球", "ETHA:iShares Ethereum Trust; ETHE:Grayscale Ethereum Trust")

# ---- 國家／區域
_add("國家/區域", "已開發市場(非美)", "非美", "VEA:Vanguard FTSE Developed Markets; IEFA:iShares Core MSCI EAFE; EFA:iShares MSCI EAFE; SCHF:Schwab International Equity")
_add("國家/區域", "新興市場", "非美", "VWO:Vanguard FTSE Emerging Markets; IEMG:iShares Core MSCI Emerging Markets; EEM:iShares MSCI Emerging Markets")
_add("國家/區域", "全球(不含美國)", "非美", "VXUS:Vanguard Total International Stock; ACWX:iShares MSCI ACWI ex US; IXUS:iShares Core MSCI Total International Stock")
_add("國家/區域", "歐洲", "非美", "VGK:Vanguard FTSE Europe; EZU:iShares MSCI Eurozone; FEZ:SPDR EURO STOXX 50; EWG:iShares MSCI Germany;"
     " EWU:iShares MSCI United Kingdom; EWQ:iShares MSCI France; EWI:iShares MSCI Italy; EWP:iShares MSCI Spain; EWL:iShares MSCI Switzerland")
_add("國家/區域", "日本", "非美", "EWJ:iShares MSCI Japan; DXJ:WisdomTree Japan Hedged Equity")
_add("國家/區域", "台灣", "非美", "EWT:iShares MSCI Taiwan")
_add("國家/區域", "韓國", "非美", "EWY:iShares MSCI South Korea")
_add("國家/區域", "中國與香港", "非美", "FXI:iShares China Large-Cap; MCHI:iShares MSCI China; KWEB:KraneShares CSI China Internet;"
     " ASHR:Xtrackers Harvest CSI 300 China A-Shares; EWH:iShares MSCI Hong Kong")
_add("國家/區域", "印度", "非美", "INDA:iShares MSCI India; EPI:WisdomTree India Earnings")
_add("國家/區域", "東南亞", "非美", "VNM:VanEck Vietnam; EIDO:iShares MSCI Indonesia; THD:iShares MSCI Thailand; EWS:iShares MSCI Singapore;"
     " EWM:iShares MSCI Malaysia; EPHE:iShares MSCI Philippines")
_add("國家/區域", "拉丁美洲", "非美", "EWZ:iShares MSCI Brazil; EWW:iShares MSCI Mexico; ILF:iShares Latin America 40; ARGT:Global X MSCI Argentina; ECH:iShares MSCI Chile")
_add("國家/區域", "加拿大與澳洲", "非美", "EWC:iShares MSCI Canada; EWA:iShares MSCI Australia")
_add("國家/區域", "中東與非洲", "非美", "KSA:iShares MSCI Saudi Arabia; TUR:iShares MSCI Turkey; EZA:iShares MSCI South Africa; UAE:iShares MSCI UAE")

# ---- 債券
_add("債券", "美國綜合債", "美國", "BND:Vanguard Total Bond Market; AGG:iShares Core US Aggregate Bond")
_add("債券", "美國長期公債", "美國", "TLT:iShares 20+ Year Treasury Bond; VGLT:Vanguard Long-Term Treasury; EDV:Vanguard Extended Duration Treasury")
_add("債券", "美國中期公債", "美國", "IEF:iShares 7-10 Year Treasury Bond; GOVT:iShares US Treasury Bond")
_add("債券", "美國短期公債", "美國", "SHY:iShares 1-3 Year Treasury Bond; BIL:SPDR Bloomberg 1-3 Month T-Bill; SGOV:iShares 0-3 Month Treasury Bond")
_add("債券", "抗通膨債", "美國", "TIP:iShares TIPS Bond; SCHP:Schwab US TIPS")
_add("債券", "投資等級公司債", "美國", "LQD:iShares iBoxx $ Investment Grade Corporate Bond; VCIT:Vanguard Intermediate-Term Corporate Bond")
_add("債券", "非投等債", "美國", "HYG:iShares iBoxx $ High Yield Corporate Bond; JNK:SPDR Bloomberg High Yield Bond")
_add("債券", "市政債與房貸債", "美國", "MUB:iShares National Muni Bond; MBB:iShares MBS")
_add("債券", "新興市場與國際債", "非美", "EMB:iShares JP Morgan USD Emerging Markets Bond; BNDX:Vanguard Total International Bond")

# ---- 商品
_add("商品", "黃金", "全球", "GLD:SPDR Gold Shares; IAU:iShares Gold Trust; GLDM:SPDR Gold MiniShares")
_add("商品", "白銀與鉑金", "全球", "SLV:iShares Silver Trust; PPLT:abrdn Physical Platinum Shares")
_add("商品", "能源商品", "全球", "USO:United States Oil Fund; UNG:United States Natural Gas Fund")
_add("商品", "綜合與農工商品", "全球", "DBC:Invesco DB Commodity Index Tracking; PDBC:Invesco Optimum Yield Diversified Commodity;"
     " DBA:Invesco DB Agriculture; CPER:United States Copper Index", active=("PDBC",))

# ---- 槓桿／反向
_add("槓桿/反向", "槓桿", "美國", "TQQQ:ProShares UltraPro QQQ (3x); UPRO:ProShares UltraPro S&P500 (3x); SSO:ProShares Ultra S&P500 (2x);"
     " QLD:ProShares Ultra QQQ (2x); SOXL:Direxion Daily Semiconductor Bull 3X; TECL:Direxion Daily Technology Bull 3X;"
     " FAS:Direxion Daily Financial Bull 3X; TNA:Direxion Daily Small Cap Bull 3X; UDOW:ProShares UltraPro Dow30 (3x);"
     " TMF:Direxion Daily 20+ Year Treasury Bull 3X; LABU:Direxion Daily S&P Biotech Bull 3X; YINN:Direxion Daily FTSE China Bull 3X;"
     " BITX:2x Bitcoin Strategy")
_add("槓桿/反向", "反向", "美國", "SQQQ:ProShares UltraPro Short QQQ (-3x); SPXU:ProShares UltraPro Short S&P500 (-3x); SH:ProShares Short S&P500 (-1x);"
     " PSQ:ProShares Short QQQ (-1x); SOXS:Direxion Daily Semiconductor Bear 3X; TZA:Direxion Daily Small Cap Bear 3X;"
     " SDOW:ProShares UltraPro Short Dow30 (-3x); TMV:Direxion Daily 20+ Year Treasury Bear 3X")

# ---- 多重資產
_add("多重資產", "股債配置", "全球", "AOA:iShares Core Aggressive Allocation (80/20); AOR:iShares Core Growth Allocation (60/40);"
     " AOM:iShares Core Moderate Allocation (40/60); AOK:iShares Core Conservative Allocation (30/70)")


def collect(errors, previous=None):
    seen, out = set(), []
    for r in _ROWS:
        if r["code"] in seen:
            errors.append(f"美股清單重複：{r['code']}")
            continue
        seen.add(r["code"])
        out.append(dict(r, market="美股", listed="", yahoo=r["code"], regionGuess=False))
    return out
