# AI業務分析ヒートマップ

業務マニュアル・FAQ・業務ドキュメントをAIで分析し、AI導入効果が高い業務領域をヒートマップ形式で可視化するツールです。

## 必要なもの

以下のいずれかのAIエージェントが利用できること:

- [GitHub Copilot](https://github.com/features/copilot)（VS Code拡張 推奨）
- [Claude Code](https://claude.ai/code)

Python・npm等の追加インストールは**不要**

## セットアップ

### 1. リポジトリをクローンする

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
cd YOUR_REPO_NAME
```

### 2. 業務ドキュメントを配置する

`input/source/` に分析したいドキュメントをコピーする。

```
input/source/
└── your_manual.txt   ← ここに置く
```

対応形式: `.txt` / `.md`

> **動作確認だけしたい場合** はそのまま次のステップへ。`input/source/sample_manual.txt`（カスタマーサポートの架空マニュアル）が同梱されています。

## 使い方

使用するAIエージェント（GitHub Copilot / Claude Code など）でプロジェクトを開き、以下のように依頼する。

```
AGENTS.md の手順に従って分析を実行してください
```

AIエージェントが自動で Step 1〜4 を実行し、`output/` に以下を生成します。

| ファイル | 内容 |
|---|---|
| `output/analysis_YYYYMMDD.json` | 分析結果の構造化データ |
| `output/analysis_YYYYMMDD.html` | ヒートマップHTML（ブラウザで開く） |

生成後、HTML をブラウザで開く。

## フォルダ構成

```
.
├── input/
│   ├── source/          ← 業務ドキュメントを置く
│   └── normalized/      ← 自動生成（中間ファイル）
├── prompts/
│   ├── 01_normalize_prompt.md    # 入力文書の整形指示
│   ├── 02_analysis_prompt.md     # 業務分析・スコアリング指示
│   └── 03_render_prompt.md       # HTML生成指示
├── templates/
│   ├── heatmap_template.html     # ヒートマップHTMLテンプレート
│   └── flow_template.drawio      # draw.io フロー図フォーマット見本
├── output/              ← 分析結果が出力される
│   └── flows/           ← draw.io フローファイル（自動生成）
├── AGENTS.md            ← AIエージェントへの実行手順書
└── README.md
```

## 評価ロジック

AI導入効果スコア（100点満点）は以下の4軸で算出します。

| 評価軸 | ウェイト | 説明 |
|---|---|---|
| 作業時間削減インパクト | 45% | 1件あたりの削減時間 |
| 作業頻度・件数 | 25% | 発生頻度・処理件数 |
| 実装容易性 | 20% | 既存APIで対応できるか |
| 品質改善・ミス削減効果 | 10% | ミスや品質ばらつきの改善度 |

スコア上位3件（TOP3）については、As-Is / To-Be 業務フロー図（draw.io形式）を自動生成し、モーダル内でそのまま閲覧できます。

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| `input/source/` が空 | ドキュメントをコピーして再実行 |
| JSON が生成されない | `prompts/02_analysis_prompt.md` を確認し、AIエージェントに再実行を依頼 |
| HTML が真っ白 | ブラウザの開発者ツールでコンソールエラーを確認 |
| スコアが不自然 | `output/analysis_YYYYMMDD.json` を直接編集して HTML を再生成 |
| draw.io 図が表示されない | インターネット接続を確認（`viewer.diagrams.net` への接続が必要） |

## ライセンス

MIT
