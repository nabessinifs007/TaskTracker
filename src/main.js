// main.js
window.TT = window.TT || {};

window.TT.Main = {
  init: () => {
    TT.UI.init();
    TT.Api.init();

    // イベントバインディング
    if (TT.UI.els.btnNewTask) {
      TT.UI.els.btnNewTask.addEventListener("click", TT.UI.openDialogForNew);
    }

    if (TT.UI.els.btnSaveEvent) {
      // 既存のイベントリスナーを破棄して新しく登録
      const newBtn = TT.UI.els.btnSaveEvent.cloneNode(true);
      TT.UI.els.btnSaveEvent.replaceWith(newBtn);
      TT.UI.els.btnSaveEvent = newBtn;
      newBtn.addEventListener("click", (e) => {
        e.preventDefault();
        TT.Main.onSaveTask();
      });
    }

    // 更新（再読み込み）ボタンがあれば
    const btnLoad = document.getElementById("btnLoad");
    if (btnLoad) {
      btnLoad.addEventListener("click", TT.Main.fetchTasks);
    }

    // CSVエクスポート
    if (TT.UI.els.btnExportCsv) {
      TT.UI.els.btnExportCsv.addEventListener("click", () => {
        const filtered = TT.Main.getFilteredAndSortedTasks();
        TT.Utils.exportCsv(filtered);
      });
    }

    // フィルタ変更イベント
    [TT.UI.els.filterAssignee, TT.UI.els.filterStatus, TT.UI.els.filterPriority, TT.UI.els.filterDue]
      .filter(Boolean)
      .forEach(s => s.addEventListener("change", TT.Main.renderAll));
    
    if (TT.UI.els.filterQuery) {
      TT.UI.els.filterQuery.addEventListener("input", TT.Utils.debounce(TT.Main.renderAll, 160));
    }

    // ソートイベント
    if (TT.UI.els.tasksTable) {
      TT.UI.els.tasksTable.querySelectorAll("th[data-sort]").forEach(th => {
        th.addEventListener("click", () => {
          const key = th.getAttribute("data-sort");
          if (!key) return;
          if (TT.STATE.sortKey === key) {
            TT.STATE.sortDir = (TT.STATE.sortDir === "asc") ? "desc" : "asc";
          } else {
            TT.STATE.sortKey = key;
            TT.STATE.sortDir = "asc";
          }
          TT.Main.renderAll();
        });
      });
    }

    // 初回データ取得
    TT.Main.fetchTasks();
  },

  fetchTasks: async () => {
    if (TT.UI.els.loadStatus) TT.UI.els.loadStatus.textContent = "同期中...";
    
    try {
      const data = await TT.Api.fetchTasks();
      TT.STATE.tasks = data;
      
      // 担当者の動的抽出
      const assignees = [...new Set(data.map(t => t.assignee).filter(a => a))];
      TT.UI.updateAssigneeFilter(assignees);

      TT.Main.renderAll();
      if (TT.UI.els.loadStatus) TT.UI.els.loadStatus.textContent = `同期完了 (${data.length}件)`;
    } catch (e) {
      if (TT.UI.els.loadStatus) TT.UI.els.loadStatus.textContent = "同期失敗";
      TT.UI.showToast("タスクの取得に失敗しました", "error");
    }
  },

  getFilteredAndSortedTasks: () => {
    const tasks = TT.STATE.tasks;
    const a = TT.UI.els.filterAssignee ? TT.UI.els.filterAssignee.value : "すべて";
    const s = TT.UI.els.filterStatus ? TT.UI.els.filterStatus.value : "すべて";
    const p = TT.UI.els.filterPriority ? TT.UI.els.filterPriority.value : "すべて";
    const d = TT.UI.els.filterDue ? TT.UI.els.filterDue.value : "すべて";
    const q = (TT.UI.els.filterQuery ? TT.UI.els.filterQuery.value : "").trim().toLowerCase();

    const now = new Date();
    const inDays = (dueStr) => {
      if (!dueStr) return null;
      const due = new Date(dueStr + "T00:00:00");
      return (due - now) / (1000 * 60 * 60 * 24);
    };

    let filtered = tasks.filter(t => {
      if (a !== "すべて" && t.assignee !== a) return false;
      if (s === "完了以外") {
        if (t.status === "完了") return false;
      } else if (s !== "すべて" && t.status !== s) {
        return false;
      }
      if (p !== "すべて" && t.priority !== p) return false;
      
      if (d !== "すべて") {
        const days = inDays(t.due);
        if (days === null) return false;
        if (d === "期限切れ" && !(days < 0)) return false;
        if (d === "期限3日以内" && !(days >= 0 && days <= 3)) return false;
        if (d === "期限7日以内" && !(days >= 0 && days <= 7)) return false;
      }

      if (q) {
        const hay = `${t.id} ${t.title} ${t.assignee} ${t.comment || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });

    const STATUS_ORDER = new Map(TT.CONFIG.STATUSES.map((st, i) => [st, i]));
    const PRIORITY_ORDER = new Map([["高", 0], ["中", 1], ["低", 2]]);

    filtered.sort((x, y) => {
      const mul = (TT.STATE.sortDir === "asc") ? 1 : -1;
      const key = TT.STATE.sortKey;
      const val = (t) => t?.[key];

      if (key === "status") {
        return ((STATUS_ORDER.get(val(x)) ?? 999) - (STATUS_ORDER.get(val(y)) ?? 999)) * mul;
      }
      if (key === "priority") {
        return ((PRIORITY_ORDER.get(val(x)) ?? 999) - (PRIORITY_ORDER.get(val(y)) ?? 999)) * mul;
      }
      if (key === "due") {
        const da = Date.parse((val(x) || "") + "T00:00:00") || 0;
        const db = Date.parse((val(y) || "") + "T00:00:00") || 0;
        return (da - db) * mul;
      }
      if (key === "updatedAt") {
        const ta = Date.parse(val(x) || "") || 0;
        const tb = Date.parse(val(y) || "") || 0;
        return (ta - tb) * mul;
      }

      const sa = String(val(x) ?? "");
      const sb = String(val(y) ?? "");
      return sa.localeCompare(sb, "ja") * mul;
    });

    return filtered;
  },

  renderAll: () => {
    const filteredRows = TT.Main.getFilteredAndSortedTasks();
    TT.UI.renderAll(filteredRows);
  },

  onSaveTask: async () => {
    const v = TT.UI.validateDialog();
    if (!v.ok) {
      TT.UI.showNotice(v.message, "warn");
      return;
    }

    try {
      await TT.Api.upsertTask(v.data);
      if (TT.UI.els.taskDialog) TT.UI.els.taskDialog.close();
      TT.UI.showToast(`タスク ${v.data.id} を保存しました！`, "success");
      await TT.Main.fetchTasks();
    } catch (e) {
      TT.UI.showNotice("保存に失敗したぞ... " + e.message, "warn");
    }
  },

  onDeleteTask: async (taskId) => {
    if (!confirm(`タスク ${taskId} を削除していいか？ 戻せないぞ！ 🐯`)) return;

    try {
      await TT.Api.deleteTask(taskId);
      TT.UI.showToast(`タスク ${taskId} を削除したぞ！`, "success");
      await TT.Main.fetchTasks();
    } catch (e) {
      TT.UI.showToast("削除に失敗したぞ... " + e.message, "error");
    }
  },

  onInlineStatusChange: async (taskId, newStatus) => {
    try {
      const task = TT.STATE.tasks.find(t => t.id === taskId);
      // actorを特定（今回はインラインなので既存のupdatedByを引き継ぐか汎用名にする）
      const actor = task?.updatedBy || "User"; 
      
      await TT.Api.updateTaskStatus(taskId, newStatus, actor);
      TT.UI.showToast(`${taskId} のステータスを「${newStatus}」に変更しました。`, "success");
      await TT.Main.fetchTasks(); // 成功したら一覧を再取得してバッジ色等も反映
    } catch (e) {
       TT.UI.showToast("ステータスの変更に失敗しました。 " + e.message, "error");
       await TT.Main.fetchTasks(); // 表示を元に戻すために再取得
    }
  }
};

// Application entry point
document.addEventListener("DOMContentLoaded", () => {
  TT.Main.init();
});
