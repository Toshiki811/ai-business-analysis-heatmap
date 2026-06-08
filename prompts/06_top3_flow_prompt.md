# 06 TOP3選定・As-Is/To-Beフロー設計プロンプト

## 目的

`output/analysis_YYYYMMDD.json` の `heatmap_cells` からTOP3を選定し、各施策のAs-Is / To-Be業務フローをJSONに追加する。

この工程ではdraw.io XML生成とHTML生成は行わない。

## 入力

- `output/analysis_YYYYMMDD.json`
- `output/matrix_YYYYMMDD.md`
- `input/source/client_input_filled.csv` または `input/source/client_input_filled_YYYYMMDD.csv`（存在する場合）

## 出力

更新後の `output/analysis_YYYYMMDD.json`

追加・更新する主な項目:

- `heatmap_cells[].is_top3`
- `top3`
- `resolved_questions`（必要に応じて）

## TOP3選定ルール

- `heatmap_cells` を `score` の降順で並べ、上位3件を選ぶ。
- 同点の場合は、`time_reduction_score`、`frequency_score`、`implementation_ease_score` の順に比較する。
- TOP3に選んだセルは `is_top3: true` にし、それ以外は `false` にする。
- `heatmap_cells` は `category` / `business_type` / `flow_step` の組み合わせを1セルとみなす。
- `top3[].target_category`、`top3[].target_business_type`、`top3[].target_flow_step` は、対象セルの `category` / `business_type` / `flow_step` と完全一致させる。

## クライアント回答の反映ルール

`クライアント回答` がある行は、単なる根拠追記で終わらせずフローに反映する。

- 担当者、承認者、処理順序、分岐条件、例外処理、差戻し、再承認、システム連携が分かる場合は、`as_is_flow` / `to_be_flow` に反映する。
- `（確認不要）` の場合は、その確認事項に由来する未確定の承認・分岐・例外を追加しない。
- 回答がフローに影響しない場合でも、影響しない理由を対象施策の説明または `reason` に書く。
- 回答済み設問は再質問しない。

## `top3` スキーマ

```json
{
  "rank": 1,
  "title": "施策タイトル（20字以内）",
  "target_category": "対象業務カテゴリー",
  "target_business_type": "対象業務種別",
  "target_flow_step": "対象フローステップ",
  "current_issue": "現状課題",
  "ai_solution": "AI導入の具体策",
  "expected_effect": "期待効果",
  "risks": "リスク・注意点",
  "as_is_flow": [
    {
      "step": "ステップ名",
      "actor": "Human",
      "description": "現状の作業内容"
    }
  ],
  "to_be_flow": [
    {
      "step": "ステップ名",
      "actor": "Human | AI | Human Review | System",
      "description": "AI導入後の作業内容"
    }
  ]
}
```

## To-Be actor

- `Human`: 人間が実施する作業
- `AI`: AIが自動処理する作業
- `Human Review`: AIの処理結果を人間が確認・承認する作業
- `System`: 既存システムが自動処理する作業

## 注意事項

- TOP3は必ずAs-IsとTo-Beの両方を持つ。
- To-Beでは4つのactorを必要に応じて使い分ける。
- AIに任せる範囲と人が確認する範囲を曖昧にしない。
- `top3` は後続の `scripts/render_outputs.mjs` が draw.io に変換する前提で、valid JSONとして保存する。
