"""用法：python3 -m etf build [--market tw|us|all] [--full] [--limit N]

--market 要更新的市場（預設 tw；all 會依序跑台股、美股）
--full   全部重抓完整歷史（預設只抓最近一個月並與既有資料合併；每週六自動全抓）
--limit  只處理前 N 檔（本機測試用）
"""
import sys

from . import build


def main(argv):
    if not argv or argv[0] != "build":
        print(__doc__)
        return 2
    full = "--full" in argv
    limit = int(argv[argv.index("--limit") + 1]) if "--limit" in argv else None
    market = argv[argv.index("--market") + 1] if "--market" in argv else "tw"
    markets = list(build.MARKETS) if market == "all" else [market]
    if any(m not in build.MARKETS for m in markets):
        print(__doc__)
        return 2
    rc = 0
    for m in markets:
        rc = build.run(full=full, limit=limit, market=m) or rc
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]) or 0)
