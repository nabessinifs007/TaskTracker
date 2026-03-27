// utils.js
// グローバルな名前空間を定義
window.TT = window.TT || {};

window.TT.CONFIG = {
  STATUSES: ["未着手", "進行中", "確認待ち", "保留中", "完了"],
  PRIORITIES: ["高", "中", "低"],
  TORAKUN_HEAD_MAP: {
    "未着手": "./assets/torakun_head_todo.png",
    "進行中": "./assets/torakun_head_doing.png",
    "確認待ち": "./assets/torakun_head_wait.png",
    "保留中": "./assets/torakun_head_hold.png",
    "完了": "./assets/torakun_head_done.png"
  },
  DEFAULT_TORAKUN_HEAD: "./assets/torakun_head.png"
};

window.TT.STATE = {
  tasks: [],
  sortKey: "updatedAt",
  sortDir: "desc",
  currentEdit: null
};

window.TT.Utils = {
  escapeHtml: (s) => {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  },

  debounce: (fn, ms) => {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  },

  nowIsoJst: () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const tz = -d.getTimezoneOffset();
    const sign = tz >= 0 ? "+" : "-";
    const hh = pad(Math.floor(Math.abs(tz) / 60));
    const mm = pad(Math.abs(tz) % 60);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${hh}:${mm}`;
  },

  dueCssClass: (dueStr) => {
    if (!dueStr) return "";
    const now = new Date();
    const due = new Date(dueStr + "T00:00:00");
    const diff = (due - now) / (1000 * 60 * 60 * 24);
    if (diff < 0) return "due--over";
    if (diff <= 3) return "due--soon";
    return "";
  },

  formatUpdated: (updatedAt, updatedBy) => {
    if (!updatedAt && !updatedBy) return "";
    const at = updatedAt ? updatedAt.replace("T", " ").slice(0, 16) : "";
    return `${at}${updatedBy ? ` / ${updatedBy}` : ""}`;
  },

  generateNextId: (tasks) => {
    const nums = tasks
      .map(t => String(t.id))
      .map(id => {
        const m = id.match(/TASK-(\d+)/);
        return m ? parseInt(m[1], 10) : null;
      })
      .filter(n => n !== null);
    const max = nums.length ? Math.max(...nums) : 0;
    const next = max + 1;
    return `TASK-${String(next).padStart(4, "0")}`;
  },

  exportCsv: (filteredTasks) => {
    if (!filteredTasks || filteredTasks.length === 0) {
      TT.UI.showToast("エクスポートするデータがありません。", "warn");
      return;
    }
    
    // ヘッダー行
    const headers = ["ID", "タイトル", "担当", "ステータス", "優先度", "期限", "コメント", "保留理由", "更新日時", "更新者"];
    
    // データ行
    const rows = filteredTasks.map(t => [
      t.id,
      t.title,
      t.assignee,
      t.status,
      t.priority,
      t.due,
      t.comment,
      t.holdReason,
      t.updatedAt,
      t.updatedBy
    ].map(val => {
      // CSVエスケープ
      let str = String(val ?? "");
      if (str.includes('"') || str.includes(',') || str.includes('\n')) {
        str = `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }));

    // CSV文字列作成（BOM付きUTF-8）
    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    
    // 日付入りファイル名
    const d = new Date();
    const ts = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
    link.setAttribute("download", `TaskTracker_${ts}.csv`);
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    TT.UI.showToast("CSVをダウンロードしました！", "success");
  }
};
