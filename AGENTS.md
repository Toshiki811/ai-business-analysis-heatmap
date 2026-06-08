# AI業務分析ヒートマップ生成手順

## 目的

`input/source/` に配置された業務マニュアル・FAQ・業務ドキュメントを分析し、AI導入効果が高い業務領域をヒートマップとして可視化する。

## 成果物

以下を `output/` に生成する。

1. `flow_axes_YYYYMMDD.json` - ヒートマップの縦軸・横軸
2. `matrix_YYYYMMDD.md` - 業務整理マトリクス
3. `client_input_YYYYMMDD.csv` - クライアント入力用CSV
4. `analysis_YYYYMMDD.json` - 業務分析結果の構造化データ
5. `analysis_YYYYMMDD.html` - ヒートマップとTo-Be業務フローを閲覧できる単一HTML
6. `output/flows/*.drawio` - As-Is / To-Be 業務フロー

## 実行手順

### Step 1: 入力ファイルを確認する

`input/source/` に業務ドキュメントが配置されていることを確認する。

対応形式: `.txt` / `.md`（PoCフェーズ）、`.pdf` / `.docx`（将来対応）

動作確認用のサンプルは `input/source/sample_manual.txt` に同梱されている。

### Step 2: 入力文書を正規化する

`prompts/01_normalize_prompt.md` の指示に従い、各ドキュメントを構造化テキストへ整形し、`input/normalized/` に保存する。

出力例: `input/normalized/sample_manual.md`

### Step 3: フロー軸・業務カテゴリーを抽出する

`prompts/02_flow_axes_prompt.md` の指示に従い、ヒートマップの横軸（共通ステップ）と縦軸（業務カテゴリー）を抽出し、`output/flow_axes_YYYYMMDD.json` に保存する。

### Step 4: 業務整理マトリクスを生成する

`prompts/03_matrix_prompt.md` の指示に従い、`input/normalized/` の内容から業務整理マトリクスを生成し、`output/matrix_YYYYMMDD.md` に保存する。

初回はすべて仮案として出力する。確認事項はフロー改善に直結するものだけに限定する。

### Step 5: クライアント入力用CSVを生成する

`prompts/04_client_csv_prompt.md` の指示に従い、`output/matrix_YYYYMMDD.md` から `output/client_input_YYYYMMDD.csv` を生成する。

クライアントが記入したCSVは `input/source/client_input_filled.csv` または `input/source/client_input_filled_YYYYMMDD.csv` として保存する。

### Step 6: スコアリングを実行する

`prompts/05_score_prompt.md` の指示に従い、`output/analysis_YYYYMMDD.json` を生成する。

`input/source/client_input_filled*.csv` が存在する場合は、最新更新日時のファイルを選び、実測値を仮置き値より優先する。

### Step 7: TOP3のAs-Is / To-Beフローを設計する

`prompts/06_top3_flow_prompt.md` の指示に従い、スコア上位3件を選定し、`output/analysis_YYYYMMDD.json` の `top3` と `heatmap_cells[].is_top3` を更新する。

To-Beには `Human` / `AI` / `Human Review` / `System` を使用する。

### Step 8: 業務分類別 As-Is draw.io を生成する

`prompts/07_asis_drawio_prompt.md` の指示に従い、業務分類ごとの現状業務フローを生成する。

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

- 回答済み確認事項を `resolved_questions` に反映
- TOP3の `top<N>_as_is.drawio` / `top<N>_to_be.drawio` を再生成
- `metadata.created_at` と同じ日付の `asis_*.drawio` をHTMLに埋め込み
- `output/analysis_YYYYMMDD.html` を生成

### Step 10: ブラウザで確認する

生成された `output/analysis_YYYYMMDD.html` をブラウザで開く。

## 分析ルール

- 業務フローは2段階で整理する。
  - 上段: 大分類フロー（5〜8フェーズ）
  - 下段: 具体ステップ（各フェーズに2〜4ステップ）
- 業務カテゴリーは入力文書から実態に合わせて抽出する（5〜8カテゴリー）。
- ヒートマップの横軸タスクは、マトリクスのタスク群を最大公約数の共通ステップ名に正規化する。
- 業務分類に該当しないタスクとのセルは `heatmap_cells` に含めない。
- ヒートマップのセルには「低」「中」「高」のみ表示する。
- スコア評価軸の詳細はTOP3モーダルの詳細情報タブにのみ表示する。
- AI導入効果は以下の4軸で評価する。
  - 作業時間削減インパクト（ウェイト45%）
  - 作業頻度・件数（ウェイト25%）
  - 実装容易性（ウェイト20%）
  - 品質改善・ミス削減効果（ウェイト10%）
- TOP3についてはAs-Is / To-Be業務フローを必ず作成する。
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
│   └── flow_template.drawio
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
