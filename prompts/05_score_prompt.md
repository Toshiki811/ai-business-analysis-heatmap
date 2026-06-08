# 05 スコアリングプロンプト

## 目的

`flow_axes`、業務整理マトリクス、ヒアリング後CSVをもとに、AI導入効果の `heatmap_cells` を生成する。

この工程ではTOP3フロー設計、draw.io生成、HTML生成は行わない。

## 入力

- `output/flow_axes_YYYYMMDD.json`
- `output/matrix_YYYYMMDD.md`
- `input/normalized/` 内の全 `.md` / `.txt` ファイル
- `input/source/client_input_filled.csv` または `input/source/client_input_filled_YYYYMMDD.csv`（存在する場合）

## 出力

`output/analysis_YYYYMMDD.json`

この工程では少なくとも `metadata`、`flow_columns`、`categories`、`heatmap_cells`、`matrix_tasks` を出力する。`top3` とAs-Isフロー構造は後続工程で追加する。

`heatmap_cells` は `業務分類 × 業務種別 × 共通ステップ` の粒度で生成する。ヒートマップの縦軸は業務整理マトリクスと同じ `業務分類 / 業務種別` の2段、横軸は `matrix_tasks[].共通ステップ` と同じ1段の共通ステップとする。

## ヒアリング後CSVの優先ルール

複数のヒアリング後CSVが存在する場合は、更新日時が最新のファイルを1つ選択し、使用したファイル名を `metadata.client_input` に記録する。

| CSV列 | 反映先 |
|---|---|
| `1件あたり所要時間_分_ヒアリング後` | `time_reduction_score` の算出基準 |
| `人手の負担_ヒアリング後` | `quality_impact_score` と `time_reduction_score` の補正 |
| `月間件数` / `発生頻度` | `frequency_score` の算出基準 |
| `AI導入余地_ヒアリング後` | `effect_level` の上書き判断 |
| `クライアント回答` | `matrix_tasks`、`reason`、後続フロー設計への前提 |

空欄のヒアリング後値は仮置き値を使う。

## スコア計算式

```text
AI導入効果スコア =
  作業時間削減インパクト × 0.45
+ 作業頻度・件数       × 0.25
+ 実装容易性           × 0.20
+ 品質改善・ミス削減効果 × 0.10
```

各評価軸は1〜5点で評価し、最大5.0を100点に換算する。

| 評価軸 | 5 | 4 | 3 | 2 | 1 |
|---|---|---|---|---|---|
| 作業時間削減インパクト | 1件30分以上削減 | 15〜30分 | 5〜15分 | 1〜5分 | 1分未満 |
| 作業頻度・件数 | 毎日50件以上 | 毎日10〜50件 | 週数回/数件 | 月数回 | ほぼ発生しない |
| 実装容易性 | 既存APIで即実装可 | 軽微なカスタマイズ | 中程度の開発 | 大規模開発 | 技術的に困難 |
| 品質改善・ミス削減効果 | ミスが頻発・重大 | 時々ミスがある | 品質ばらつき | ほぼ安定 | 改善不要 |

## effect_level

| effect_level | スコア目安 |
|---|---|
| `high` | 70点以上 |
| `medium` | 40〜69点 |
| `low` | 39点以下 |

ヒアリング後CSVの `AI導入余地_ヒアリング後` が入力されている場合は、`低` / `中` / `高` をそれぞれ `low` / `medium` / `high` に変換して上書きする。

## `heatmap_cells` スキーマ

```json
{
  "category": "業務カテゴリー名",
  "business_type": "業務種別名",
  "flow_step": "flow_columns[].steps[] と完全一致するステップ名",
  "score": 87,
  "time_reduction_score": 5,
  "frequency_score": 4,
  "implementation_ease_score": 4,
  "quality_impact_score": 3,
  "estimated_time_saved": "1件あたり5〜10分",
  "development_scale": "小",
  "ai_use_case": "AIで何をするか",
  "reason": "スコア根拠と前提条件",
  "source_reference": "根拠箇所の概要",
  "effect_level": "high",
  "is_top3": false
}
```

## `matrix_tasks` のAs-Is紐づけフィールド

後続の `render_outputs.mjs` が `matrix_tasks` からAs-Isフローを自動生成し、以下のフィールドを追加・更新する。

```json
{
  "task_id": "安定したタスクID",
  "as_is_category_flow_key": "業務分類全体図のキー",
  "as_is_business_type_flow_key": "業務種別部分図のキー",
  "as_is_node_id": "draw.io上のノードID",
  "as_is_position_label": "業務分類 > 業務種別 > タスク順. タスク名 / 共通ステップ"
}
```

`matrix_tasks` 生成時点で `task_id` を付与してもよい。未付与の場合はHTML生成工程で決定的に補完する。

## 注意事項

- `heatmap_cells` は必ず `matrix_tasks` に存在する `業務分類`、`業務種別`、`共通ステップ` の組み合わせだけで作る。
- `heatmap_cells[].category` は `matrix_tasks[].業務分類` と完全一致させる。
- `heatmap_cells[].business_type` は `matrix_tasks[].業務種別` と完全一致させる。
- `flow_step` は必ず `flow_columns[].steps[]` および `matrix_tasks[].共通ステップ` と完全一致させる。
- `matrix_tasks[].共通ステップ` はマトリクスまたはCSVからコピーし、必ず `flow_columns[].steps[]` と完全一致させる。
- `heatmap_cells[].flow_step` と `matrix_tasks[].共通ステップ` が `flow_columns[].steps[]` に存在しない場合は、新しいステップ名を作らず、最も近い既存の共通ステップへ正規化する。
- 該当しないセルは `heatmap_cells` に含めない。
- `none`、`n/a`、空スコアのセルは作らない。
- スコア根拠と前提条件を `reason` に必ず書く。
- 回答済み設問は `matrix_tasks` の `確認事項` を空欄にし、`区分` を `ヒアリング済` にする。
- 入力文書から担当者、承認者、使用システム、処理順序が十分に読み取れる設問は `matrix_tasks` の `確認事項` を空欄にする。
- 資料形式、件数、頻度、所要時間、単なる出力可否、保管場所、管理媒体、フォーマットなど、フローのノード・レーン・順序・分岐を変えない設問は `matrix_tasks` に残さない。
