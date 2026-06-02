# AI業務分析ヒートマップ生成手順

## 目的

`input/source/` に配置された業務マニュアル・FAQ・業務ドキュメントを分析し、
AI導入効果が高い業務領域をヒートマップとして可視化する。

## 成果物

以下2つを `output/` に生成する。

1. `analysis_YYYYMMDD.json` — 業務分析結果の構造化データ
2. `analysis_YYYYMMDD.html` — ヒートマップとTo-Be業務フローを閲覧できる単一HTML

## 実行手順

### Step 1: 入力ファイルを確認する

`input/source/` に業務ドキュメントが配置されていることを確認する。
対応形式: `.txt` / `.md`（PoCフェーズ）、`.pdf` / `.docx`（将来対応）

動作確認用のサンプルは `input/source/sample_manual.txt` に同梱されている。

### Step 2: 入力文書を正規化する

`prompts/01_normalize_prompt.md` の指示に従い、各ドキュメントを読み込んで
分析しやすい構造化テキストに整形し、`input/normalized/` に保存する。

出力例: `input/normalized/sample_manual.md`

### Step 3: 業務分析・スコアリングを実行する

`prompts/02_analysis_prompt.md` の指示に従い、`input/normalized/` の内容を分析して
`output/analysis_YYYYMMDD.json` を生成する。（YYYYMMDDは実行日付）

### Step 4: HTMLを生成する

`prompts/03_render_prompt.md` の指示に従い、生成したJSONを
`templates/heatmap_template.html` に埋め込んで `output/analysis_YYYYMMDD.html` を生成する。

draw.io フロー図（As-Is / To-Be）を生成する場合は、`templates/flow_template.drawio` を
フォーマット見本として参照し、`output/flows/` に保存する。

### Step 5: ブラウザで確認する

生成された `output/analysis_YYYYMMDD.html` をブラウザで開く。

---

## 分析ルール

- 業務フローは2段階で整理する
  - 上段: 大分類フロー（5〜8フェーズ）
  - 下段: 具体ステップ（各フェーズに2〜4ステップ）
- 業務カテゴリーは入力文書から実態に合わせて抽出する（5〜8カテゴリー）
- AI導入効果は以下の4軸で評価する（詳細は `prompts/02_analysis_prompt.md` 参照）
  - 作業時間削減インパクト（ウェイト 45%）
  - 作業頻度・件数（ウェイト 25%）
  - 実装容易性（ウェイト 20%）
  - 品質改善・ミス削減効果（ウェイト 10%）
- TOP3についてはAs-Is / To-Be業務フローを必ず作成する
- To-BeではHuman / AI / Human Review / Systemを明示する
- スコアの根拠と前提条件を `reason` フィールドに必ず記載する

---

## フォルダ構成

```
業務プロセス分析/
├── input/
│   ├── source/          ← ここに業務ドキュメントを置く
│   └── normalized/      ← Step 2 で自動生成される
├── prompts/
│   ├── 01_normalize_prompt.md
│   ├── 02_analysis_prompt.md
│   └── 03_render_prompt.md
├── templates/
│   ├── heatmap_template.html
│   └── flow_template.drawio   ← draw.io フロー図のフォーマット見本
├── output/
│   ├── analysis_YYYYMMDD.json   ← Step 3 で生成
│   ├── analysis_YYYYMMDD.html   ← Step 4 で生成
│   └── flows/                   ← draw.io フロー図ファイルの保存先
└── AGENTS.md                    ← この手順書
```

---

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| `input/source/` が空 | ドキュメントをコピーして再実行 |
| JSONが生成されない | `prompts/02_analysis_prompt.md` を参照して手動で分析指示を再実行 |
| HTMLが真っ白 | ブラウザの開発者ツールでコンソールエラーを確認 |
| スコアが不自然 | `output/analysis_YYYYMMDD.json` を直接編集して再レンダリング |
| draw.io図が表示されない | インターネット接続を確認（`viewer.diagrams.net` への接続が必要） |

---

## 将来の拡張予定

- Step 4（今後）: PDF / .docx 対応を追加
- Step 5（今後）: 複数業務ドキュメント横断分析
