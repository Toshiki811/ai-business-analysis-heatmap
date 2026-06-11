# 07 業務分類全体・業務種別部分 As-Is draw.io 生成プロンプト

## 目的

`analysis_YYYYMMDD.json` の `matrix_tasks` とヒアリング後CSVをもとに、業務分類全体と業務種別部分の現状業務（As-Is）draw.io フロー図を生成する。

この工程ではスコアリング、TOP3 To-Be設計、HTML生成は行わない。

> **注意**: `node scripts/render_outputs.mjs` は `matrix_tasks` から As-Is draw.io を自動生成し、
> `output/flows/asis_<業務分類>_YYYYMMDD.drawio` と `asis_<業務分類>__<業務種別>_YYYYMMDD.drawio` を上書き出力する。
> draw.io を手動で直接編集しても、次回レンダリング時に上書きされる。
> 図の内容を変えたい場合は `matrix_tasks` または `as_is_category_updates` を修正してから再レンダリングすること。

## 入力

- `output/analysis_YYYYMMDD.json`
- `input/source/client_input_filled.csv` または `input/source/client_input_filled_YYYYMMDD.csv`（存在する場合）
- `templates/業務フロー図_テンプレート.drawio`

## 出力

業務分類全体図:

`output/flows/asis_<業務分類>_YYYYMMDD.drawio`

業務種別部分図:

`output/flows/asis_<業務分類>__<業務種別>_YYYYMMDD.drawio`

`analysis_YYYYMMDD.json` には以下を追加・更新する。

- `category_flows[]`
- `business_type_flows[]`
- `category_flow_index`
- `matrix_tasks[].task_id`
- `matrix_tasks[].as_is_category_flow_key`
- `matrix_tasks[].as_is_business_type_flow_key`
- `matrix_tasks[].as_is_node_id`
- `matrix_tasks[].as_is_position_label`

## スイムレーン

As-IsではAI支援レーンは使わない。

| スイムレーン | fillColor | strokeColor |
|---|---|---|
| 担当者・業務部門 | `#dae8fc` | `#6c8ebf` |
| 上長・管理者・承認者 | `#e1d5e7` | `#9673a6` |
| システム | `#f5f5f5` | `#666666` |

## 生成手順

1. マトリクスの `業務分類` の一意値を取得する。
2. 業務分類ごとに、分類内の全業務種別を `業務種別` と `タスク順` に沿って上から下へ配置した全体図を作る。
3. 同じ業務分類内の各 `業務種別` について、該当タスクだけを抽出した部分図を作る。
4. 担当者・承認者・システムの記載から適切なスイムレーンを選ぶ。
5. 現状課題がある場合は黄色の課題ノートを置く。
6. As-Isフローのレーン、順序、分岐、例外処理、システム連携を変える不明情報が残る場合だけ `【要確認】` ラベルを置く。
7. ヒアリング回答済みの不明点には `【要確認】` を残さない。
8. 入力文書から担当者、承認者、使用システム、処理順序が十分に読み取れるノードや、資料形式・件数・頻度・所要時間・単なる出力可否・保管場所・管理媒体・フォーマットだけが不明なノードには `【要確認】` を置かない。
9. 入力文書やクライアント回答から「該当/非該当」「不備あり/なし」「承認/差戻し」「再提出/再承認」「例外時」などの条件が読み取れる場合は、通常プロセスではなく判断ノード（ひし形）と分岐矢印で表現する。

## プロセスボックス

ボックス内には以下を含める。

```text
タスク名
【XX分】
負担: 高/中/低
```

負担が高い場合は赤枠にする。

## 判断ノード・分岐

分岐がある場合、フロー配列の該当ステップに以下の任意項目を持たせる。

```json
{
  "id": "step-id",
  "node_type": "decision",
  "condition": "判断条件",
  "branches": [
    { "label": "承認", "target": "next-step-id" },
    { "label": "差戻し", "target": "return-step-id" }
  ],
  "next": "通常遷移先id"
}
```

- `node_type: "decision"` はdraw.ioでひし形として描画する。
- `branches[].label` は矢印ラベルとして表示する。
- `branches[].target` は同じフロー内の `id` または `node_id` を指定する。
- 通常の直列遷移だけでよい場合は `node_type`、`branches`、`next` を省略してよい。

## ヒアリング回答の反映

- 担当者・承認者が判明した場合は該当スイムレーンへ配置する。
- 処理順序が判明した場合はタスク順と矢印を更新する。
- 分岐条件、例外処理、差戻し、再承認が判明した場合は判断ノードと分岐矢印を追加する。
- システム連携が判明した場合はシステムレーンと破線矢印を追加する。
- CSVの `As-Isフロー更新内容_業務分類` が入力されている場合は、確認事項への回答とは別の業務分類単位の具体指示として優先し、図面上部の `業務分類更新メモ` に残す。旧CSVの `As-Isフロー更新内容` は互換入力として同じメモへ移行する。
- `（確認不要）` の場合は、その確認事項に由来する未確定ノードを追加しない。
- フローに影響しない回答も、対象プロセスの説明に「回答確認済み（フロー変更なし）」として反映する。

## レイアウト原則

- タスク順1番は Y=140 から開始する。
- プロセスボックスは高さ70px、次のボックスまで40px空ける。
- スイムレーン幅は300pxを目安にする。
- 業務分類全体図では、業務種別の開始位置に区切りテキストを挿入する。
- 業務種別部分図でも、先頭に業務種別名の区切りテキストを挿入する。
- `mxCell` の `id` は `process-001` のように連番にする。
- `matrix_tasks[].as_is_node_id` は業務分類全体図の該当 `process-XXX` と一致させる。

## 注意事項

- draw.ioで開けるvalid XMLにする。
- 日付付きファイルを必ず生成し、古い日付のファイルだけをHTMLに埋め込まない。
- 後続の `08_render_prompt.md` は `metadata.created_at` と同じ日付の業務分類全体図・業務種別部分図を埋め込む。
