# 06 TOP3選定・As-Is/To-Beフロー設計プロンプト

## 目的

`output/analysis_YYYYMMDD.json` の `heatmap_cells` からTOP3を選定し、各施策のTo-Be業務フローをJSONに追加する。

TOP3モーダルではAs-Isフローを表示しない。現状業務（As-Is）は業務整理マトリクス側の業務分類別・業務種別別フローで確認する。

この工程ではdraw.io XML生成とHTML生成は行わない。

## 入力

- `output/analysis_YYYYMMDD.json`
- `output/matrix_YYYYMMDD.md`
- `input/source/client_input_filled.csv` または `input/source/client_input_filled_YYYYMMDD.csv`（存在する場合）

## 出力

更新後の `output/analysis_YYYYMMDD.json`

追加・更新する主な項目:

- `heatmap_cells[].is_top3`
- `heatmap_cells[].to_be_tasks`（TOP3セルは `top3[].to_be_flow` と整合させる）
- `top3`
- `resolved_questions`（必要に応じて）

## TOP3選定ルール

- `heatmap_cells` を `score` の降順で並べ、上位3件を選ぶ。
- 同点の場合は、`time_reduction_score`、`frequency_score`、`implementation_ease_score` の順に比較する。
- TOP3に選んだセルは `is_top3: true` にし、それ以外は `false` にする。
- `heatmap_cells` は `category` / `business_type` / `heatmap_group` / `flow_step` の組み合わせを1セルとみなす。
- `top3[].target_category`、`top3[].target_business_type`、`top3[].target_heatmap_group`、`top3[].target_flow_step` は、対象セルの `category` / `business_type` / `heatmap_group` / `flow_step` と完全一致させる。

## クライアント回答の反映ルール

`クライアント回答` がある行は、単なる根拠追記で終わらせずフローに反映する。

- 担当者、承認者、処理順序、分岐条件、例外処理、差戻し、再承認、システム連携が分かる場合は、`to_be_flow` に反映する。
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
  "target_heatmap_group": "対象ヒートマップグループ",
  "target_flow_step": "対象ヒートマップステップ",
  "current_issue": "現状課題",
  "ai_solution": "AI導入の具体策",
  "expected_effect": "期待効果",
  "risks": "リスク・注意点",
  "to_be_flow": [
    {
      "id": "step-id",
      "step": "ステップ名",
      "node_type": "process | decision",
      "actor": "Human | AI | Human Review | System",
      "description": "AI導入後の作業内容",
      "condition": "判断条件（node_typeがdecisionの場合）",
      "branches": [
        { "label": "Yes", "target": "遷移先id" },
        { "label": "No", "target": "遷移先id" }
      ],
      "next": "通常遷移先id"
    }
  ]
}
```

## フロー表現ルール

- 通常作業は `node_type: "process"` とする。省略時もprocessとして扱われる。
- 判断、承認可否、不備有無、差戻し要否、AI判定結果、例外有無は `node_type: "decision"` とし、`condition` を必ず書く。
- 判断ノードは `branches` で分岐先を明示する。分岐ラベルは `承認` / `差戻し`、`不備なし` / `不備あり` など業務上の意味が分かる表現にする。
- 差戻し、再提出、再承認、例外処理は、対象ノードへの戻り矢印または例外処理ノードへの分岐として表現する。
- 分岐がない通常遷移は `next` を省略してよい。配列順に次ステップへ接続される。
- AIに任せる範囲、人がレビューする範囲、既存システムが処理する範囲を曖昧にしない。

## To-Be actor

- `Human`: 人間が実施する作業
- `AI`: AIが自動処理する作業
- `Human Review`: AIの処理結果を人間が確認・承認する作業
- `System`: 既存システムが自動処理する作業

## 注意事項

- TOP3は必ずTo-Beフローを持つ。TOP3専用の `as_is_flow` は作成しない。
- TOP3セルの `heatmap_cells[].to_be_tasks` は、`top3[].to_be_flow` の主要ステップと矛盾しないように更新する。表では2〜5件に要約し、draw.ioフローでは判断ノードや差戻しを含む詳細手順を表現する。
- To-Beでは4つのactorを必要に応じて使い分ける。
- AIに任せる範囲と人が確認する範囲を曖昧にしない。
- `top3` は後続の `scripts/render_outputs.mjs` が draw.io に変換する前提で、valid JSONとして保存する。
