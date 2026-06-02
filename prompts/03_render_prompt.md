# 03 HTML生成プロンプト

## 目的

`output/analysis_YYYYMMDD.json` を読み込み、
`templates/heatmap_template.html` のテンプレートを使って
`output/analysis_YYYYMMDD.html` を生成する。

## 入力

- `output/analysis_YYYYMMDD.json`（最新のもの）
- `templates/heatmap_template.html`

## 出力

- `output/analysis_YYYYMMDD.html`（同じ日付を使う）

---

## HTML生成手順

### Step 1: テンプレートを読み込む

`templates/heatmap_template.html` を読み込み、
プレースホルダーに JSON データを埋め込む。

### Step 2: JavaScriptのDATAオブジェクトにJSONを埋め込む

テンプレート内の以下のプレースホルダーを置換する：

```html
<script>
const ANALYSIS_DATA = /* ANALYSIS_DATA_PLACEHOLDER */;
</script>
```

↓ JSONの内容をそのまま代入する：

```html
<script>
const ANALYSIS_DATA = { ...JSONの内容... };
</script>
```

### Step 3: ファイルを保存する

出力先：`output/analysis_YYYYMMDD.html`

---

## テンプレートが担う機能

テンプレート側でJavaScriptが以下を自動処理するため、
HTML生成時はデータの埋め込みのみ行えばよい。

1. ヒートマップテーブルの動的生成
2. セル色のスコアに応じたグラデーション
3. TOP3セルの強調表示
4. TOP3セルクリック時のモーダル表示（As-Is / To-Beタブ切替）
5. TOP3以外セルのホバーツールチップ

---

## 注意事項

- テンプレートを上書きしないこと（`templates/` は読み取り専用）
- 出力は必ず `output/` ディレクトリに保存すること
- JSONのデータが空の場合は生成を中止し、エラーメッセージを出力すること
