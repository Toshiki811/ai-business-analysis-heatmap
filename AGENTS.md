# AI業務分析ヒートマップ生成手順

## 目的

`input/source/` に配置された業務マニュアル・FAQ・業務ドキュメントを分析し、AI導入効果が高い業務領域をヒートマップとして可視化する。

## 成果物

以下を `output/` に生成する。

1. `flow_axes_YYYYMMDD.json` - 業務分類別マトリクス横軸・ヒートマップ2段横軸・縦軸
2. `matrix_YYYYMMDD.md` - 業務整理マトリクス
3. `asis_flows_YYYYMMDD.json` - 業務種別ごとの詳細As-Isフロー（分岐・差戻し・例外・入出力帳票）
4. `client_input_YYYYMMDD.csv` - クライアント入力用CSV
5. `analysis_YYYYMMDD.json` - 業務分析結果の構造化データ
6. `analysis_YYYYMMDD.html` - ヒートマップ、TOP3 To-Be業務フロー、業務分類別As-Isフローを閲覧できる単一HTML（フローは自前インラインSVGで描画。draw.io・外部ビューア非依存）

## 実行手順

### Step 1: 入力ファイルを確認する

`input/source/` に業務ドキュメントが配置されていることを確認する。

対応形式: `.txt` / `.md`（PoCフェーズ）、`.pdf` / `.docx`（将来対応）

動作確認用のサンプルは `input/source/sample_manual.txt` に同梱されている。

### Step 2: 入力文書を正規化する

`prompts/01_normalize_prompt.md` の指示に従い、各ドキュメントを構造化テキストへ整形し、`input/normalized/` に保存する。

出力例: `input/normalized/sample_manual.md`

### Step 3: フロー軸・業務カテゴリーを抽出する

`prompts/02_flow_axes_prompt.md` の指示に従い、業務分類別のマトリクス横軸、ヒートマップ用の抽象化2段横軸、縦軸（業務カテゴリー）を抽出し、`output/flow_axes_YYYYMMDD.json` に保存する。

### Step 4: 業務整理マトリクスを生成する

`prompts/03_matrix_prompt.md` の指示に従い、`input/normalized/` の内容から業務整理マトリクスを生成し、`output/matrix_YYYYMMDD.md` に保存する。

初回はすべて仮案として出力する。確認事項はフロー改善に直結するものだけに限定する。

### Step 5: 詳細As-Isフローを抽出する

`prompts/04_asis_detail_prompt.md` の指示に従い、業務種別ごとの詳細As-Isフロー（分岐・差戻し・例外処理・実担当者・入出力帳票）を `output/asis_flows_YYYYMMDD.json` に保存する。**作図ルールの正本は [`docs/asis_flow_guideline.md`](docs/asis_flow_guideline.md)。**

- 詳細フローは**マトリクスの全業務種別分を作成する（スキップ禁止）**。粒度はノード数の数合わせでなく分割トリガー（主体/ツール/媒体が変わる・待ち承認受け渡し・判断が入る）で決める。目安は業務種別あたり10〜25ノード（6ノード以下は粗すぎ）。
- マニュアル原文に根拠のある分岐は `confidence: "explicit"` + `source_quote`、根拠のない推定分岐は `confidence: "inferred"` + `hearing_item`（確認質問）にする。
- **分岐健全性**: decisionノードは出口2本以上・行き先2経路以上・各枝ラベル・condition必須。検証はゲートに集約し差戻しを逐次に乱立させない。`scripts/lib/flows.mjs` の `checkFlowStructure` が `verify_outputs.mjs` から自動検査し、違反はerrorで停止する（単体テスト: `node --test scripts/test/flow_structure.test.mjs`）。
- `hearing_items` は業務種別あたり最低3件（うち実態確認 `question_type: "reality_check"` を1件以上）。`render_outputs.mjs` 実行時に業務整理マトリクスの確認事項へ自動転記され、クライアント入力CSVに載る。
- このファイルが存在する業務種別は、ブラウザ内の自前インラインSVGレンダラ（`templates/app/js/flow_svg.js`）が詳細フロー（動的スイムレーン・判断ひし形・書類シンボル・凡例付き）として描画する。存在しない業務種別は `matrix_tasks` からの直列フローで描画される（粗くなるため詳細フロー欠落は `verify_outputs.mjs` が警告する）。

### Step 6: クライアント入力用CSVを生成する

`prompts/05_client_csv_prompt.md` の指示に従い、`output/matrix_YYYYMMDD.md` と `output/asis_flows_YYYYMMDD.json` の `hearing_items` から `output/client_input_YYYYMMDD.csv` を生成する。

クライアントが記入したCSVは `input/source/client_input_filled.csv` または `input/source/client_input_filled_YYYYMMDD.csv` として保存する。
CSVには確認事項への `クライアント回答` と、As-Isフローへ直接反映する業務分類単位の自由記入欄 `As-Isフロー更新内容_業務分類` を含める。旧CSVの `As-Isフロー更新内容` は互換入力として扱う。`発生頻度` と `AI導入余地_ヒアリング後` は新規CSVの入力欄としては作成しない。`AI導入余地_仮案` 列も出力しない（業務整理マトリクスからAI導入余地表記を廃止したため）。

### Step 7: スコアリングを実行する

`prompts/06_score_prompt.md` の指示に従い、各セルの自動化手段（`automation_type`: ルールベース / 既存システム設定 / RPA / 生成AI / AIエージェント / 人手維持）を判定したうえで `output/analysis_YYYYMMDD.json` を生成する。

- ルールベース・設定で足りる業務は `ai_fit_score` が低くなり、AI導入効果スコアが自然に下がる。
- `input/source/client_input_filled*.csv` が存在する場合は、最新更新日時のファイルを選び、実測値を仮置き値より優先する。

### Step 8: TOP3のTo-Beフローを設計する

`prompts/07_top3_tobe_prompt.md` の指示に従い、スコア上位3件を選定し、`output/analysis_YYYYMMDD.json` の `top3` と `heatmap_cells[].is_top3` を更新する。

- To-Beには `Human` / `AI` / `Human Review` / `System` を使用する。
- 各施策に `implementation_blueprint`（ツール・参照データ・判断基準・失敗時挙動・人の確認ポイント）を作成する。`automation_type` が `rule_based` / `system_config` の施策は「AI導入ではなく設定・ルール実装を推奨」と明記する。

TOP3専用のAs-Isフローは作成しない。As-IsはStep 5の業務種別別詳細フローで確認する。

### Step 9: HTMLを生成する

`prompts/08_render_prompt.md` の指示に従い、JSONとインラインSVGレンダラ（`templates/app/js/flow_svg.js`）をテンプレートへ埋め込む。

推奨コマンド:

```bash
node scripts/render_outputs.mjs --date YYYYMMDD
```

任意のJSONを指定する場合:

```bash
node scripts/render_outputs.mjs --analysis output/analysis_YYYYMMDD.json
```

このコマンドは以下を実行する。

- 最新の `client_input_filled*.csv` があれば `クライアント回答` と業務分類単位の `As-Isフロー更新内容_業務分類` を反映
- `output/asis_flows_YYYYMMDD.json` があれば `analysis.asis_flow_details` へマージし、`hearing_items` を確認事項へ自動転記
- 回答済み確認事項を `resolved_questions` に反映
- As-Is（詳細フロー、無い業務種別は直列フォールバック）とTOP3 To-Beのフローノードをページへ埋め込み、ブラウザ内で `flow_svg.js` がSVGスイムレーン図として描画する
- `output/analysis_YYYYMMDD.html` を生成（draw.io・外部CDNビューア非依存の単一HTML）

### Step 10: ブラウザで確認する

生成された `output/analysis_YYYYMMDD.html` をブラウザで開く。

## 分析ルール

- 業務カテゴリーは入力文書から実態に合わせて抽出する（5〜8カテゴリー）。
- 各業務分類は原則2〜5個の業務種別に分解する（業務分類:業務種別 = 1:n）。業務分類と同名の業務種別1個だけ、という1:1構成は禁止し、`verify_outputs.mjs` が警告する。
- 業務整理マトリクスの横軸は、業務分類ごとに作成する。横軸名・順番は他の業務分類と一致しなくてよい。
- マトリクス横軸はマニュアルの節・手順見出しに相当する実工程粒度にする（1業務種別あたり5〜10工程）。タスクは「1タスク=1主体・1対象・1成果物」で分割し、業務種別あたり5〜15行を目安にする。
- ヒートマップの横軸は、各業務分類のタスクを抽象化・グループ化して `大分類グループ / 抽象ステップ` の2段にする（業務分類間の比較可能性のため、こちらは抽象軸を維持する）。
- `matrix_tasks` には `マトリクス横軸`、`ヒートマップグループ`、`ヒートマップステップ` を持たせ、業務整理マトリクスとヒートマップの対応を明示する。
- 業務分類に該当しないタスクとのセルは `heatmap_cells` に含めない。
- ヒートマップのセルには「低」「中」「高」のみ表示する。
- スコア評価軸の詳細はTOP3モーダルの詳細情報タブにのみ表示する。
- 各セルには自動化手段 `automation_type`（rule_based / system_config / rpa / generative_ai / ai_agent / manual）を判定基準付きで付与する。判定フローは `prompts/06_score_prompt.md` を正本とする。
- AI導入効果は以下の5軸で評価する。
  - 作業時間削減インパクト（ウェイト40%）
  - 作業頻度・件数（ウェイト20%）
  - 実装容易性（ウェイト15%）
  - 品質改善・ミス削減効果（ウェイト10%）
  - AI適合度（ウェイト15%。automation_typeから機械的に決まり、ルールベースで足りる業務はスコアが下がる）
- TOP3についてはTo-Be業務フローと `implementation_blueprint` を必ず作成する。TOP3クリック時はAs-Isフローを表示しない。
- 詳細As-Isフロー（`asis_flows_YYYYMMDD.json`）は業務種別ごとに作成し、分岐・差戻し・例外処理は判断ノード（ひし形）と分岐矢印、入出力帳票は書類シンボルで表現する。マニュアルに根拠のない分岐は推定（点線）+確認質問として扱う。
- To-Beフローも条件分岐、AI判定、人手レビュー、差戻し、例外処理が想定される場合は判断ノード（ひし形）と分岐矢印で表現する。
- スコアの根拠と前提条件を `reason` フィールドに必ず記載する。
- ヒアリング後CSVが存在する場合は実測値を仮置き値より優先してスコアリングに使用する。

## フォルダ構成

```text
業務プロセス分析/
├── input/
│   ├── source/
│   │   └── client_input_filled.csv
│   └── normalized/
├── prompts/
│   ├── 01_normalize_prompt.md
│   ├── 02_flow_axes_prompt.md
│   ├── 03_matrix_prompt.md
│   ├── 04_asis_detail_prompt.md
│   ├── 05_client_csv_prompt.md
│   ├── 06_score_prompt.md
│   ├── 07_top3_tobe_prompt.md
│   └── 08_render_prompt.md
├── scripts/
│   ├── render_outputs.mjs
│   ├── verify_outputs.mjs
│   ├── lib/                       # flows.mjs(checkFlowStructure) 等
│   └── test/                      # flow_structure.test.mjs
├── templates/
│   ├── heatmap_template.html
│   └── app/js/flow_svg.js         # 自前インラインSVGフローレンダラ
├── docs/
│   └── asis_flow_guideline.md     # As-Isフロー作図ルールの正本
├── output/
│   ├── flow_axes_YYYYMMDD.json
│   ├── matrix_YYYYMMDD.md
│   ├── asis_flows_YYYYMMDD.json
│   ├── client_input_YYYYMMDD.csv
│   ├── analysis_YYYYMMDD.json
│   └── analysis_YYYYMMDD.html
└── AGENTS.md
```

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| `input/source/` が空 | ドキュメントをコピーして再実行 |
| マトリクスが生成されない | `prompts/03_matrix_prompt.md` を参照して再実行 |
| CSVが生成されない | `prompts/05_client_csv_prompt.md` を参照して再実行 |
| 詳細As-Isフローが描画されない | `output/asis_flows_YYYYMMDD.json` の日付・`category`/`business_type` の一致を確認し、`node scripts/verify_outputs.mjs --date YYYYMMDD` で契約を確認 |
| JSONが生成されない | `prompts/06_score_prompt.md` を参照して再実行 |
| TOP3が表示されない | `prompts/07_top3_tobe_prompt.md` の出力が `analysis_YYYYMMDD.json` に反映されているか確認 |
| HTMLが真っ白 | ブラウザの開発者ツールでコンソールエラーを確認 |
| プレースホルダーが残る | `node scripts/render_outputs.mjs --date YYYYMMDD` を再実行 |
| ヒアリング後の値が反映されない | `client_input_filled*.csv` が `input/source/` に配置されているか確認 |
| フロー図が表示されない | フローは自前インラインSVG（`templates/app/js/flow_svg.js`）で描画する。ブラウザのコンソールで `FlowSvg` 関連エラーを確認し、`node scripts/verify_outputs.mjs --date YYYYMMDD` で埋め込みを検証（インターネット接続は不要） |
| 分岐が1本線・条件なしで警告/エラー | decisionの分岐健全性違反。`docs/asis_flow_guideline.md` §⑤に従い出口2本以上・2経路以上・condition・各枝ラベルを満たす |

## 将来の拡張予定

- PDF / `.docx` の自動抽出対応
- 複数業務ドキュメント横断分析
- スコアリング工程の完全スクリプト化
