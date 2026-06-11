function compactText(value, maxLength = 80) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function questionKey(parts) {
  return [
    parts.category || '',
    parts.task_type || '',
    parts.task_name || '',
    parts.question || ''
  ].join('|||');
}

function findTaskForResolvedQuestion(tasks, resolved) {
  return tasks.find((task) =>
    (task['業務分類'] || '') === (resolved.category || '') &&
    (task['業務種別'] || '') === (resolved.task_type || '') &&
    (task['タスク名'] || '') === (resolved.task_name || '')
  );
}

function classifyAsIsAnswerImpact(question, answer) {
  const questionText = String(question || '');
  const text = `${questionText} ${answer || ''}`;
  if (/資料形式|出力できるか|出力可否/.test(questionText) && !/連携/.test(questionText)) return 'none';
  if (/担当|承認|決裁|レビュー|確認者|上長|責任者/.test(text)) return 'role';
  if (/順序|先に|後で|前後|戻し先|差戻|再承認/.test(text)) return 'sequence';
  if (/分岐|条件|場合|例外|不一致|エラー|修正/.test(text)) return 'branch';
  if (/システム|連携|取込|入力|登録|出力|CSV|Excel|アップロード|ダウンロード|データ/.test(text)) return 'system';
  return 'none';
}

function asIsResolvedNote(question, answer) {
  const impact = classifyAsIsAnswerImpact(question, answer);
  const prefix = impact === 'none' ? '回答確認済み（フロー変更なし）' : '回答反映';
  return {
    impact,
    note: `${prefix}: ${compactText(answer, 60)}`
  };
}

function buildAnswerExample(question) {
  const text = String(question || '');
  if (/レビュー|差戻/.test(text)) {
    return '事務長がレビューし、不備がある場合は担当者へ差戻す';
  }
  if (/承認|決裁|稟議/.test(text)) {
    return '担当者が作成し、会計責任者が承認する';
  }
  if (/担当|割当|責任者/.test(text)) {
    return '担当者が一次対応し、確認者が内容をチェックする';
  }
  if (/分岐|条件|例外|不一致|差異|乖離|エラー/.test(text)) {
    return '基準外の場合は担当者が原因確認し、上長確認後に修正する';
  }
  if (/連携|取込|入力|登録|出力|システム|データ|CSV/.test(text)) {
    return 'CSVで出力し、会計システムへ取込後に担当者が結果を確認する';
  }
  if (/電子|保管|証憑|帳票|台帳|写真|ラベル/.test(text)) {
    return '電子保管し、月次で担当者が台帳との突合を行う';
  }
  if (/期限|期日|頻度|日/.test(text)) {
    return '翌営業日までに担当者が処理し、月次で上長が確認する';
  }
  return '担当者が処理し、必要に応じて上長または会計責任者が確認する';
}

function normalizeQuestionWithExample(question) {
  const text = String(question || '').trim();
  if (!text || /回答例:/.test(text)) return text;
  const normalizedQuestion = text.startsWith('質問:') ? text : `質問: ${text}`;
  return `${normalizedQuestion} / 回答例: ${buildAnswerExample(text)}`;
}

function extractQuestionText(question) {
  return String(question || '')
    .replace(/^質問:\s*/, '')
    .split(/\s*\/\s*回答例:/)[0]
    .trim();
}

function hasFlowChangingQuestion(question) {
  const text = extractQuestionText(question);
  return /差戻|再承認|承認フロー|承認手順|承認者ID|作成者ID|分離状況|承認権限|承認有無|レビュー者|レビューの担当者|例外|分岐|判断ルール|判断基準|基準額|乖離率|対象基準|事前承認省略|提出前確認者|チェック担当|二重チェック|立会者|担当者割当|担当者と|承認者と|承認資料|稟議|修正|不一致|エラー|差異発生時|不明残高|再振込|少額支払|契約金額別|連携可否|取込可否|自動取込|仕訳連携|システム連携/.test(text);
}

function hasNonFlowQuestion(question) {
  const text = extractQuestionText(question);
  return /資料形式|件数|頻度|所要時間|AI導入余地|出力できるか|出力可否|出力できない|保管場所|保管方法|管理媒体|フォーマット|標準様式|電子保管|電子化状況|電子回収|電子請求|電子送付|受領方法|データ化|管理方法|回収確認方法|チェックリスト有無|テンプレート有無|内製しているか外部専門家|提出先|添付資料|必要添付資料|領収書原本管理|ラベル|写真|上限額|支払対象|利用範囲/.test(text);
}

function questionAnsweredByTaskText(task) {
  const question = extractQuestionText(task['確認事項']);
  const detail = [
    task['タスク名'],
    task['業務内容詳細'],
    task['現状課題']
  ].filter(Boolean).join(' ');

  const asksRole = /担当|責任者|確認者|承認者|承認|レビュー者/.test(question);
  const roleKnown = /理事長|会計責任者|出納職員|担当者|契約担当者|固定資産管理責任者|予算管理責任者|理事会|承認済み/.test(detail);
  const needsRoleDetail = /差戻|再承認|分離状況|承認手順|承認フロー|承認者ID|作成者ID|レビュー者|二重チェック|立会者|担当者割当/.test(question);
  if (asksRole && roleKnown && !needsRoleDetail) return true;

  const asksOrder = /順序|期限|期日|前後/.test(question);
  const orderKnown = /後|前|期日|月末|年度末|承認済み.*もとに|場合/.test(detail);
  return asksOrder && orderKnown;
}

function shouldKeepQuestion(task) {
  const question = String(task['確認事項'] || '').trim();
  if (!question) return false;
  if (String(task['クライアント回答'] || '').trim()) return true;
  if (/（確認不要）/.test(question)) return false;
  if (questionAnsweredByTaskText(task)) return false;
  if (hasFlowChangingQuestion(question)) return true;
  if (hasNonFlowQuestion(question)) return false;
  return true;
}

export function suppressNonFlowQuestions(analysis) {
  let suppressed = 0;
  for (const task of analysis.matrix_tasks || []) {
    if (task.as_is_suppressed_question && !task['確認事項']) suppressed += 1;
    delete task.as_is_suppressed_question;
    if (!task['確認事項']) continue;
    if (shouldKeepQuestion(task)) continue;
    task['確認事項'] = '';
    suppressed += 1;
  }
  return suppressed;
}

function ensureQuestionAnswerExamples(analysis) {
  for (const task of analysis.matrix_tasks || []) {
    if (!task['確認事項']) continue;
    task['確認事項'] = normalizeQuestionWithExample(task['確認事項']);
  }
}

function applyResolvedQuestionToTask(task, resolved) {
  const answer = String(resolved.answer || '').trim();
  const updateNote = String(resolved.as_is_update_note || '').trim();
  if (!answer && !updateNote) return;
  if (answer) {
    const { impact, note } = asIsResolvedNote(resolved.question, answer);
    task.as_is_answer_impact = impact;
    task.as_is_resolved_note = note;
    task.as_is_resolved_answer = answer;
  }
  task.as_is_resolved_question = resolved.question || '';
  if (updateNote) {
    task.as_is_update_note = updateNote;
    task['As-Isフロー更新内容'] = updateNote;
  }
}

function applyResolvedQuestionsToTasks(analysis) {
  const tasks = Array.isArray(analysis.matrix_tasks) ? analysis.matrix_tasks : [];
  const resolvedQuestions = Array.isArray(analysis.resolved_questions) ? analysis.resolved_questions : [];
  for (const resolved of resolvedQuestions) {
    const task = findTaskForResolvedQuestion(tasks, resolved);
    if (task) applyResolvedQuestionToTask(task, resolved);
  }
}

export function resolveQuestions(analysis) {
  ensureQuestionAnswerExamples(analysis);
  const resolved = [];
  const existing = Array.isArray(analysis.resolved_questions) ? analysis.resolved_questions : [];
  const seen = new Set(existing.map((item) => questionKey(item)));

  for (const task of analysis.matrix_tasks || []) {
    const answer = String(task['クライアント回答'] || '').trim();
    const updateNote = String(task.as_is_update_note || task['As-Isフロー更新内容'] || '').trim();
    if (!answer && !updateNote) continue;
    if (!answer) {
      task.as_is_update_note = updateNote;
      task['As-Isフロー更新内容'] = updateNote;
      continue;
    }
    const item = {
      category: task['業務分類'] || '',
      task_type: task['業務種別'] || '',
      task_name: task['タスク名'] || '',
      question: task['確認事項'] || '',
      answer: task['クライアント回答'] || '',
      as_is_update_note: updateNote,
      applied_to: ['matrix_tasks', 'heatmap_cells.reason', 'as_is_flow', 'to_be_flow']
    };
    if (!seen.has(questionKey(item))) {
      resolved.push(item);
      seen.add(questionKey(item));
    }
    applyResolvedQuestionToTask(task, item);
    task['確認事項'] = '';
    task['クライアント回答'] = '';
    task['区分'] = 'ヒアリング済';
  }

  const suppressedCount = suppressNonFlowQuestions(analysis);
  analysis.metadata = {
    ...(analysis.metadata || {}),
    suppressed_question_count: suppressedCount
  };

  if (resolved.length > 0) {
    analysis.resolved_questions = [...existing, ...resolved];
  } else if (!Array.isArray(analysis.resolved_questions)) {
    analysis.resolved_questions = [];
  }

  applyResolvedQuestionsToTasks(analysis);
  return resolved;
}
