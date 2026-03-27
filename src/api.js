// api.js
window.TT = window.TT || {};

window.TT.Api = {
  // Config
  SUPABASE_URL: 'https://hivbkvwcjosnhzhuptfg.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpdmJrdndjam9zbmh6aHVwdGZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTA5ODIsImV4cCI6MjA5MDA4Njk4Mn0.6cAS4ZakPQqAcBk8DvfqFIaBT3cUCJNftgaHQjhGwoc',
  client: null,

  init: () => {
    if (!window.supabase) {
      console.error("Supabase client is not loaded.");
      return;
    }
    TT.Api.client = window.supabase.createClient(TT.Api.SUPABASE_URL, TT.Api.SUPABASE_KEY);
  },

  fetchTasks: async () => {
    if (!TT.Api.client) TT.Api.init();

    const { data, error } = await TT.Api.client
      .from('tasks')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error(error);
      throw error;
    }

    return data.map(t => ({
      id: t.id,
      title: t.title,
      assignee: t.assignee,
      status: t.status,
      due: t.due,
      priority: t.priority,
      holdReason: t.hold_reason,
      comment: t.comment, // 新規追加: commentカラム
      updatedAt: t.updated_at,
      updatedBy: t.updated_by
    }));
  },

  upsertTask: async (taskObj) => {
    if (!TT.Api.client) TT.Api.init();

    // アプリ内のオブジェクト（キャメルケース）から、DB用のオブジェクト（スネークケース）へ変換
    const taskData = {
      id: taskObj.id,
      title: taskObj.title,
      assignee: taskObj.assignee,
      status: taskObj.status,
      priority: taskObj.priority,
      due: taskObj.due,
      hold_reason: taskObj.holdReason,
      comment: taskObj.comment, // 新規追加
      updated_at: taskObj.updatedAt || new Date().toISOString(),
      updated_by: taskObj.updatedBy
    };

    const { error } = await TT.Api.client.from('tasks').upsert(taskData);
    if (error) throw error;
  },

  updateTaskStatus: async (taskId, newStatus, updatedBy) => {
    if (!TT.Api.client) TT.Api.init();
    
    // インライン編集用。ステータスと更新日時・者だけ更新
    const taskData = {
      id: taskId,
      status: newStatus,
      updated_at: new Date().toISOString()
    };
    
    // updatedByが指定されていれば追加
    if (updatedBy) {
        taskData.updated_by = updatedBy;
    }

    const { error } = await TT.Api.client.from('tasks').upsert(taskData);
    if (error) throw error;
  },

  deleteTask: async (taskId) => {
    if (!TT.Api.client) TT.Api.init();

    const { error } = await TT.Api.client
      .from('tasks')
      .delete()
      .eq('id', taskId);

    if (error) throw error;
  }
};
