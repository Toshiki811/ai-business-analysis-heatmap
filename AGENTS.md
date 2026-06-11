# AI業務分析ヒートマップ生成手順

## 目的

`input/source/` に配置された業務マニュアル・FAQ・業務ドキュメントを分析し、AI導入効果が高い業務領域をヒートマップとして可視化する。

## 成果物

以下を `output/` に生成する。

1. `flow_axes_YYYYMMDD.json` - 業務分類別マトリクス横軸・ヒートマップ2段横軸・縦軸
2. `matrix_YYYYMMDD.md` - 業務整理マトリクス
3. `client_input_YYYYMMDD.csv` - クライアント入力用CSV
4. `analysis_YYYYMMDD.json` - 業務分析結果の構造化データ
5. `analysis_YYYYMMDD.html` - ヒートマップ、TOP3 To-Be業務フロー、業務分類別As-Isフローを閲覧できる単一HTML
6. `output/flows/*.drawio` - 業務分類別As-Is / TOP3 To-Be 業務フロー

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

### Step 5: クライアント入力用CSVを生成する

`prompts/04_client_csv_prompt.md` の指示に従い、`output/matrix_YYYYMMDD.md` から `output/client_input_YYYYMMDD.csv` を生成する。

クライアントが記入したCSVは `input/source/client_input_filled.csv` または `input/source/client_input_filled_YYYYMMDD.csv` として保存する。
CSVには確認事項への `クライアント回答` と、As-Isフローへ直接反映する業務分類単位の自由記入欄 `As-Isフロー更新内容_業務分類` を含める。旧CSVの `As-Isフロー更新内容` は互換入力として扱う。`発生頻度` と `AI導入余地_ヒアリング後` は新規CSVの入力欄としては作成しない。

### Step 6: スコアリングを実行する

`prompts/05_score_prompt.md` の指示に従い、`output/analysis_YYYYMMDD.json` を生成する。

`input/source/client_input_filled*.csv` が存在する場合は、最新更新日時のファイルを選び、実測値を仮置き値より優先する。

### Step 7: TOP3のTo-Beフローを設計する

`prompts/06_top3_flow_prompt.md` の指示に従い、スコア上位3件を選定し、`output/analysis_YYYYMMDD.json` の `top3` と `heatmap_cells[].is_top3` を更新する。

To-Beには `Human` / `AI` / `Human Review` / `System` を使用する。

TOP3専用のAs-Isフローは作成しない。As-IsはStep 8の業務分類別・業務種別別フローで確認する。

### Step 8: 業務分類別 As-Is draw.io を生成する

`scripts/render_outputs.mjs` は `matrix_tasks` から As-Is draw.io を自動生成するため、通常はこのStepをスキップしてStep 9に進んでよい。

draw.io のノード配置・分岐・スイムレーンを手動で調整したい場合のみ `prompts/07_asis_drawio_prompt.md` を参照する。
手動生成したファイルは次回の `render_outputs.mjs` 実行時に上書きされるため、変更を恒久反映するには `analysis_YYYYMMDD.json` の `matrix_tasks` または `as_is_category_updates` を修正すること。

出力先: `output/flows/asis_<業務分類>_YYYYMMDD.drawio`

### Step 9: HTMLを生成する

`prompts/08_render_prompt.md` の指示に従い、JSONとdraw.io XMLをテンプレートへ埋め込む。

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
- 回答済み確認事項を `resolved_questions` に反映
- TOP3の `top<N>_to_be.drawio` を再生成
- `metadata.created_at` と同じ日付の `asis_*.drawio` をHTMLに埋め込み
- `output/analysis_YYYYMMDD.html` を生成

### Step 10: ブラウザで確認する

生成された `output/analysis_YYYYMMDD.html` をブラウザで開く。

## 分析ルール

- 業務フローは2段階で整理する。
  - 上段: 大分類フロー（5〜8フェーズ）
  - 下段: 具体ステップ（各フェーズに2〜4ステップ）
- 業務カテゴリーは入力文書から実態に合わせて抽出する（5〜8カテゴリー）。
- 業務整理マトリクスの横軸は、業務分類ごとに作成する。横軸名・順番は他の業務分類と一致しなくてよい。
- マトリクス横軸は今のタスク粒度を維持し、原則として業務分類内の具体タスク名に近い粒度にする。
- ヒートマップの横軸は、各業務分類のタスクを抽象化・グループ化して `大分類グループ / 抽象ステップ` の2段にする。
- `matrix_tasks` には `マトリクス横軸`、`ヒートマップグループ`、`ヒートマップステップ` を持たせ、業務整理マトリクスとヒートマップの対応を明示する。
- 業務分類に該当しないタスクとのセルは `heatmap_cells` に含めない。
- ヒートマップのセルには「低」「中」「高」のみ表示する。
- スコア評価軸の詳細はTOP3モーダルの詳細情報タブにのみ表示する。
- AI導入効果は以下の4軸で評価する。
  - 作業時間削減インパクト（ウェイト45%）
  - 作業頻度・件数（ウェイト25%）
  - 実装容易性（ウェイト20%）
  - 品質改善・ミス削減効果（ウェイト10%）
- TOP3についてはTo-Be業務フローを必ず作成する。TOP3クリック時はAs-Isフローを表示しない。
- As-Isフローは業務分類別・業務種別別フローとして作成し、条件分岐、例外処理、差戻し、再承認が想定される場合は判断ノード（ひし形）と分岐矢印で表現する。
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
│   └── 業務フロー図_テンプレート.drawio
├── output/
│   ├── flow_axes_YYYYMMDD.json
│   ├── matrix_YYYYMMDD.md
│   ├── client_input_YYYYMMDD.csv
│   ├── analysis_YYYYMMDD.json
│   ├── analysis_YYYYMMDD.html
│   └── flows/
└── AGENTS.md
```

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| `input/source/` が空 | ドキュメントをコピーして再実行 |
| マトリクスが生成されない | `prompts/03_matrix_prompt.md` を参照して再実行 |
| CSVが生成されない | `prompts/04_client_csv_prompt.md` を参照して再実行 |
| As-Is フロー図が draw.io で開けない | XMLが壊れていないか確認し、`prompts/07_asis_drawio_prompt.md` を再参照 |
| JSONが生成されない | `prompts/05_score_prompt.md` を参照して再実行 |
| TOP3が表示されない | `prompts/06_top3_flow_prompt.md` の出力が `analysis_YYYYMMDD.json` に反映されているか確認 |
| HTMLが真っ白 | ブラウザの開発者ツールでコンソールエラーを確認 |
| プレースホルダーが残る | `node scripts/render_outputs.mjs --date YYYYMMDD` を再実行 |
| ヒアリング後の値が反映されない | `client_input_filled*.csv` が `input/source/` に配置されているか確認 |
| draw.io図が表示されない | インターネット接続を確認（`viewer.diagrams.net` への接続が必要） |

## 将来の拡張予定

- PDF / `.docx` の自動抽出対応
- 複数業務ドキュメント横断分析
- スコアリング工程の完全スクリプト化
