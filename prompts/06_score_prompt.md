# 06 スコアリングプロンプト

## 目的

`flow_axes`、業務整理マトリクス、詳細As-Isフロー、ヒアリング後CSVをもとに、各セルの自動化手段を判定し、AI導入効果の `heatmap_cells` を生成する。

この工程ではTOP3フロー設計、draw.io生成、HTML生成は行わない。

## 入力

- `output/flow_axes_YYYYMMDD.json`
- `output/matrix_YYYYMMDD.md`
- `output/asis_flows_YYYYMMDD.json`（存在する場合。自動化手段判定の材料として使う）
- `input/normalized/` 内の全 `.md` / `.txt` ファイル
- `input/source/client_input_filled.csv` または `input/source/client_input_filled_YYYYMMDD.csv`（存在する場合）

## 出力

`output/analysis_YYYYMMDD.json`

この工程では少なくとも `metadata`、`category_flow_columns`、`heatmap_columns`、`flow_columns`、`categories`、`heatmap_cells`、`matrix_tasks` を出力する。`top3` とAs-Isフロー構造は後続工程で追加する。

`heatmap_cells` は `業務分類 × 業務種別 × ヒートマップグループ × ヒートマップステップ` の粒度で生成する。ヒートマップの縦軸は業務整理マトリクスと同じ `業務分類 / 業務種別` の2段、横軸は `heatmap_columns[].group / steps[]` の2段とする。

`output/matrix_YYYYMMDD.md` が `## 業務分類: ...` / `### 業務種別: ...` の階層形式の場合は、直近の見出し値を各タスク行の `業務分類` / `業務種別` として復元し、`matrix_tasks` には従来通り `業務分類` と `業務種別` のフィールドを必ず持たせる。

## `summary.insights` 生成ルール

`summary.insights` は分析結果の示唆として必ず3件出力する。1件あたり140〜240字程度を目安に、表示上は `Point 1` 〜 `Point 3` として読める内容にする。

`summary.insights` はHTMLの経営サマリーに直接表示される。経営層・業務責任者が最初に読む前提で、抽象的な効率化表現ではなく、どの業務分類・業務種別・横軸タスクに負荷やAI導入余地が集まるかを簡潔に書く。数値スコアの詳細はTOP3詳細に限定されるため、ここではスコアの内訳ではなく、着手判断に必要な業務上の示唆を優先する。

各Pointには、必ず以下の3観点を含める。

- 現行業務分析を経て分かったこと: 業務分類名だけでなく、どのタスク単位に負荷、ばらつき、確認作業、転記作業、統制リスクが集まっているかを書く。
- 今後AIへ提供できる余地: AIが担える処理を、根拠資料確認、差異検知、下書き生成、不備検知、入力データ整形、登録前チェックなどの具体機能で書く。
- 横展開しやすい初期タスク: `計算・作成`、`情報収集・照合`、`内容確認`、`システム入力`、`記録・報告` など、ヒートマップ横軸のタスク単位から着手候補を書く。

3件は、原則として以下のように役割を分ける。

1. `計算・作成` を中心に、決算、年末調整、契約書作成などの作成・計算負荷と、根拠資料確認、差異検知、下書き生成の横展開余地を書く。
2. `情報収集・照合` / `内容確認` を中心に、請求書、契約書、稟議書、台帳、証憑の突合負荷と、不備検知、必要項目抽出、根拠リンク提示の横展開余地を書く。
3. `システム入力` / `記録・報告` を中心に、給与、会計、固定資産、報告業務の転記・入力・提出準備と、入力データ整形、CSV化、登録前チェック、報告コメント下書きの横展開余地を書く。

表現は「AIを入れると効率化できる」のような一般論で終えず、「現行業務で何が分かったか」「AIに何を提供させるか」「どのタスクから着手すると他業務へ広げやすいか」が分かる内容にする。

## ヒアリング後CSVの優先ルール

複数のヒアリング後CSVが存在する場合は、更新日時が最新のファイルを1つ選択し、使用したファイル名を `metadata.client_input` に記録する。

| CSV列 | 反映先 |
|---|---|
| `1件あたり所要時間_分_ヒアリング後` | `time_reduction_score` の算出基準 |
| `人手の負担_ヒアリング後` | `quality_impact_score` と `time_reduction_score` の補正 |
| `月間件数` | `frequency_score` の算出基準 |
| `クライアント回答` | `matrix_tasks`、`reason`、後続フロー設計への前提 |
| `As-Isフロー更新内容_業務分類` | `analysis.as_is_category_updates[業務分類]`、確認事項回答とは別の業務分類単位の反映メモ |

空欄のヒアリング後値は仮置き値を使う。
旧CSVに `As-Isフロー更新内容` が存在する場合は、互換入力として業務分類単位の反映メモへ移行してよい。
旧CSVに `発生頻度` や `AI導入余地_ヒアリング後` が存在する場合だけ任意で参照してよい。新規CSVではこの2列を要求しない。

## 自動化手段（automation_type）の判定

スコアリングの前に、各セルの対象タスクに最も適した自動化手段を以下の判定フローで決定する。「AIを使えるか」ではなく「最も安く確実に自動化できる手段は何か」で判定する。

```text
Q1 判断条件がマニュアル・規程に明文化され、ルール化可能か（金額閾値、期日、科目対応表、チェックリスト）
 └ YES → Q1a 既存システムの設定・標準機能で実現できるか
          ├ YES → system_config（既存システム設定）
          └ NO  → rule_based（ルールベース・条件分岐の実装）
Q2 構造化データ間の転記・入力・突合が主作業か（CSV→システム入力、台帳間の転記）
 └ YES → rpa（RPA・システム間連携）
Q3 非構造文書（PDF・紙・自由記述）の読解・要約・下書き・チェックが主作業か
 └ YES → generative_ai（生成AI）
Q4 複数資料・複数システムを横断し、中間判断を挟む多段処理か
 └ YES → ai_agent（AIエージェント）
いずれにも該当しない / 判断が属人的で自動化に不適 → manual（人手維持）
```

判定材料:

- `output/asis_flows_YYYYMMDD.json` の `decision` ノードで `confidence: "explicit"` の分岐条件が付いているタスクは、判断ルールが明文化されている強いシグナルとして Q1 を YES 寄りに判定する。
- 逆に、判断基準がマニュアルに書かれておらず担当者の経験に依存するタスクは、安易に `ai_agent` とせず `generative_ai`（人のレビュー前提の下書き支援）か `manual` を検討する。
- `ai_agent` は「複数ツールの呼び出し・中間判断・例外振り分けを連続して行う必然性」が説明できる場合に限定する。単発の下書き生成・照合は `generative_ai` とする。

各セルには以下を必ず記録する。

- `automation_type`: 上記6種のいずれか
- `automation_reason`: 判定フローのどの質問でどう分類したか（例: 「金額上限と承認権限が経理規程に明文化されておりルール化可能。会計システムの承認ワークフロー設定で実現できるため system_config」）

## スコア計算式

```text
AI導入効果スコア =
  作業時間削減インパクト × 0.40
+ 作業頻度・件数       × 0.20
+ 実装容易性           × 0.15
+ 品質改善・ミス削減効果 × 0.10
+ AI適合度             × 0.15
```

各評価軸は1〜5点で評価し、最大5.0を100点に換算する。

| 評価軸 | 5 | 4 | 3 | 2 | 1 |
|---|---|---|---|---|---|
| 作業時間削減インパクト | 1件30分以上削減 | 15〜30分 | 5〜15分 | 1〜5分 | 1分未満 |
| 作業頻度・件数 | 毎日50件以上 | 毎日10〜50件 | 週数回/数件 | 月数回 | ほぼ発生しない |
| 実装容易性 | 既存APIで即実装可 | 軽微なカスタマイズ | 中程度の開発 | 大規模開発 | 技術的に困難 |
| 品質改善・ミス削減効果 | ミスが頻発・重大 | 時々ミスがある | 品質ばらつき | ほぼ安定 | 改善不要 |
| AI適合度 | — | — | — | — | — |

AI適合度（`ai_fit_score`）は `automation_type` から機械的に決める。クライアント向けの表示は「AI / RPA（ルールベース） / 人」の3軸に集約し、ai_fit_score も3軸単位（5 / 3 / 1）で揃える。内部の6分類はTo-Be生成・実装設計で使い続ける。

| 3軸表示 | automation_type | ai_fit_score | 意味 |
|---|---|---|---|
| AI | `ai_agent`, `generative_ai` | 5 | 非構造文書の読解・生成や多段判断を含み、AIでなければ自動化できない |
| RPA（ルールベース） | `rpa`, `system_config`, `rule_based` | 3 | 判断条件が明文化されており、ルール実装・連携・設定で自動化できる（AIは不要） |
| 人 | `manual` | 1 | 人の判断・責任が本質で、自動化自体が不適 |

これにより、ルール実装で足りる業務はAI導入効果スコアが自然に下がる。ヒートマップの表示は従来通り `低` / `中` / `高` のみとし、`automation_type` はセル詳細・To-Be提案で使う。なお `ai_fit_score`・総合スコア・`effect_level` はレンダリング時に `scripts/lib/schema.mjs` の `aiFitScoreForAutomationType()` で automation_type から再導出・再計算されるため、この表とコードを変更する際は両者を同期させること。

## effect_level

| effect_level | スコア目安 |
|---|---|
| `high` | 70点以上 |
| `medium` | 40〜69点 |
| `low` | 39点以下 |

原則としてスコアから `effect_level` を決定する。旧CSVの任意列 `AI導入余地_ヒアリング後` が入力されている場合だけ、`低` / `中` / `高` をそれぞれ `low` / `medium` / `high` に変換して上書きしてよい。

## `heatmap_cells` スキーマ

```json
{
  "category": "業務カテゴリー名",
  "business_type": "業務種別名",
  "heatmap_group": "heatmap_columns[].group と完全一致するグループ名",
  "flow_step": "heatmap_columns[].steps[] と完全一致する抽象ステップ名",
  "task_ids": ["対象matrix_tasksのtask_id"],
  "source_tasks": ["対象タスク名"],
  "score": 87,
  "time_reduction_score": 5,
  "frequency_score": 4,
  "implementation_ease_score": 4,
  "quality_impact_score": 3,
  "ai_fit_score": 4,
  "automation_type": "generative_ai",
  "automation_reason": "請求書PDFの読解・突合が主作業で、判定フローQ3に該当",
  "estimated_time_saved": "1件あたり5〜10分",
  "development_scale": "小",
  "ai_use_case": "AIで何をするか（ai_use_case_detailの3要素を1文に連結）",
  "ai_use_case_detail": {
    "input": "処理対象の入力（例: 請求書PDF 月20件）",
    "process": "処理内容（例: 金額・取引先・期日の抽出と購買台帳との突合）",
    "output": "出力形式（例: 差異一覧CSVと不一致理由コメント）"
  },
  "to_be_tasks": [
    {
      "actor": "Human | AI | Human Review | System",
      "to_be_task": "AI導入後のタスク名",
      "ai_role": "AIが担う処理",
      "human_review": "人が確認・判断する内容",
      "expected_effect": "期待効果",
      "prerequisite_or_risk": "前提・リスク"
    }
  ],
  "reason": "スコア根拠と前提条件",
  "source_reference": "根拠箇所の概要",
  "effect_level": "high",
  "is_top3": false
}
```

`to_be_tasks` は全 `heatmap_cells` に2〜5件作成する。AIに任せる作業、人がレビューする作業、既存システムが処理する作業を分け、表形式で読める粒度にする。TOP3以外も簡易To-Be案を必ず持たせるが、draw.ioフロー化は後続工程のTOP3に限定する。

## `ai_use_case` の記述ルール

- `ai_use_case_detail` の `input` → `process` → `output` を具体的に書き、`ai_use_case` はその3要素を1文に連結したものにする。
- 「確認観点の整理、記録作成、根拠資料との照合をAIで支援」のような、どのセルにも当てはまるテンプレート文言は禁止する。対象タスク固有の資料名・システム名・件数を必ず含める。
- `automation_type` が `rule_based` / `system_config` / `rpa` のセルは、`ai_use_case` に「AIではなく◯◯（設定・ルール実装・連携）での自動化を推奨」と明記し、AI導入を装わない。
- `to_be_tasks` も `automation_type` と整合させる。`rule_based` / `system_config` のセルに「AIが下書き生成」のようなタスクを書かない。

## `matrix_tasks` のAs-Is紐づけフィールド

後続の `render_outputs.mjs` が `matrix_tasks` からAs-Isフローを自動生成し、以下のフィールドを追加・更新する。

```json
{
  "task_id": "安定したタスクID",
  "as_is_category_flow_key": "業務分類全体図のキー",
  "as_is_business_type_flow_key": "業務種別部分図のキー",
  "as_is_node_id": "draw.io上のノードID",
  "as_is_position_label": "業務分類 > 業務種別 > タスク順. タスク名 / マトリクス横軸"
}
```

`matrix_tasks` 生成時点で `task_id` を付与してもよい。未付与の場合はHTML生成工程で決定的に補完する。

## 注意事項

- `matrix_tasks` には `マトリクス横軸`、`ヒートマップグループ`、`ヒートマップステップ` を必ず含める。
- `heatmap_cells` は必ず `matrix_tasks` に存在する `業務分類`、`業務種別`、`ヒートマップグループ`、`ヒートマップステップ` の組み合わせだけで作る。
- `heatmap_cells[].category` は `matrix_tasks[].業務分類` と完全一致させる。
- `heatmap_cells[].business_type` は `matrix_tasks[].業務種別` と完全一致させる。
- `heatmap_cells[].heatmap_group` は `matrix_tasks[].ヒートマップグループ` と完全一致させる。
- `heatmap_cells[].flow_step` は `matrix_tasks[].ヒートマップステップ` と完全一致させる。
- `matrix_tasks[].マトリクス横軸` はマトリクスまたはCSVからコピーし、必ず該当業務分類の `category_flow_columns` と完全一致させる。
- `matrix_tasks[].ヒートマップグループ` と `matrix_tasks[].ヒートマップステップ` は必ず `heatmap_columns` と完全一致させる。
- 旧形式の `共通ステップ` はフォールバック入力として扱い、`マトリクス横軸` と `ヒートマップステップ` に読み替えてよい。
- `task_ids` または `source_tasks` に、セルの根拠となる元タスクを必ず記録する。
- `to_be_tasks` は対象セルの `ai_use_case`、`reason`、元タスクの現状課題と矛盾しない内容にする。
- 該当しないセルは `heatmap_cells` に含めない。
- `none`、`n/a`、空スコアのセルは作らない。
- スコア根拠と前提条件を `reason` に必ず書く。
- 回答済み設問は `matrix_tasks` の `確認事項` を空欄にし、`区分` を `ヒアリング済` にする。
- 入力文書から担当者、承認者、使用システム、処理順序が十分に読み取れる設問は `matrix_tasks` の `確認事項` を空欄にする。
- 資料形式、件数、頻度、所要時間、単なる出力可否、保管場所、管理媒体、フォーマットなど、フローのノード・レーン・順序・分岐を変えない設問は `matrix_tasks` に残さない。
