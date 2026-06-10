# AI業務分析ヒートマップ

業務マニュアル・FAQ・業務ドキュメントをAIで分析し、AI導入効果が高い業務領域をヒートマップ形式で可視化するツールです。

## 必要なもの

以下のいずれかのAIエージェントが利用できること:

- GitHub Copilot（VS Code拡張 推奨）
- Claude Code
- Codex

HTML再生成にはNode.jsを使用します。外部npmパッケージは不要です。

## 使い方

1. `input/source/` に分析したい業務ドキュメントを置く。
2. AIエージェントに `AGENTS.md` の手順に従って分析するよう依頼する。
3. 生成された `output/analysis_YYYYMMDD.html` をブラウザで開く。

## 生成HTMLの構成

生成HTMLは、ビジネスレビューで読みやすい順に以下のセクションで構成されます。

1. 経営サマリー: 分析対象、業務分類数、業務種別数、対象タスク数、効果分布、TOP3概要、Key Insights
2. AI導入効果 TOP3: 優先着手候補とTo-Be業務フロー
3. AI導入効果ヒートマップ: 業務分類・業務種別と抽象工程ごとの導入効果
4. 業務整理マトリクス: As-Is業務、負担度、AI導入余地、確認事項
5. フィードバック回答のエクスポート: ヒアリング結果CSVの出力

## 分割された処理

プロンプトは1回の処理が大きくなりすぎないよう、以下に分割されています。

| ファイル | 役割 |
|---|---|
| `prompts/01_normalize_prompt.md` | 入力文書の正規化 |
| `prompts/02_flow_axes_prompt.md` | ヒートマップ縦軸・横軸の抽出 |
| `prompts/03_matrix_prompt.md` | 業務整理マトリクス生成 |
| `prompts/04_client_csv_prompt.md` | クライアント入力CSV生成 |
| `prompts/05_score_prompt.md` | スコアリングと `heatmap_cells` 生成 |
| `prompts/06_top3_flow_prompt.md` | TOP3選定とAs-Is / To-Beフロー設計 |
| `prompts/07_asis_drawio_prompt.md` | 業務分類別As-Is draw.io生成 |
| `prompts/08_render_prompt.md` | HTMLレンダリング |

## HTML再生成

分析JSONとdraw.ioファイルからHTMLを再生成する場合:

```bash
node scripts/render_outputs.mjs --date YYYYMMDD
```

任意の分析JSONを指定する場合:

```bash
node scripts/render_outputs.mjs --analysis output/analysis_YYYYMMDD.json
```

このスクリプトはTOP3 draw.ioを再生成し、日付が一致するAs-Is draw.ioだけをHTMLへ埋め込みます。
`input/source/client_input_filled.csv` または `client_input_filled_YYYYMMDD.csv` がある場合は、最新更新日時のCSVから `クライアント回答` と業務分類単位の `As-Isフロー更新内容_業務分類` を読み込み、As-Is draw.ioへ反映します。旧CSVの `As-Isフロー更新内容` は互換入力として業務分類単位のメモへ移行します。

## 再入力時の検証

新しい業務ドキュメントを投入して現在と同等のHTMLを出す場合、前段はAIエージェントが `prompts/01` 〜 `06` に従って `flow_axes`、`matrix`、`client_input`、`analysis`、`top3` を生成します。raw PDF / docx から最終HTMLまでの完全自動生成は未対応のため、まず `input/normalized/*.md` を作成してください。

`analysis_YYYYMMDD.json` を作成したら、レンダリング前にJSON契約を確認できます。

```bash
node scripts/verify_outputs.mjs --date YYYYMMDD --skip-html
```

HTML生成後は、JSON契約とHTML埋め込み状態をまとめて確認します。

```bash
node scripts/render_outputs.mjs --date YYYYMMDD
node scripts/verify_outputs.mjs --date YYYYMMDD
```

検証では、`matrix_tasks` / `heatmap_cells` / `top3` の必須項目、マトリクス軸とヒートマップ軸の一致、TOP3対象セルの存在、HTML内のプレースホルダー残存、TOP3 To-BeとAs-Is draw.ioの埋め込みを確認します。

## フォルダ構成

```text
.
├── input/
│   ├── source/
│   └── normalized/
├── prompts/
│   ├── 01_normalize_prompt.md
│   ├── 02_flow_axes_prompt.md
│   ├── 03_matrix_prompt.md
│   ├── 04_client_csv_prompt.md
│   ├── 05_score_prompt.md
│   ├── 06_top3_flow_prompt.md
│   ├── 07_asis_drawio_prompt.md
│   └── 08_render_prompt.md
├── scripts/
│   ├── render_outputs.mjs
│   └── lib/
├── templates/
│   ├── heatmap_template.html
│   └── flow_template.drawio
├── output/
│   └── flows/
├── AGENTS.md
└── README.md
```

## 評価ロジック

AI導入効果スコアは以下の4軸で算出します。

| 評価軸 | ウェイト |
|---|---|
| 作業時間削減インパクト | 45% |
| 作業頻度・件数 | 25% |
| 実装容易性 | 20% |
| 品質改善・ミス削減効果 | 10% |

ヒートマップのセルには「低」「中」「高」のみ表示し、数値スコアはTOP3詳細に限定します。

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| `input/source/` が空 | ドキュメントをコピーして再実行 |
| JSONが生成されない | `prompts/05_score_prompt.md` を確認 |
| TOP3が表示されない | `prompts/06_top3_flow_prompt.md` の反映を確認 |
| HTMLが真っ白 | ブラウザの開発者ツールでコンソールエラーを確認 |
| プレースホルダーが残る | `node scripts/render_outputs.mjs --date YYYYMMDD` を再実行 |
| draw.io図が表示されない | `viewer.diagrams.net` への接続を確認 |

## ライセンス

MIT
