// ui.js
window.TT = window.TT || {};

window.TT.UI = {
  els: {},

  init: () => {
    // DOM要素のキャッシュ
    const get = (id) => document.getElementById(id);
    TT.UI.els = {
      loadStatus: get("loadStatus"),
      filterAssignee: get("filterAssignee"),
      filterStatus: get("filterStatus"),
      filterPriority: get("filterPriority"),
      filterDue: get("filterDue"),
      filterQuery: get("filterQuery"),
      tasksTbody: get("tasksTbody"),
      tasksTable: get("tasksTable"),
      stats: get("stats"),
      pillCounts: get("pillCounts"),
      btnNewTask: get("btnNewTask"),
      taskDialog: get("taskDialog"),
      helpDialog: get("helpDialog"),
      btnHelp: get("btnHelp"),
      emptyState: get("emptyState"),
      torakunTalkText: get("torakunTalkText"),
      dlgTitle: get("dlgTitle"),
      dlgSubtitle: get("dlgSubtitle"),
      dlgId: get("dlgId"),
      dlgAssignee: get("dlgAssignee"),
      dlgTitleInput: get("dlgTitleInput"),
      dlgStatus: get("dlgStatus"),
      dlgPriority: get("dlgPriority"),
      dlgDue: get("dlgDue"),
      dlgActor: get("dlgActor"),
      dlgComment: get("dlgComment"),
      dlgHoldReason: get("dlgHoldReason"),
      dlgNotice: get("dlgNotice"),
      btnSaveEvent: get("btnSaveEvent"),
      btnExportCsv: get("btnExportCsv") // 新規追加用
    };

    // ヘルプモーダル
    if (TT.UI.els.btnHelp && TT.UI.els.helpDialog) {
      TT.UI.els.btnHelp.addEventListener("click", () => TT.UI.els.helpDialog.showModal());
    }

    // セレクトボックスの初期化
    TT.UI.setSelectOptions(TT.UI.els.filterPriority, ["すべて", ...TT.CONFIG.PRIORITIES]);
    TT.UI.setSelectOptions(TT.UI.els.filterDue, ["すべて", "期限切れ", "期限3日以内", "期限7日以内"]);
    TT.UI.setSelectOptions(TT.UI.els.filterStatus, ["すべて", "完了以外", ...TT.CONFIG.STATUSES]);
    
    // ダイアログ select 初期化
    TT.UI.setSelectOptions(TT.UI.els.dlgStatus, TT.CONFIG.STATUSES);

    // B版：完了はデフォルト非表示
    if (TT.UI.els.filterStatus) TT.UI.els.filterStatus.value = "完了以外";

    TT.UI.setupDraggableTorakun();
  },

  setSelectOptions: (select, items) => {
    if (!select) return;
    select.innerHTML = "";
    for (const item of items) {
      const opt = document.createElement("option");
      opt.value = item;
      opt.textContent = item;
      select.appendChild(opt);
    }
  },

  // 担当者フィルターをデータから動的生成
  updateAssigneeFilter: (assignees) => {
    const sel = TT.UI.els.filterAssignee;
    if (!sel) return;
    const currentVal = sel.value;
    TT.UI.setSelectOptions(sel, ["すべて", ...assignees]);
    if (assignees.includes(currentVal)) {
      sel.value = currentVal;
    } else {
      sel.value = "すべて";
    }
  },

  showNotice: (message, kind = "warn") => {
    const notice = TT.UI.els.dlgNotice;
    if (!notice) return;
    notice.textContent = message;
    notice.className = "notice " + (kind === "warn" ? "notice--warn" : "");
    notice.style.display = "block";
  },

  hideNotice: () => {
    const notice = TT.UI.els.dlgNotice;
    if (!notice) return;
    notice.style.display = "none";
    notice.textContent = "";
  },

  showToast: (message, type = "info") => {
    // toastContainerがなければ作成
    let container = document.getElementById("toastContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "toastContainer";
      container.className = "toast-container";
      document.body.appendChild(container);
    }
    
    const toast = document.createElement("div");
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // アニメーション用に即座にクラス追加
    requestAnimationFrame(() => {
      toast.classList.add("toast--show");
      setTimeout(() => {
        toast.classList.remove("toast--show");
        setTimeout(() => toast.remove(), 300); // fade out duration
      }, 3000);
    });
  },

  renderAll: (filteredRows) => {
    TT.UI.renderTable(filteredRows);
    TT.UI.renderStats(filteredRows);

    if (TT.UI.els.pillCounts) {
      const st = TT.UI.els.filterStatus ? TT.UI.els.filterStatus.value : "すべて";
      TT.UI.els.pillCounts.textContent = `${filteredRows.length}件${st === "完了以外" ? "（完了除外）" : ""}`;
    }

    if (TT.UI.els.emptyState) {
      TT.UI.els.emptyState.hidden = filteredRows.length !== 0;
    }
    TT.UI.updateTorakunTalk(filteredRows);
    TT.UI.updateSortIndicators();
  },

  updateSortIndicators: () => {
    if (!TT.UI.els.tasksTable) return;
    const ths = TT.UI.els.tasksTable.querySelectorAll("th[data-sort]");
    ths.forEach(th => {
      // 既存のアイコンを削除
      const icon = th.querySelector('.sort-icon');
      if (icon) icon.remove();
      
      const key = th.getAttribute("data-sort");
      if (key === TT.STATE.sortKey) {
        const span = document.createElement("span");
        span.className = "sort-icon";
        span.textContent = TT.STATE.sortDir === "asc" ? " ▲" : " ▼";
        th.appendChild(span);
        th.classList.add("th-active");
      } else {
        th.classList.remove("th-active");
      }
    });
  },

  renderTable: (rows) => {
    const tbody = TT.UI.els.tasksTbody;
    if (!tbody) return;
    tbody.innerHTML = "";

    const frag = document.createDocumentFragment();

    for (const t of rows) {
      const tr = document.createElement("tr");
      const dueClass = TT.Utils.dueCssClass(t.due);
      
      const headImg = TT.CONFIG.TORAKUN_HEAD_MAP[t.status] || TT.CONFIG.DEFAULT_TORAKUN_HEAD;

      // ステータスのインライン編集用セレクトボックス生成
      const statusOptions = TT.CONFIG.STATUSES.map(s => 
        `<option value="${s}" ${s === t.status ? 'selected' : ''}>${s}</option>`
      ).join('');

      tr.innerHTML = `
        <td><code>${TT.Utils.escapeHtml(t.id)}</code></td>
        <td title="${TT.Utils.escapeHtml(t.title)}">
            <div class="card-title-mobile">${TT.Utils.escapeHtml(t.title)}</div>
            ${t.comment ? `<div class="task-comment"><small>💬 ${TT.Utils.escapeHtml(t.comment)}</small></div>` : ''}
        </td>
        <td data-label="担当">${TT.Utils.escapeHtml(t.assignee || "")}</td>
        <td data-label="ステータス">
          <div class="inline-status-wrap">
              <span class="miniWrap" aria-hidden="true" style="margin-right: 4px;">
                <img class="miniMascotImg" src="${headImg}" alt="" />
                <span class="miniMark miniMark--${TT.Utils.escapeHtml(t.status)}"></span>
              </span>
              <select class="inlineStatusSelect badge--${TT.Utils.escapeHtml(t.status)}" data-id="${TT.Utils.escapeHtml(t.id)}">
                  ${statusOptions}
              </select>
          </div>
          ${t.status === "保留中" && t.holdReason
            ? `<div style="margin-top:4px;"><small>理由：${TT.Utils.escapeHtml(t.holdReason)}</small></div>`
            : ""
          }
        </td>
        <td data-label="優先度">${TT.Utils.escapeHtml(t.priority)}</td>
        <td data-label="期限" class="${dueClass}">${TT.Utils.escapeHtml(t.due || "")}</td>
        <td data-label="更新"><small>${TT.Utils.escapeHtml(TT.Utils.formatUpdated(t.updatedAt, t.updatedBy))}</small></td>
        <td data-label="操作">
          <button class="btn btn--ghost btnEdit" data-id="${TT.Utils.escapeHtml(t.id)}">編集</button>
          <button class="btn btn--ghost btnDelete" data-id="${TT.Utils.escapeHtml(t.id)}" style="color: var(--s-red);">削除</button>
        </td>
      `;
      frag.appendChild(tr);
    }

    tbody.appendChild(frag);

    // インライン編集イベント
    tbody.querySelectorAll(".inlineStatusSelect").forEach(sel => {
      sel.addEventListener("change", (e) => {
        const id = e.target.getAttribute("data-id");
        const newStatus = e.target.value;
        if (window.TT.Main && window.TT.Main.onInlineStatusChange) {
           window.TT.Main.onInlineStatusChange(id, newStatus);
        }
      });
    });

    // 編集・削除ボタンイベント
    tbody.querySelectorAll(".btnEdit").forEach(b => {
      b.addEventListener("click", () => {
        const id = b.getAttribute("data-id");
        TT.UI.openDialogForEdit(id);
      });
    });

    tbody.querySelectorAll(".btnDelete").forEach(b => {
      b.addEventListener("click", () => {
        const id = b.getAttribute("data-id");
        if (window.TT.Main && window.TT.Main.onDeleteTask) {
           window.TT.Main.onDeleteTask(id);
        }
      });
    });
  },

  renderStats: (rows) => {
    if (!TT.UI.els.stats) return;

    const countByStatus = Object.fromEntries(TT.CONFIG.STATUSES.map(s => [s, 0]));
    const overdue = rows.filter(t => TT.Utils.dueCssClass(t.due) === "due--over").length;

    for (const t of rows) {
      if (countByStatus[t.status] !== undefined) countByStatus[t.status]++;
    }

    TT.UI.els.stats.innerHTML = "";

    const make = (label, value) => {
      const div = document.createElement("div");
      div.className = "stat";
      div.innerHTML = `
        <div class="stat__label">${TT.Utils.escapeHtml(label)}</div>
        <div class="stat__value">${value}</div>
      `;
      return div;
    };

    TT.UI.els.stats.appendChild(make("未着手", countByStatus["未着手"]));
    TT.UI.els.stats.appendChild(make("進行中", countByStatus["進行中"]));
    TT.UI.els.stats.appendChild(make("確認待ち", countByStatus["確認待ち"]));
    TT.UI.els.stats.appendChild(make("保留中", countByStatus["保留中"]));
    TT.UI.els.stats.appendChild(make("期限切れ", overdue));
  },

  openDialogForEdit: (taskId) => {
    const task = TT.STATE.tasks.find(t => t.id === taskId);
    if (!task) return;

    TT.STATE.currentEdit = { mode: "edit", taskBefore: { ...task } };

    if (TT.UI.els.dlgTitle) TT.UI.els.dlgTitle.textContent = "タスク編集";
    if (TT.UI.els.dlgSubtitle) TT.UI.els.dlgSubtitle.textContent = `ID: ${task.id}｜情報を更新するぞ。`;

    if (TT.UI.els.dlgId) TT.UI.els.dlgId.value = task.id;
    if (TT.UI.els.dlgAssignee) TT.UI.els.dlgAssignee.value = task.assignee || "";
    if (TT.UI.els.dlgTitleInput) TT.UI.els.dlgTitleInput.value = task.title || "";
    if (TT.UI.els.dlgStatus) TT.UI.els.dlgStatus.value = task.status || "未着手";
    if (TT.UI.els.dlgPriority) TT.UI.els.dlgPriority.value = task.priority || "中";
    if (TT.UI.els.dlgDue) TT.UI.els.dlgDue.value = task.due || "";
    if (TT.UI.els.dlgActor) TT.UI.els.dlgActor.value = task.updatedBy || "";
    if (TT.UI.els.dlgComment) TT.UI.els.dlgComment.value = task.comment || "";
    if (TT.UI.els.dlgHoldReason) TT.UI.els.dlgHoldReason.value = task.holdReason || "";

    TT.UI.hideNotice();
    if (TT.UI.els.taskDialog) TT.UI.els.taskDialog.showModal();
  },

  openDialogForNew: () => {
    const newId = TT.Utils.generateNextId(TT.STATE.tasks);

    TT.STATE.currentEdit = { mode: "new", newId };

    if (TT.UI.els.dlgTitle) TT.UI.els.dlgTitle.textContent = "新規タスク作成";
    if (TT.UI.els.dlgSubtitle) TT.UI.els.dlgSubtitle.textContent = "よし、新しいタスクを登録するぞ。";

    if (TT.UI.els.dlgId) TT.UI.els.dlgId.value = newId;
    if (TT.UI.els.dlgAssignee) TT.UI.els.dlgAssignee.value = "";
    if (TT.UI.els.dlgTitleInput) TT.UI.els.dlgTitleInput.value = "";
    if (TT.UI.els.dlgStatus) TT.UI.els.dlgStatus.value = "未着手";
    if (TT.UI.els.dlgPriority) TT.UI.els.dlgPriority.value = "中";
    if (TT.UI.els.dlgDue) TT.UI.els.dlgDue.value = "";
    if (TT.UI.els.dlgActor) TT.UI.els.dlgActor.value = "";
    if (TT.UI.els.dlgComment) TT.UI.els.dlgComment.value = "";
    if (TT.UI.els.dlgHoldReason) TT.UI.els.dlgHoldReason.value = "";

    TT.UI.hideNotice();
    if (TT.UI.els.taskDialog) TT.UI.els.taskDialog.showModal();
  },

  validateDialog: () => {
    const v = (el) => el ? el.value.trim() : "";
    
    const data = {
      id: v(TT.UI.els.dlgId),
      title: v(TT.UI.els.dlgTitleInput),
      assignee: v(TT.UI.els.dlgAssignee),
      status: v(TT.UI.els.dlgStatus) || "未着手",
      due: v(TT.UI.els.dlgDue),
      priority: v(TT.UI.els.dlgPriority) || "中",
      updatedBy: v(TT.UI.els.dlgActor),
      comment: v(TT.UI.els.dlgComment),
      holdReason: v(TT.UI.els.dlgHoldReason)
    };

    if (!data.id) return { ok: false, message: "IDが不正だ。" };
    if (!data.title) return { ok: false, message: "タイトルは必須だ。" };
    if (!data.updatedBy) return { ok: false, message: "更新者（actor）を入れてくれ。任せたぞ。" };
    if (!TT.CONFIG.STATUSES.includes(data.status)) return { ok: false, message: "ステータスが不正だ。" };
    if (!TT.CONFIG.PRIORITIES.includes(data.priority)) return { ok: false, message: "優先度が不正だ。" };

    if (data.status === "保留中" && !data.holdReason) {
      return { ok: false, message: "保留中にするなら、保留理由が必要だ。" };
    }

    return { ok: true, data };
  },

  updateTorakunTalk: (rows) => {
    const t = TT.UI.els.torakunTalkText;
    if (!t) return;

    const total = rows.length;
    const overdue = rows.filter(x => TT.Utils.dueCssClass(x.due) === "due--over").length;
    const soon = rows.filter(x => TT.Utils.dueCssClass(x.due) === "due--soon").length;
    const hold = rows.filter(x => x.status === "保留中").length;
    const wait = rows.filter(x => x.status === "確認待ち").length;
    const doing = rows.filter(x => x.status === "進行中").length;
    const todo = rows.filter(x => x.status === "未着手").length;

    if (total === 0){
      t.innerHTML = "任せろ！まずは「＋新規タスク」だ。<br>ひとつ作れば全部動き出すぞ！ 🐯";
      return;
    }

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

    t.innerHTML = msg;
  },

  setupDraggableTorakun: () => {
    const dock = document.getElementById("torakunDock");
    if (!dock) return;

    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    const savedPos = localStorage.getItem("torakunPos");
    if (savedPos) {
      const { left, top } = JSON.parse(savedPos);
      dock.style.left = left;
      dock.style.top = top;
      dock.style.right = "auto";
      dock.style.bottom = "auto";
    }

    const dragStart = (e) => {
      if (e.target.closest('.toraSpeechBubble')) return; 
      isDragging = true;
      const clientX = e.type.includes("touch") ? e.touches[0].clientX : e.clientX;
      const clientY = e.type.includes("touch") ? e.touches[0].clientY : e.clientY;
      startX = clientX;
      startY = clientY;
      const rect = dock.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      dock.style.right = "auto";
      dock.style.bottom = "auto";
      dock.style.left = initialLeft + "px";
      dock.style.top = initialTop + "px";
    };

    const drag = (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const clientX = e.type.includes("touch") ? e.touches[0].clientX : e.clientX;
      const clientY = e.type.includes("touch") ? e.touches[0].clientY : e.clientY;
      const dx = clientX - startX;
      const dy = clientY - startY;
      dock.style.left = `${initialLeft + dx}px`;
      dock.style.top = `${initialTop + dy}px`;
    };

    const dragEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      localStorage.setItem("torakunPos", JSON.stringify({
        left: dock.style.left,
        top: dock.style.top
      }));
    };

    dock.addEventListener("mousedown", dragStart);
    document.addEventListener("mousemove", drag);
    document.addEventListener("mouseup", dragEnd);
    dock.addEventListener("touchstart", dragStart, { passive: false });
    document.addEventListener("touchmove", drag, { passive: false });
    document.addEventListener("touchend", dragEnd);
  }
};
