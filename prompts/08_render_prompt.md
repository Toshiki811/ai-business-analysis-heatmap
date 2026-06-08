# 08 HTMLレンダリングプロンプト

## 目的

`output/analysis_YYYYMMDD.json` と `output/flows/*.drawio` を `templates/heatmap_template.html` に埋め込み、単一HTMLを生成する。

この工程では分析内容の再評価、スコアリング、フロー設計は行わない。

## 入力

- `output/analysis_YYYYMMDD.json`
- `templates/heatmap_template.html`
- `output/flows/top1_as_is.drawio` 〜 `top3_to_be.drawio`（存在する場合）
- `output/flows/asis_<業務分類>_YYYYMMDD.drawio`
- `output/flows/asis_<業務分類>__<業務種別>_YYYYMMDD.drawio`

## 出力

`output/analysis_YYYYMMDD.html`

## 推奨実行コマンド

```bash
node scripts/render_outputs.mjs --date YYYYMMDD
```

任意のJSONを指定する場合:

```bash
node scripts/render_outputs.mjs --analysis output/analysis_YYYYMMDD.json
```

## 埋め込みルール

- `/* ANALYSIS_DATA_PLACEHOLDER */` をJSONデータで置換する。
- `/* DRAWIO_XML_MAP_PLACEHOLDER */` をdraw.io XMLマップで置換する。
- XMLは `JSON.stringify()` 相当の処理で安全に文字列化する。
- ファイルが存在しないdraw.ioキーは含めない。`null` も入れない。
- `render_outputs.mjs` はHTML生成前に、`matrix_tasks` から業務分類全体図と業務種別部分図を再生成する。
- `analysis.category_flows`、`analysis.business_type_flows`、`analysis.category_flow_index` を正として、HTMLの業務分類展開UIへ埋め込む。
- ヒートマップの軸は業務整理マトリクス由来の `業務分類` / `業務種別` / `共通ステップ` を正本にする。
- ヒートマップの横軸は `共通ステップ` の1段表示、縦軸は `業務分類` / `業務種別` の2段表示にする。
- `heatmap_cells` の一致条件は `category`、`business_type`、`flow_step` の3項目とする。

## draw.io XMLマップ

| キー | ファイル |
|---|---|
| `top1_as_is` | `output/flows/top1_as_is.drawio` |
| `top1_to_be` | `output/flows/top1_to_be.drawio` |
| `top2_as_is` | `output/flows/top2_as_is.drawio` |
| `top2_to_be` | `output/flows/top2_to_be.drawio` |
| `top3_as_is` | `output/flows/top3_as_is.drawio` |
| `top3_to_be` | `output/flows/top3_to_be.drawio` |
| `asis_<業務分類>_YYYYMMDD` | 業務分類全体As-Is draw.io |
| `asis_<業務分類>__<業務種別>_YYYYMMDD` | 業務種別部分As-Is draw.io |

## 注意事項

- `metadata.created_at` と一致しない日付の `asis_*.drawio` は埋め込まない。
- 業務分類行クリック時は `category_flow_index[category].category_flow_key` の全体図を表示する。
- 業務種別クリック時は `business_type_flows[].flow_key` の部分図を表示する。
- 最新JSONの `top3[].as_is_flow` / `top3[].to_be_flow` と矛盾する古いTOP3 draw.ioを埋め込まない。必要に応じて `scripts/render_outputs.mjs` でTOP3 draw.ioを再生成する。
- 生成後、HTML内に `ANALYSIS_DATA_PLACEHOLDER` / `DRAWIO_XML_MAP_PLACEHOLDER` が残っていないことを確認する。
- ヒートマップのセル表示は `低` / `中` / `高` のみとし、数値スコアはTOP3詳細に限定する。
