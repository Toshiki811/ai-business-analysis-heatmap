# 07 TOP3選定・To-Beフロー設計プロンプト

## 目的

`output/analysis_YYYYMMDD.json` の `heatmap_cells` からTOP3を選定し、各施策のTo-Be業務フローと実装設計（implementation_blueprint）をJSONに追加する。

TOP3モーダルではAs-Isフローを表示しない。現状業務（As-Is）は業務整理マトリクス側の業務分類別・業務種別別フローで確認する。

この工程ではdraw.io XML生成とHTML生成は行わない。

## 入力

- `output/analysis_YYYYMMDD.json`
- `output/matrix_YYYYMMDD.md`
- `output/asis_flows_YYYYMMDD.json`（存在する場合。To-Beフローの分岐・例外設計の土台として使う）
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
  "automation_type": "対象セルのheatmap_cells[].automation_typeと一致させる",
  "current_issue": "現状課題",
  "ai_solution": "導入の具体策（automation_typeに応じて出し分ける）",
  "expected_effect": "期待効果",
  "risks": "リスク・注意点",
  "implementation_blueprint": {
    "tools": ["会計システム（仕訳CSV取込）", "Excel/CSV入出力"],
    "data_sources": ["購買台帳", "経理規程の科目対応表"],
    "decision_rules": ["金額1万円超は会計責任者承認へ回す", "台帳と不一致の場合は人手確認キューへ"],
    "failure_behavior": "抽出信頼度が閾値未満・突合不能の場合は自動処理を停止し、対象を担当者の確認リストに積む",
    "human_checkpoints": ["登録前の差異一覧確認", "月次でのサンプリング検証"]
  },
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

- `to_be_flow` は8〜15ステップを目安にする。5ステップ以下は粗すぎとして再分解する。1ステップ = 1主体（actor）の1アクションとし、「AIが抽出・突合・登録する」のような複数アクションの圧縮は分割する。
- 対象業務種別のAs-Is詳細フロー（`output/asis_flows_YYYYMMDD.json` の該当 `business_type`）のノードと対応づけて設計し、As-Is側でモデル化した分岐・例外・差戻しは、To-Be側でも判断ノード+分岐（自動化後の扱いを含む）として引き継ぐ。省略する場合は理由を `reason` に書く。
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

## automation_type に応じた出し分けルール

- `ai_agent` の場合: `implementation_blueprint` の5項目（`tools`、`data_sources`、`decision_rules`、`failure_behavior`、`human_checkpoints`）をすべて必須とする。エージェントが「どのツールを」「どの判断基準で」「失敗時にどう振る舞うか」を現場担当者が読んで運用イメージできる粒度で書く。
- `generative_ai` の場合: `implementation_blueprint` を作成し、特に `data_sources`（読解対象の資料）と `human_checkpoints`（人がレビューするポイント）を必須とする。
- `rule_based` / `system_config` / `rpa` の場合: `ai_solution` の冒頭に「AI導入ではなく◯◯（システム設定 / ルール実装 / RPA連携）を推奨」と明記する。`to_be_flow` の actor は `System` と `Human` を中心にし、`AI` actor を使わない。`implementation_blueprint` は `tools` と `decision_rules`（設定・ルール化する条件表）を中心に書く。
- TOP3に `rule_based` / `system_config` のセルが入った場合でも、無理にAI施策へ書き換えない。「すぐ自動化できる」こと自体が施策価値である。

## To-Beフローの具体性ルール

- `to_be_flow[].description` には「何を入力に何を出力するか」を含める（例: 「請求書PDFから金額・取引先・期日を抽出し、突合結果一覧を出力」）。「AIが支援する」のような抽象表現だけのステップは禁止。
- AIステップには必ず後続に `Human Review` ステップまたは判断ノードを置き、AIの出力を無確認で確定させるフローにしない。
- `failure_behavior` に書いた例外時挙動は、`to_be_flow` 上でも判断ノード+例外分岐として表現する。

## 注意事項

- TOP3は必ずTo-Beフローを持つ。TOP3専用の `as_is_flow` は作成しない。
- TOP3セルの `heatmap_cells[].to_be_tasks` は、`top3[].to_be_flow` の主要ステップと矛盾しないように更新する。表では2〜5件に要約し、draw.ioフローでは判断ノードや差戻しを含む詳細手順を表現する。
- To-Beでは4つのactorを必要に応じて使い分ける。
- AIに任せる範囲と人が確認する範囲を曖昧にしない。
- `top3` は後続の `scripts/render_outputs.mjs` が draw.io に変換する前提で、valid JSONとして保存する。
