# 02 フロー軸・業務カテゴリー抽出プロンプト

## 目的

`input/normalized/` の正規化済みドキュメントから、業務整理マトリクス用の業務分類別横軸と、AI導入効果ヒートマップ用の抽象化2段横軸、縦軸となる業務カテゴリーを抽出する。

この工程ではスコアリング、TOP3選定、HTML生成は行わない。

## 入力

- `input/normalized/` 内の全 `.md` / `.txt` ファイル
- 既に作成済みの `output/matrix_YYYYMMDD.md` がある場合は参考にしてよい

## 出力

`output/flow_axes_YYYYMMDD.json`

```json
{
  "metadata": {
    "created_at": "YYYY-MM-DD",
    "source_documents": ["ファイル名"]
  },
  "category_flow_columns": {
    "業務分類1": [
      {
        "group": "業務分類内フェーズ名",
        "steps": ["タスク粒度の横軸1", "タスク粒度の横軸2"]
      }
    ]
  },
  "heatmap_columns": [
    {
      "group": "抽象化グループ名",
      "steps": ["抽象ステップ1", "抽象ステップ2"]
    }
  ],
  "flow_columns": [
    {
      "group": "後方互換用の抽象化グループ名",
      "steps": ["抽象ステップ1", "抽象ステップ2"]
    }
  ],
  "categories": ["業務分類1", "業務分類2"],
  "normalization_notes": [
    {
      "flow_step": "抽象ステップ名",
      "source_task_examples": ["元タスク名1", "元タスク名2"],
      "reason": "正規化した理由"
    }
  ]
}
```

## 抽出ルール

- `category_flow_columns` は業務分類ごとに作成する。横軸名・順番は他の業務分類と一致させなくてよい。
- `category_flow_columns[].steps[]` は、業務分類内の実タスク粒度に近い名称にする。原則としてマトリクスの `マトリクス横軸` と完全一致させる。
- `heatmap_columns` はAI導入効果ヒートマップ用に、各業務分類の具体タスクを抽象化・グループ化した2段横軸として作る。
- `heatmap_columns[].group` は上段、`steps[]` は下段として表示される。後続の `heatmap_cells[].heatmap_group` / `flow_step` と完全一致できる名称にする。
- `flow_columns` は旧HTML・旧JSON互換用に `heatmap_columns` と同じ内容を入れてよい。
- 業務カテゴリーは入力文書の実態に合わせて5〜8個抽出する。
- ヒートマップ横軸は個別タスク名をそのまま並べず、最大公約数の抽象ステップ名に正規化する。
- 業務分類に該当しないタスクとの組み合わせは、この工程では作らない。

## 抽象ステップ名の例

| 抽象ステップ名 | 対象タスク例 |
|---|---|
| 受付 | 問合せ受付、申請受付、依頼受付 |
| 内容確認 | 内容確認、内容チェック、情報確認 |
| 情報収集・照合 | 情報調査、情報検索、資料確認、突合 |
| 文書・帳票作成 | 回答作成、文書作成、書類作成 |
| 承認・確認 | 上長承認、最終確認、承認依頼 |
| システム入力 | CRM入力、システム登録、会計入力 |
| 送信・連絡 | 顧客送信、連絡、通知 |
| 記録・報告 | 対応記録、月次レポート、報告書作成 |

## 注意事項

- この工程の出力を、後続の `03_matrix_prompt.md`、`05_score_prompt.md`、`06_top3_flow_prompt.md` の正本として使う。
- 業務整理マトリクスの横軸正本は `category_flow_columns`、ヒートマップの横軸正本は `heatmap_columns` である。
- `heatmap_columns[].steps[]` に存在しない文字列を後続工程の `flow_step` に使わない。
- 判断に迷う場合は `normalization_notes` に根拠を残す。
