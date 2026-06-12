# 08 HTMLレンダリングプロンプト

## 目的

`output/analysis_YYYYMMDD.json` と `output/flows/*.drawio` を `templates/heatmap_template.html` に埋め込み、単一HTMLを生成する。

この工程では分析内容の再評価、スコアリング、フロー設計は行わない。

## 入力

- `output/analysis_YYYYMMDD.json`
- `templates/heatmap_template.html`
- `output/flows/top1_to_be.drawio` 〜 `top3_to_be.drawio`（存在する場合）
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

## HTML画面構成・デザインルール

- 表示順は `経営サマリー`、`AI導入効果 TOP3`、`AI導入効果ヒートマップ`、`業務整理マトリクス`、`フィードバック回答のエクスポート` とする。
- ファーストビューの経営サマリーでは、既存JSONから `業務分類数`、`業務種別数`、`対象タスク数`、`効果セル数`、`高効果セル数`、`未確認事項数`、`効果分布`、`TOP3概要` を派生計算して表示する。新しい必須JSONフィールドは追加しない。
- `summary.insights` は経営サマリー内の `Key Insights` として表示する。存在しない場合は空状態を表示する。
- デザインは現行のダーク基調を維持し、濃紺一色に偏らないよう背景、面、罫線、テキスト、アクセントをCSS変数で整理する。
- 主要アクセントはブルー、進捗はグリーン、注意はアンバー、ヒートマップは赤系の濃淡に限定する。
- セクション全体を大きなカードとして囲いすぎず、反復要素、TOP3行、示唆、サマリーKPIなど情報単位だけをカード表現にする。
- 角丸は原則8px以下にし、業務ツールとして読みやすい余白、罫線、文字サイズにする。
- ヒートマップのセル表示は `低` / `中` / `高` のみとし、数値スコアはTOP3モーダルの詳細情報タブに限定する。
- ヒートマップの凡例には「ルールベース・既存システム設定で足りる業務はAI導入効果を低く評価している」旨の説明を1行添える。
- セル詳細サイドパネルには `automation_type` がある場合のみ `推奨自動化手段` を色チップ付きで表示する（ルールベース/既存システム設定=グレー、RPA/連携=シアン、生成AI=ブルー、AIエージェント=パープル、人手維持=グレー）。`ai_use_case_detail` がある場合は `入力 → 処理 → 出力` の3行表で表示する。フィールドが無い旧JSONでは表示しない。
- TOP3行にも `automation_type` チップを表示し、TOP3モーダルの詳細タブに `implementation_blueprint`（ツール / 参照データ / 判断基準 / 失敗時の挙動 / 人の確認ポイント）を定義リストで表示する。無い場合は非表示。
- 経営サマリーには `automation_type` があるセルが存在する場合のみ「自動化手段の内訳」を表示する。
- フロー図モーダルには凡例を表示する: ひし形=判断分岐、書類シンボル=入出力帳票、点線ノード=推定(要確認)、赤点線矢印=差戻し、オレンジ点線=例外処理。

## 埋め込みルール

- `/* ANALYSIS_DATA_PLACEHOLDER */` をJSONデータで置換する。
- `/* DRAWIO_XML_MAP_PLACEHOLDER */` をdraw.io XMLマップで置換する。
- XMLは `JSON.stringify()` 相当の処理で安全に文字列化する。
- ファイルが存在しないdraw.ioキーは含めない。`null` も入れない。
- `render_outputs.mjs` はHTML生成前に、`matrix_tasks` から業務分類全体図と業務種別部分図を再生成する。
- `analysis.category_flows`、`analysis.business_type_flows`、`analysis.category_flow_index` を正として、HTMLの業務分類展開UIへ埋め込む。
- 業務整理マトリクスの横軸は `category_flow_columns` と `matrix_tasks[].マトリクス横軸` を正本にし、業務分類ごとに異なる列名・順番で表示する。
- ヒートマップの横軸は `heatmap_columns[].group / steps[]` の2段表示、縦軸は `業務分類` / `業務種別` の2段表示にする。
- `heatmap_cells` の一致条件は `category`、`business_type`、`heatmap_group`、`flow_step` の4項目とする。
- 業務整理マトリクスの横軸クリック時は右サイドパネルで、対象列に値がある `matrix_tasks` のAs-Is詳細だけを表形式で表示する。
- ヒートマップの横軸またはデータセルクリック時は右サイドパネルで、対象セルの `to_be_tasks` とAI導入効果概要を表形式で表示する。
- ヒートマップ横軸クリック時のAI設計概要は、業務分類・業務種別・As-Isタスク・To-Beタスク等の対象業務表の下に表示する。
- AI設計概要には実装手順説明を表示しない。対象セルの `to_be_tasks` を元に、`共通AI機能 + 適用先業務 + スキル / ツール` の3点で、横軸タスク単位の共通化と他業務への展開しやすさを表示する。
- 共通AI機能は固定の横断機能一覧ではなく、対象ヒートマップステップまたはTo-Beタスクに共通する機能として表示する。特に `計算・作成`、`情報収集・照合`、`システム入力`、`承認・決裁`、`記録・保管` などの横軸タスク単位を共通化の主軸にする。
- 共通AI機能には `計算・作成共通機能`、`照合・確認共通機能`、`入力・連携共通機能` など、対象タスク種別で再利用できる機能を表示し、`決算整理仕訳作成`、`給与仕訳入力`、`固定資産台帳登録` などの業務固有機能は表示しない。
- 適用先業務は、共通AI機能を展開する業務分類・業務種別・代表タスク名として表示する。業務別にエージェントを量産しているように見える `個別エージェント`、`業務別エージェント一覧`、`他N業務エージェント` の表示は禁止する。
- 画面上のラベルは `差し替えスキル` ではなく `スキル` に統一する。`スキル` は業務固有の判断順序、例外条件、参照知識、出力形式を担う処理能力とし、必要に応じて `決算整理仕訳作成スキル`、`社会福祉法人経理事務マニュアル参照スキル` など代表タスク名または具体資料名由来のスキルを表示する。
- `ツール` はスキルが参照、更新、出力に使う外部接続先に限定する。候補は `会計システム`、`給与計算システム`、`申請・承認ワークフロー`、`Excel / CSV入出力`、`各種台帳DB`、`文書保管システム` などとし、`業務マニュアル・FAQ` のような資料名や知識ソースはツールとして表示しない。
- AI設計概要の説明文は「参照資料を差し替える」ではなく、「スキルで判断ルール・参照知識・出力形式を切り替える」趣旨にする。
- AI設計概要では「設計構成」という枠タイトルを表示しない。
- AI設計概要は設計構成の説明に限定し、Human Review / 承認レイヤーは独立レイヤーとして表示しない。
- 旧形式の `flow_columns` / `共通ステップ` だけを持つJSONは、後方互換として `heatmap_columns` / `マトリクス横軸` / `ヒートマップステップ` に読み替えてよい。

## draw.io XMLマップ

| キー | ファイル |
|---|---|
| `top1_to_be` | `output/flows/top1_to_be.drawio` |
| `top2_to_be` | `output/flows/top2_to_be.drawio` |
| `top3_to_be` | `output/flows/top3_to_be.drawio` |
| `asis_<業務分類>_YYYYMMDD` | 業務分類全体As-Is draw.io |
| `asis_<業務分類>__<業務種別>_YYYYMMDD` | 業務種別部分As-Is draw.io |

## 注意事項

- `metadata.created_at` と一致しない日付の `asis_*.drawio` は埋め込まない。
- 業務分類行クリック時は `category_flow_index[category].category_flow_key` の全体図を表示する。
- 業務種別クリック時は `business_type_flows[].flow_key` の部分図を表示する。
- TOP3モーダルにはTo-Beフローだけを表示し、TOP3専用As-Is draw.ioは埋め込まない。
- TOP3セルのクリックはサイドパネルを開き、パネル内の「To-Beフローを見る」ボタンからTOP3モーダルを開く。
- 最新JSONの `top3[].to_be_flow` と矛盾する古いTOP3 draw.ioを埋め込まない。必要に応じて `scripts/render_outputs.mjs` でTOP3 To-Be draw.ioを再生成する。
- 生成後、HTML内に `ANALYSIS_DATA_PLACEHOLDER` / `DRAWIO_XML_MAP_PLACEHOLDER` が残っていないことを確認する。
- ヒートマップのセル表示は `低` / `中` / `高` のみとし、数値スコアはTOP3詳細に限定する。
