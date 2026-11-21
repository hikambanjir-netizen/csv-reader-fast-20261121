# csv-reader-fast-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/hikambanjir-netizen/csv-reader-fast-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/hikambanjir-netizen/csv-reader-fast-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast drop-in for csv-reader 1.0.0: it returns exactly csv-reader's `{columns, rows, errors}` answer for every broken CSV input — BOM, stray CRs, unterminated quotes, quote junk, CRLF inside quotes, short and long rows — while running about 2–3x faster than the house baseline on the practice set. The speed comes from jumping instead of walking: whole quote-free lines split in one call, unquoted fields found with `indexOf` jumps, quoted fields sliced whole from quote to quote.

## Run it

```sh
node main.ts
```

`main.ts` reads every case from `/input/cases.json` (or `$MAKEFUN_INPUT_DIR`), answers each with `run()` from `solve.js`, and writes `/output/answers.json` (or `$MAKEFUN_OUTPUT_DIR`). `solve.js` is a dependency-free ES module; `run(input)` takes `{text, header}` and returns `{columns, rows, errors}`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=dfkzjsa3&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
