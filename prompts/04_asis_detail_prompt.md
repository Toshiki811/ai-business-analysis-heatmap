# 04 詳細As-Isフロー抽出プロンプト

## 目的

`input/normalized/` のマニュアル原文と `output/matrix_YYYYMMDD.md` をもとに、業務種別ごとの詳細As-Isフロー（分岐・差戻し・例外処理・実担当者・入出力帳票を含む）を抽出する。

この工程の出力は `scripts/render_outputs.mjs` が業務種別部分のAs-Is draw.io（動的スイムレーン、判断ノード、書類シンボル、凡例付き）へ自動変換する。draw.io XMLを直接書く必要はない。

この工程ではスコアリング、TOP3選定、CSV生成、HTML生成は行わない。

## 入力

- `input/normalized/` 内の全 `.md` / `.txt` ファイル（分岐・例外・担当者の根拠の正本）
- `output/matrix_YYYYMMDD.md`（タスク紐づけの正本）
- `output/flow_axes_YYYYMMDD.json`
- `input/source/client_input_filled.csv` または `input/source/client_input_filled_YYYYMMDD.csv`（存在する場合。回答済み分岐の反映に使う）

## 出力

`output/asis_flows_YYYYMMDD.json`

```json
{
  "metadata": {
    "created_at": "YYYY-MM-DD",
    "source_documents": ["ファイル名"],
    "schema": "asis_flow_detail_v1"
  },
  "flows": [
    {
      "category": "業務分類名（matrix_tasksと完全一致）",
      "business_type": "業務種別名（matrix_tasksと完全一致）",
      "actors": ["事務職員", "会計責任者", "出納職員", "会計システム"],
      "nodes": [
        {
          "id": "n01",
          "node_type": "start | process | decision | exception | end",
          "label": "実態粒度のノード名（1主体の1アクション）",
          "actor": "出納職員",
          "description": "作業内容。入力資料・操作対象システムを含めて書く",
          "inputs": ["支払依頼書", "請求書原本"],
          "outputs": ["支払伝票"],
          "source_task": {
            "業務分類": "支払・契約事務",
            "業務種別": "支払処理",
            "タスク順": 2,
            "タスク名": "請求書確認"
          },
          "source_quote": "マニュアル原文の根拠引用（40字以内）",
          "confidence": "explicit | inferred",
          "condition": "判断条件（node_typeがdecisionの場合は必須）",
          "branches": [
            { "label": "一致", "target": "n05" },
            { "label": "不一致", "target": "n04", "edge_type": "exception" },
            { "label": "差戻し", "target": "n02", "edge_type": "return" }
          ],
          "next": "通常遷移先id（省略時は配列順の次ノード）",
          "hearing_item": "confidenceがinferredの判断ノードでは必須: 質問文",
          "hearing_answer_example": "回答例"
        }
      ],
      "hearing_items": [
        {
          "node_id": "n07",
          "question": "承認が却下された場合の差戻し先と再承認手順を教えてください",
          "answer_example": "起案者へ差戻し、修正後に会計責任者が再承認する",
          "reason": "マニュアルに承認却下時の扱いの記載がない"
        }
      ],
      "unmodeled_notes": ["フロー化しなかった例外とその理由"]
    }
  ]
}
```

## 粒度ルール

- 1ノード = 1主体の1アクション（起票する、照合する、承認する、入力する）。
- `受付・起案` `内容確認` のような抽象工程名は禁止。マニュアルの手順記述の単位に合わせ、`請求書と納品書の照合` `支払伝票の会計システム入力` のように対象と動作が分かる名称にする。
- 業務種別あたり8〜20ノードを目安にする。マニュアルの手順記述が細かい場合はさらに増やしてよい。粗すぎる（4ノード以下になる）方を問題とし、その場合はマニュアルの手順記載を再確認する。
- 各業務種別の先頭に `start`、末尾に `end` ノードを置く。

## actor・スイムレーンのルール

- `actor` にはマニュアル原文の役職名・部門名・システム名をそのまま使う（例: `理事長`、`会計責任者`、`出納職員`、`事務職員`、`会計システム`、`取引先`）。
- `担当者・業務部門` のような固定テンプレートレーンに寄せない。登場する実主体をすべて `actors[]` に登場順で列挙する。スイムレーンは `actors[]` から動的に生成される。
- 同一人物を指す表記ゆれ（`経理担当` と `経理担当者` 等）は1つに統一する。

## 分岐・差戻し・例外のルール

- マニュアルの「〜の場合」「不一致のとき」「承認されないとき」「期限を過ぎたとき」などの条件記述は、必ず `node_type: "decision"` + `condition` + `branches` で表現する。
- `branches[].target` は同一フロー内の任意のノードidを指せる。
  - 前方のノードへ戻る差戻し・再提出: `edge_type: "return"`（赤点線の戻り矢印として描画される）
  - 別系統の処理へ合流・スキップする前方遷移: `edge_type` 省略または `"normal"`
  - 例外処理ノードへの遷移: `edge_type: "exception"`（オレンジ点線として描画される）
- 例外対応の作業（取引先への照会、修正依頼、通常手続への切替など）は `node_type: "exception"` のノードにする。
- 承認ノードの直後に機械的に「承認可否」分岐を置かない。差戻しの分岐を置くのは、(a) マニュアルに差戻し・却下時の記述がある場合（explicit）、または (b) 推定分岐の3類型に該当する場合（inferred、後述）のみ。

## 入出力帳票のルール

- ノードが扱う帳票・資料・データを `inputs[]`（参照・受領するもの）と `outputs[]`（作成・更新するもの）に記録する。
- 書類名はマニュアルに登場する名称をそのまま使う（例: `支払稟議書`、`小口現金出納帳`、`振込控`）。マニュアルにない書類名を発明しない。
- フロー図では書類シンボルとしてノードの近傍に描画される。すべてのノードに書く必要はなく、フロー理解に役立つ主要な帳票だけでよい。

## ハルシネーション抑止ルール（最重要）

- `confidence: "explicit"` のノード・分岐には `source_quote`（マニュアル原文の引用、40字以内）を必ず付ける。引用できない分岐は explicit にしない。
- 実務上ほぼ確実に存在するがマニュアルに記載がない分岐は、`confidence: "inferred"` として点線描画されるノードにし、判断ノードの場合は `hearing_item`（確認質問）を必ず付ける。
- 推定で作ってよい inferred 分岐は次の3類型に限定する:
  1. 承認 / 差戻し
  2. 照合一致 / 不一致
  3. 期限内 / 期限超過
- 上記以外の推測はノード化せず、`unmodeled_notes` に「フロー化しなかった理由」とともに残す。
- `hearing_items[]` には inferred 分岐に対応する確認質問をまとめ、`node_id` で対象ノードを指す。これらは後続工程で業務整理マトリクスの確認事項・クライアント入力CSVへ自動転記される。

## タスク紐づけルール

- `process` / `exception` ノードは `source_task`（業務分類・業務種別・タスク順・タスク名の4項目、`output/matrix_YYYYMMDD.md` と完全一致）で業務整理マトリクスのタスクと紐づける。
- 1タスクを複数ノードに分割するのは推奨（粒度を細かくするため）。逆に複数タスクを1ノードへ統合するのは禁止（ヒートマップ集計が壊れるため）。
- `decision` ノードや `start` / `end` には `source_task` を付けなくてよい。確認質問は直前の作業ノードのタスクへ自動で紐づく。
- `category` / `business_type` はマトリクスの `業務分類` / `業務種別` と完全一致させる。存在しない組み合わせを作らない。

## 再実行時（ヒアリング後）のルール

- クライアント回答で分岐・差戻し・例外が確定した場合は、該当ノードの `confidence` を `explicit` に昇格し、`source_quote` の代わりに `client_answer` フィールドへ回答内容を記録、`hearing_item` を除去する。
- `（確認不要）` と回答された推定分岐は削除し、`unmodeled_notes` に「クライアント確認の結果、分岐なし」と残す。
- 回答済みの質問は `hearing_items[]` に再掲しない。

## 検証

出力後、以下で契約を確認できる（`asis_flows_YYYYMMDD.json` は次回の `render_outputs.mjs` 実行時に `analysis` へマージされ検証される）。

```bash
node scripts/render_outputs.mjs --date YYYYMMDD
node scripts/verify_outputs.mjs --date YYYYMMDD
```

- ノードidの一意性、`branches[].target` / `next` の解決可能性、decisionノードの `condition` + 2分岐以上、inferred decisionの `hearing_item` 必須が機械検証される。
- `category` / `business_type` が `matrix_tasks` に存在しない場合はエラーになる。

## 注意事項

- 業務種別ごとに1フローを作る。対象は原則すべての業務種別とするが、手順記述がマニュアルにない業務種別はスキップしてよい（スキップした業務種別は従来の直列タスクフローで描画される）。
- draw.io XMLはこの工程では作らない。描画は `render_outputs.mjs` が行う（動的スイムレーン、判断ひし形、書類シンボル、推定ノードの点線、差戻しの赤点線、凡例ボックスを自動生成する）。
- 後続の `06_score_prompt.md` は、本工程の decision ノード（explicit な分岐条件）を「ルール化可能シグナル」として自動化手段の判定に使う。
