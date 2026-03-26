(() => {
  const SUPABASE_URL = 'https://hivbkvwcjosnhzhuptfg.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpdmJrdndjam9zbmh6aHVwdGZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTA5ODIsImV4cCI6MjA5MDA4Njk4Mn0.6cAS4ZakPQqAcBk8DvfqFIaBT3cUCJNftgaHQjhGwoc';
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  /* =========================
     設定
     ========================= */
  const STATUSES = ["未着手", "進行中", "確認待ち", "保留中", "完了"];
  const PRIORITIES = ["高", "中", "低"];

  // フィルタ用（B版＝完了デフォルト非表示）
  const FILTER_STATUS_ALL = "すべて";
  const FILTER_STATUS_NOT_DONE = "完了以外";

  const STATUS_ORDER = new Map(STATUSES.map((s, i) => [s, i]));
  const PRIORITY_ORDER = new Map([["高", 0], ["中", 1], ["低", 2]]);

  // トラッくん画像パス（ステータスごとに切り替え）
  const TORAKUN_HEAD_MAP = {
    "未着手": "./assets/torakun_head_todo.png",   // 例：ふつうの顔
    "進行中": "./assets/torakun_head_doing.png",  // 例：やる気（汗）の顔
    "確認待ち": "./assets/torakun_head_wait.png",   // 例：待機中の顔
    "保留中": "./assets/torakun_head_hold.png",   // 例：困り顔・泣き顔
    "完了": "./assets/torakun_head_done.png"    // 例：満面の笑み
  };
  // 一致しない場合や、画像がまだ無い時用のデフォルト画像
  const DEFAULT_TORAKUN_HEAD = "./assets/torakun_head.png";

  /* =========================
     DOM
     ========================= */
  const el = (id) => document.getElementById(id);

  const fileSnapshot = el("fileSnapshot");
  const fileEvents = el("fileEvents");
  const btnLoad = el("btnLoad");
  const btnClear = el("btnClear");
  const loadStatus = el("loadStatus");

  const filterAssignee = el("filterAssignee");
  const filterStatus = el("filterStatus");
  const filterPriority = el("filterPriority");
  const filterDue = el("filterDue");
  const filterQuery = el("filterQuery");

  const tasksTbody = el("tasksTbody");
  const tasksTable = el("tasksTable");

  const stats = el("stats");
  const pillCounts = el("pillCounts");

  const btnNewTask = el("btnNewTask");
  const btnExportSnapshot = el("btnExportSnapshot");

  const taskDialog = el("taskDialog");
  const helpDialog = el("helpDialog");
  const btnHelp = el("btnHelp");

  // 空状態
  const emptyState = el("emptyState");
  const torakunTalkText = el("torakunTalkText");

  // dialog inputs
  const dlgTitle = el("dlgTitle");
  const dlgSubtitle = el("dlgSubtitle");
  const dlgId = el("dlgId");
  const dlgAssignee = el("dlgAssignee");
  const dlgTitleInput = el("dlgTitleInput");
  const dlgStatus = el("dlgStatus");
  const dlgPriority = el("dlgPriority");
  const dlgDue = el("dlgDue");
  const dlgActor = el("dlgActor");
  const dlgComment = el("dlgComment");
  const dlgHoldReason = el("dlgHoldReason");
  const dlgNotice = el("dlgNotice");

  const btnCopyEvent = el("btnCopyEvent");
  const btnSaveEvent = el("btnSaveEvent");

  /* =========================
     状態
     ========================= */
  let baseTasks = [];   // snapshot
  let events = [];      // event files (unique)
  let mergedTasks = []; // merged result

  let sortKey = "updatedAt";
  let sortDir = "desc"; // asc / desc

  // 編集対象
  // { mode: 'edit'|'new', taskBefore, newId }
  let currentEdit = null;

  /* =========================
     初期化
     ========================= */
  function init() {
    // Help
    if (btnHelp && helpDialog) {
      btnHelp.addEventListener("click", () => helpDialog.showModal());
    }

    // フィルタ select 初期化
    setSelectOptions(filterAssignee, ["すべて"]); // load後に埋める
    setSelectOptions(filterPriority, ["すべて", ...PRIORITIES]);
    setSelectOptions(filterDue, ["すべて", "期限切れ", "期限3日以内", "期限7日以内"]);
    setSelectOptions(filterStatus, [FILTER_STATUS_ALL, FILTER_STATUS_NOT_DONE, ...STATUSES]);

    // B版：完了はデフォルト非表示
    if (filterStatus) filterStatus.value = FILTER_STATUS_NOT_DONE;

    // ダイアログ select 初期化
    setSelectOptions(dlgStatus, STATUSES);

    // ボタン
    if (btnLoad) btnLoad.addEventListener("click", fetchTasks);
    if (btnClear) btnClear.addEventListener("click", resetAll);
    if (btnNewTask) btnNewTask.addEventListener("click", openDialogForNew);
    if (btnExportSnapshot) btnExportSnapshot.addEventListener("click", exportSnapshot);

    // フィルタ変更
    [filterAssignee, filterStatus, filterPriority, filterDue]
      .filter(Boolean)
      .forEach(s => s.addEventListener("change", renderAll));
    if (filterQuery) filterQuery.addEventListener("input", debounce(renderAll, 160));

    // ソート
    if (tasksTable) {
      tasksTable.querySelectorAll("th[data-sort]").forEach(th => {
        th.addEventListener("click", () => {
          const key = th.getAttribute("data-sort");
          if (!key) return;
          if (sortKey === key) {
            sortDir = (sortDir === "asc") ? "desc" : "asc";
          } else {
            sortKey = key;
            sortDir = "asc";
          }
          renderAll();
        });
      });
    }

    // ダイアログ：イベント生成（DL）
    if (btnSaveEvent) {
      btnSaveEvent.addEventListener("click", (ev) => {
        ev.preventDefault();
        onGenerateEventDownload();
      });
    }

    // ダイアログ：イベントコピー
    if (btnCopyEvent) {
      btnCopyEvent.addEventListener("click", onCopyEvent);
    }
        // 読み込みボタンを「手動更新」ボタンとして使う、または初期ロード
    if (btnLoad) btnLoad.addEventListener("click", fetchTasks);
    
    // 保存ボタンの動作を差し替え
    if (btnSaveEvent) {
      btnSaveEvent.replaceWith(btnSaveEvent.cloneNode(true)); // 既存のイベントをクリア
      document.getElementById("btnSaveEvent").addEventListener("click", (e) => {
        e.preventDefault();
        onSaveTask();
      });
    }

    // 起動時に自動でデータ取得
    fetchTasks();
  }

  /* =========================
     読み込み
     ========================= */
  async function fetchTasks() {
    if (loadStatus) loadStatus.textContent = "同期中...";
    
    // tasksテーブルから全件取得
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error(error);
      if (loadStatus) loadStatus.textContent = "同期失敗";
      return;
    }

    // アプリ内の変数 mergedTasks にデータを格納
    mergedTasks = data.map(t => ({
      id: t.id,
      title: t.title,
      assignee: t.assignee,
      status: t.status,
      due: t.due,
      priority: t.priority,
      holdReason: t.hold_reason,
      updatedAt: t.updated_at,
      updatedBy: t.updated_by
    }));

    renderAll();
    if (loadStatus) loadStatus.textContent = `同期完了 (${mergedTasks.length}件)`;
  }

  async function readJsonFile(file) {
    const text = await file.text();
    return JSON.parse(text);
  }

  function uniqueEvents(evts) {
    const map = new Map();
    for (const e of evts) {
      const id = e?.eventId;
      if (!id) continue;
      if (!map.has(id)) map.set(id, e);
    }
    // 時刻順に並べる
    return Array.from(map.values()).sort((a, b) => {
      const ta = Date.parse(a.at || "") || 0;
      const tb = Date.parse(b.at || "") || 0;
      return ta - tb;
    });
  }

  /* =========================
     merge（snapshot + events）
     ========================= */
  function merge(snapshotTasks, evts) {
    const map = new Map();
    for (const t of snapshotTasks) {
      if (!t?.id) continue;
      map.set(String(t.id), normalizeTask(t));
    }
    for (const e of evts) {
      applyEvent(map, e);
    }
    return Array.from(map.values());
  }

  function normalizeTask(t) {
    return {
      id: String(t.id),
      title: t.title || "",
      assignee: t.assignee || "",
      status: STATUSES.includes(t.status) ? t.status : "未着手",
      due: t.due || "",
      priority: PRIORITIES.includes(t.priority) ? t.priority : "中",
      holdReason: t.holdReason || "",
      updatedAt: t.updatedAt || "",
      updatedBy: t.updatedBy || "",
    };
  }

  function applyEvent(taskMap, evt) {
    // { eventId, type: 'Create'|'Update', taskId, payload:{...}, actor, at }
    const type = evt?.type || "Update";
    const taskId = evt?.taskId ? String(evt.taskId) : null;
    const payload = evt?.payload || {};
    const actor = evt?.actor || "";
    const at = evt?.at || "";

    if (!taskId) return;

    if (type === "Create") {
      const base = taskMap.get(taskId) || { id: taskId };
      const merged = normalizeTask({
        ...base,
        ...payload,
        id: taskId,
        updatedAt: at,
        updatedBy: actor,
      });
      taskMap.set(taskId, merged);
      return;
    }

    // Update
    const current = taskMap.get(taskId) || normalizeTask({ id: taskId });
    const next = normalizeTask({
      ...current,
      ...payload,
      id: taskId,
      updatedAt: at || current.updatedAt,
      updatedBy: actor || current.updatedBy,
    });
    taskMap.set(taskId, next);
  }

  /* =========================
     表示
     ========================= */
  function renderAll() {
    const rows = applyFiltersAndSort(mergedTasks);

    renderTable(rows);
    renderStats(rows);

    // 件数表示
    if (pillCounts) {
      const st = filterStatus ? filterStatus.value : FILTER_STATUS_ALL;
      pillCounts.textContent = `${rows.length}件${st === FILTER_STATUS_NOT_DONE ? "（完了除外）" : ""}`;
    }

    // 空状態（0件）
    if (emptyState) {
      emptyState.hidden = rows.length !== 0;
    }
    updateTorakunTalk(rows);
  }

  function applyFiltersAndSort(tasks) {
    const a = filterAssignee ? filterAssignee.value : "すべて";
    const s = filterStatus ? filterStatus.value : FILTER_STATUS_ALL;
    const p = filterPriority ? filterPriority.value : "すべて";
    const d = filterDue ? filterDue.value : "すべて";
    const q = (filterQuery ? filterQuery.value : "").trim().toLowerCase();

    const now = new Date();
    const inDays = (dueStr) => {
      if (!dueStr) return null;
      const due = new Date(dueStr + "T00:00:00");
      return (due - now) / (1000 * 60 * 60 * 24);
    };

    let filtered = tasks.filter(t => {
      // assignee
      if (a !== "すべて" && t.assignee !== a) return false;

      // status (B: 完了除外)
      if (s === FILTER_STATUS_NOT_DONE) {
        if (t.status === "完了") return false;
      } else if (s !== FILTER_STATUS_ALL && t.status !== s) {
        return false;
      }

      // priority
      if (p !== "すべて" && t.priority !== p) return false;

      // due
      if (d !== "すべて") {
        const days = inDays(t.due);
        if (days === null) return false;
        if (d === "期限切れ" && !(days < 0)) return false;
        if (d === "期限3日以内" && !(days >= 0 && days <= 3)) return false;
        if (d === "期限7日以内" && !(days >= 0 && days <= 7)) return false;
      }

      // query
      if (q) {
        const hay = `${t.id} ${t.title} ${t.assignee}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });

    filtered.sort((x, y) => compareBy(x, y, sortKey, sortDir));
    return filtered;
  }

  function compareBy(a, b, key, dir) {
    const mul = (dir === "asc") ? 1 : -1;
    const val = (t) => t?.[key];

    if (key === "status") {
      return ((STATUS_ORDER.get(val(a)) ?? 999) - (STATUS_ORDER.get(val(b)) ?? 999)) * mul;
    }
    if (key === "priority") {
      return ((PRIORITY_ORDER.get(val(a)) ?? 999) - (PRIORITY_ORDER.get(val(b)) ?? 999)) * mul;
    }
    if (key === "due") {
      const da = Date.parse((val(a) || "") + "T00:00:00") || 0;
      const db = Date.parse((val(b) || "") + "T00:00:00") || 0;
      return (da - db) * mul;
    }
    if (key === "updatedAt") {
      const ta = Date.parse(val(a) || "") || 0;
      const tb = Date.parse(val(b) || "") || 0;
      return (ta - tb) * mul;
    }

    const sa = String(val(a) ?? "");
    const sb = String(val(b) ?? "");
    return sa.localeCompare(sb, "ja") * mul;
  }

  /* =========================
     テーブル描画
     - バッジ内にミニトラッくん画像＋小物マーク
     ========================= */
  function renderTable(rows) {
    if (!tasksTbody) return;
    tasksTbody.innerHTML = "";

    const frag = document.createDocumentFragment();

    for (const t of rows) {
      const tr = document.createElement("tr");
      const dueClass = dueCssClass(t.due);

      tr.innerHTML = `
        <td><code>${escapeHtml(t.id)}</code></td>

        <td title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</td>

        <td>${escapeHtml(t.assignee || "")}</td>

        <td>
          <span class="badge badge--${escapeHtml(t.status)}">
            <span class="miniWrap" aria-hidden="true">
              <img class="miniMascotImg" src="${TORAKUN_HEAD_MAP[t.status] || DEFAULT_TORAKUN_HEAD}" alt="" />
              <span class="miniMark miniMark--${escapeHtml(t.status)}"></span>
            </span>
            ${escapeHtml(t.status)}
          </span>
          ${t.status === "保留中" && t.holdReason
            ? `<div><small>理由：${escapeHtml(t.holdReason)}</small></div>`
            : ""
          }
        </td>

        <td>${escapeHtml(t.priority)}</td>

        <td class="${dueClass}">${escapeHtml(t.due || "")}</td>

        <td><small>${escapeHtml(formatUpdated(t.updatedAt, t.updatedBy))}</small></td>

        <td>
          <button class="btn btn--ghost btnEdit" data-id="${escapeHtml(t.id)}">編集</button>
        </td>
      `;

      frag.appendChild(tr);
    }

    tasksTbody.appendChild(frag);

    // 編集ボタン
    tasksTbody.querySelectorAll(".btnEdit").forEach(b => {
      b.addEventListener("click", () => {
        const id = b.getAttribute("data-id");
        openDialogForEdit(id);
      });
    });
  }

  function dueCssClass(dueStr) {
    if (!dueStr) return "";
    const now = new Date();
    const due = new Date(dueStr + "T00:00:00");
    const diff = (due - now) / (1000 * 60 * 60 * 24);
    if (diff < 0) return "due--over";
    if (diff <= 3) return "due--soon";
    return "";
  }

  function formatUpdated(updatedAt, updatedBy) {
    if (!updatedAt && !updatedBy) return "";
    const at = updatedAt ? updatedAt.replace("T", " ").slice(0, 16) : "";
    return `${at}${updatedBy ? ` / ${updatedBy}` : ""}`;
  }

  /* =========================
     集計
     ========================= */
  function renderStats(rows) {
    if (!stats) return;

    const countByStatus = Object.fromEntries(STATUSES.map(s => [s, 0]));
    const overdue = rows.filter(t => dueCssClass(t.due) === "due--over").length;

    for (const t of rows) {
      if (countByStatus[t.status] !== undefined) countByStatus[t.status]++;
    }

    stats.innerHTML = "";

    const make = (label, value) => {
      const div = document.createElement("div");
      div.className = "stat";
      div.innerHTML = `
        <div class="stat__label">${escapeHtml(label)}</div>
        <div class="stat__value">${value}</div>
      `;
      return div;
    };

    stats.appendChild(make("未着手", countByStatus["未着手"]));
    stats.appendChild(make("進行中", countByStatus["進行中"]));
    stats.appendChild(make("確認待ち", countByStatus["確認待ち"]));
    stats.appendChild(make("保留中", countByStatus["保留中"]));
    stats.appendChild(make("期限切れ", overdue));
  }

  /* =========================
     編集 / 新規（ダイアログ）
     ========================= */
  function openDialogForEdit(taskId) {
    const task = mergedTasks.find(t => t.id === taskId);
    if (!task) return;

    currentEdit = {
      mode: "edit",
      taskBefore: { ...task }
    };

    if (dlgTitle) dlgTitle.textContent = "タスク編集（イベント生成）";
    if (dlgSubtitle) dlgSubtitle.textContent = `ID: ${task.id}｜任せろ、更新イベントを作るぞ。`;

    if (dlgId) dlgId.value = task.id;
    if (dlgAssignee) dlgAssignee.value = task.assignee || "";
    if (dlgTitleInput) dlgTitleInput.value = task.title || "";
    if (dlgStatus) dlgStatus.value = task.status || "未着手";
    if (dlgPriority) dlgPriority.value = task.priority || "中";
    if (dlgDue) dlgDue.value = task.due || "";
    if (dlgActor) dlgActor.value = "";
    if (dlgComment) dlgComment.value = "";
    if (dlgHoldReason) dlgHoldReason.value = task.holdReason || "";

    hideNotice();
    if (taskDialog) taskDialog.showModal();
  }

  function openDialogForNew() {
    const newId = generateNextId();

    currentEdit = {
      mode: "new",
      taskBefore: null,
      newId
    };

    if (dlgTitle) dlgTitle.textContent = "新規タスク作成（イベント生成）";
    if (dlgSubtitle) dlgSubtitle.textContent = "よし、1枚イベントを切るぞ。";

    if (dlgId) dlgId.value = newId;
    if (dlgAssignee) dlgAssignee.value = "";
    if (dlgTitleInput) dlgTitleInput.value = "";
    if (dlgStatus) dlgStatus.value = "未着手";
    if (dlgPriority) dlgPriority.value = "中";
    if (dlgDue) dlgDue.value = "";
    if (dlgActor) dlgActor.value = "";
    if (dlgComment) dlgComment.value = "";
    if (dlgHoldReason) dlgHoldReason.value = "";

    hideNotice();
    if (taskDialog) taskDialog.showModal();
  }

  function generateNextId() {
    const nums = mergedTasks
      .map(t => String(t.id))
      .map(id => {
        const m = id.match(/TASK-(\d+)/);
        return m ? parseInt(m[1], 10) : null;
      })
      .filter(n => n !== null);

    const max = nums.length ? Math.max(...nums) : 0;
    const next = max + 1;
    return `TASK-${String(next).padStart(4, "0")}`;
  }

  /* =========================
     イベント生成（DL / Copy）
     ========================= */
  function validateDialog() {
    const id = (dlgId ? dlgId.value : "").trim();
    const title = (dlgTitleInput ? dlgTitleInput.value : "").trim();
    const assignee = (dlgAssignee ? dlgAssignee.value : "").trim();
    const status = dlgStatus ? dlgStatus.value : "未着手";
    const due = dlgDue ? dlgDue.value : "";
    const priority = dlgPriority ? dlgPriority.value : "中";
    const actor = (dlgActor ? dlgActor.value : "").trim();
    const comment = (dlgComment ? dlgComment.value : "").trim();
    const holdReason = (dlgHoldReason ? dlgHoldReason.value : "").trim();

    if (!id) return { ok: false, message: "IDが不正だ。" };
    if (!title) return { ok: false, message: "タイトルは必須だ。" };
    if (!actor) return { ok: false, message: "更新者（actor）を入れてくれ。任せたぞ。" };
    if (!STATUSES.includes(status)) return { ok: false, message: "ステータスが不正だ。" };
    if (!PRIORITIES.includes(priority)) return { ok: false, message: "優先度が不正だ。" };

    if (status === "保留中" && !holdReason) {
      return { ok: false, message: "保留中にするなら、保留理由が必要だ。" };
    }

    return {
      ok: true,
      data: { id, title, assignee, status, due, priority, actor, comment, holdReason }
    };
  }

  function buildEventPayload(beforeTask, form) {
    const payload = {};
    const fields = ["title", "assignee", "status", "due", "priority", "holdReason"];

    for (const f of fields) {
      const newVal = form[f] ?? "";
      const oldVal = beforeTask ? (beforeTask[f] ?? "") : "";
      if (!beforeTask || String(newVal) !== String(oldVal)) {
        payload[f] = newVal;
      }
    }

    if (form.comment) payload.comment = form.comment;
    return payload;
  }

  function createEventObject(type, taskId, payload, actor) {
    const at = nowIsoJst();
    const eventId = `${yyyymmdd_hhmmss()}_${safeFileName(actor)}_${safeFileName(taskId)}`;
    return { eventId, type, taskId, payload, actor, at };
  }

  async function onSaveTask() {
    const v = validateDialog();
    if (!v.ok) {
      showNotice(v.message, "warn");
      return;
    }

    const form = v.data;
    const taskData = {
      id: form.id,
      title: form.title,
      assignee: form.assignee,
      status: form.status,
      priority: form.priority,
      due: form.due,
      hold_reason: form.holdReason,
      updated_at: new Date().toISOString(),
      updated_by: form.actor
    };

    // Supabaseへ保存（あれば更新、なければ作成）
    const { error } = await supabase.from('tasks').upsert(taskData);

    if (error) {
      alert("保存に失敗したぞ... " + error.message);
    } else {
      if (taskDialog) taskDialog.close();
      fetchTasks(); // 一覧を再取得
    }
  }

  async function onCopyEvent() {
    hideNotice();

    const v = validateDialog();
    if (!v.ok) {
      showNotice(v.message, "warn");
      return;
    }

    const form = v.data;
    const before = (currentEdit?.mode === "edit") ? currentEdit.taskBefore : null;
    const type = (currentEdit?.mode === "new") ? "Create" : "Update";
    const payload = buildEventPayload(before, form);

    const evt = createEventObject(type, form.id, payload, form.actor);

    try {
      await navigator.clipboard.writeText(JSON.stringify(evt, null, 2));
      showNotice("コピー完了だ！必要ならテキストに貼り付けて保存してくれ。", "info");
    } catch {
      showNotice("コピーに失敗した…（権限かも）DLでいこう。", "warn");
    }
  }

  /* =========================
     スナップショット生成（DL）
     ========================= */
  function exportSnapshot() {
    if (!mergedTasks.length) {
      alert("まず読み込みをしてくれ！");
      return;
    }

    const snapshot = mergedTasks.map(t => ({
      id: t.id,
      title: t.title,
      assignee: t.assignee,
      status: t.status,
      due: t.due,
      priority: t.priority,
      holdReason: t.holdReason || "",
      updatedAt: t.updatedAt || "",
      updatedBy: t.updatedBy || "",
    }));

    downloadJson(snapshot, `tasks_snapshot_${yyyymmdd_hhmmss()}.json`);

    alert(
      "スナップショットをDLしたぞ！\n" +
      "共有フォルダの data/snapshot/tasks_snapshot.json を置き換えると軽くなる。\n" +
      "（イベントは必要に応じて整理してくれ）"
    );
  }

  /* =========================
     リセット
     ========================= */
  function resetAll() {
    baseTasks = [];
    events = [];
    mergedTasks = [];

    sortKey = "updatedAt";
    sortDir = "desc";

    if (tasksTbody) tasksTbody.innerHTML = "";
    if (stats) stats.innerHTML = "";
    if (pillCounts) pillCounts.textContent = "0件";
    if (loadStatus) loadStatus.textContent = "";

    if (filterAssignee) filterAssignee.value = "すべて";
    if (filterPriority) filterPriority.value = "すべて";
    if (filterDue) filterDue.value = "すべて";
    if (filterQuery) filterQuery.value = "";
    if (filterStatus) filterStatus.value = FILTER_STATUS_NOT_DONE;

    if (emptyState) emptyState.hidden = true;

    // file input reset（ブラウザ制約で失敗する場合あり）
    try { if (fileSnapshot) fileSnapshot.value = ""; } catch {}
    try { if (fileEvents) fileEvents.value = ""; } catch {}
  }

  /* =========================
     UI小物
     ========================= */
  function setSelectOptions(select, items) {
    if (!select) return;
    select.innerHTML = "";
    for (const item of items) {
      const opt = document.createElement("option");
      opt.value = item;
      opt.textContent = item;
      select.appendChild(opt);
    }
  }

  function showNotice(message, kind = "warn") {
    if (!dlgNotice) return;
    dlgNotice.textContent = message;
    dlgNotice.className = "notice " + (kind === "warn" ? "notice--warn" : "");
    dlgNotice.style.display = "block";
  }

  function hideNotice() {
    if (!dlgNotice) return;
    dlgNotice.style.display = "none";
    dlgNotice.textContent = "";
  }

  /* =========================
     Util
     ========================= */
  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function debounce(fn, ms) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function nowIsoJst() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const tz = -d.getTimezoneOffset();
    const sign = tz >= 0 ? "+" : "-";
    const hh = pad(Math.floor(Math.abs(tz) / 60));
    const mm = pad(Math.abs(tz) % 60);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${hh}:${mm}`;
  }

  function yyyymmdd_hhmmss() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  function safeFileName(s) {
    return (s || "").replace(/[^\w\-ぁ-んァ-ヶ一-龠々ー]/g, "_");
  }

  function downloadJson(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function updateTorakunTalk(rows){
    if (!torakunTalkText) return;

    const total = rows.length;
    const overdue = rows.filter(t => dueCssClass(t.due) === "due--over").length;
    const soon = rows.filter(t => dueCssClass(t.due) === "due--soon").length;
    const hold = rows.filter(t => t.status === "保留中").length;
    const wait = rows.filter(t => t.status === "確認待ち").length;
    const doing = rows.filter(t => t.status === "進行中").length;
    const todo = rows.filter(t => t.status === "未着手").length;

    // 0件（読み込み前/絞り込み結果なし）
    if (total === 0){
      torakunTalkText.innerHTML = "任せろ！まずは「＋新規タスク」だ。<br>ひとつ作れば全部動き出すぞ！ 🐯";
      return;
    }

    // ここからは“状況連動”で優先度順にメッセージを決める
    let msg = "";

    if (overdue > 0){
      msg = `警戒だ！期限切れが <strong>${overdue}</strong> 件ある。<br>まずそこから片付けるぞ！ 🐯`;
    } else if (hold > 0){
      msg = `止まってるぞ！保留中が <strong>${hold}</strong> 件だ。<br>理由を潰して動かすぞ。 🐯`;
    } else if (wait > 0){
      msg = `確認待ちが <strong>${wait}</strong> 件ある。<br>ボールを回して返事を取りにいくぞ！ 🐯`;
    } else if (soon > 0){
      msg = `急げ！期限が近いのが <strong>${soon}</strong> 件だ。<br>先に手を付けよう。 🐯`;
    } else if (doing > 0){
      msg = `いい調子だ！進行中が <strong>${doing}</strong> 件。<br>押し切って完了まで持っていくぞ！ 🐯`;
    } else {
      msg = `よし、着手前が <strong>${todo}</strong> 件。<br>優先度“高”から切っていこう。任せろ！ 🐯`;
    }

    // 決定したメッセージをHTMLに差し込む
    torakunTalkText.innerHTML = msg;
  }

  /* =========================
     Start
     ========================= */
  init();
})();
