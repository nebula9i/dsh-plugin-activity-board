/**
 * Activity board: a kanban view of chats.
 *
 * Columns are live activity, not projects: working, waiting, done (last 12h),
 * standby. Inside a column, chats are grouped under their project and every
 * project group is ordered by its most recent chat. A pinned project stays at
 * the top of every column and can be reordered by dragging it onto another
 * pinned project.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-board',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'board';
    const DONE_WINDOW_MS = 12 * 60 * 60 * 1000;
    const PIN_KEY = 'dsh.board.pinnedProjects';
    const ORDER_KEY = 'dsh.board.pinnedOrder';
    const COMPACT_KEY = 'dsh.board.compact';
    const COLUMN_ORDER_KEY = 'dsh.board.columnOrder';
    const EMPTY = Object.freeze({});
    const EMPTY_MAP = new Map();
    const EMPTY_WS = Object.freeze({ items: [], archivedSessionIds: [], pinnedSessionIds: [] });

    const EN = {
      title: 'Activity board',
      subtitle: '{chats} chats across {projects} projects',
      'column.working': 'Working',
      'column.waiting': 'Waiting',
      'column.done': 'Done',
      'column.standby': 'Standby',
      'column.hint.working': 'A turn is running right now',
      'column.hint.waiting': 'Needs your answer, approval, or a retry',
      'column.hint.done': 'Finished in the last 12 hours',
      'column.hint.standby': 'Quiet for more than 12 hours',
      showArchived: 'Include archived',
      empty: 'Nothing here',
      emptyBoard: 'No chats yet. Start one and it appears here.',
      archived: 'Archived',
      pinProject: 'Pin project to the top',
      unpinProject: 'Unpin project',
      openChat: 'Open chat',
      untitled: 'Untitled chat',
      newChat: 'New chat',
      newProject: 'New project',
      search: 'Search chats',
      searchPlaceholder: 'Search chats and messages',
      clearSearch: 'Clear search',
      startChat: 'Start a chat',
      noProjectChats: 'No chats yet',
      noMatches: 'No matches',
      pickerUnavailable: 'No directory picker is available in this profile.',
      createFailed: 'Could not add that project.',
      created: 'Project added',
      openBoard: 'Open the board',
      launchHint: 'The board opens as a full panel so every column has room.',
      compact: 'Compact rows',
      compactHint: 'Put each chat title and its time on one line',
      reorderColumn: 'Drag to reorder columns',
      switchProject: 'Switch project',
      switchChat: 'Switch chat',
      ungrouped: 'Ungrouped',
      badgeWaiting: '{n} waiting for you',
      badgeFinished: '{n} finished',
      'when.now': 'just now',
      'when.minutes': '{n}m ago',
      'when.hours': '{n}h ago',
      'when.day': '1d ago',
    };

    const PT = {
      title: 'Quadro de atividade',
      subtitle: '{chats} conversas em {projects} projetos',
      'column.working': 'Trabalhando',
      'column.waiting': 'Aguardando',
      'column.done': 'Concluído',
      'column.standby': 'Em espera',
      'column.hint.working': 'Um turno está correndo agora',
      'column.hint.waiting': 'Precisa da sua resposta, aprovação ou nova tentativa',
      'column.hint.done': 'Terminou nas últimas 12 horas',
      'column.hint.standby': 'Parado há mais de 12 horas',
      showArchived: 'Incluir arquivadas',
      empty: 'Nada aqui',
      emptyBoard: 'Nenhuma conversa ainda. Comece uma e ela aparece aqui.',
      archived: 'Arquivada',
      pinProject: 'Fixar projeto no topo',
      unpinProject: 'Desafixar projeto',
      openChat: 'Abrir conversa',
      untitled: 'Conversa sem título',
      newChat: 'Nova conversa',
      newProject: 'Novo projeto',
      search: 'Buscar conversas',
      searchPlaceholder: 'Buscar conversas e mensagens',
      clearSearch: 'Limpar busca',
      startChat: 'Começar uma conversa',
      noProjectChats: 'Nenhuma conversa ainda',
      noMatches: 'Nada encontrado',
      pickerUnavailable: 'Nenhum seletor de diretório disponível neste perfil.',
      createFailed: 'Não foi possível adicionar o projeto.',
      created: 'Projeto adicionado',
      openBoard: 'Abrir o quadro',
      launchHint: 'O quadro abre como painel inteiro para cada coluna ter espaço.',
      compact: 'Linhas compactas',
      compactHint: 'Título e horário da conversa na mesma linha',
      reorderColumn: 'Arraste para reordenar as colunas',
      switchProject: 'Trocar de projeto',
      switchChat: 'Trocar de conversa',
      ungrouped: 'Sem projeto',
      badgeWaiting: '{n} aguardando você',
      badgeFinished: '{n} concluídas',
      'when.now': 'agora',
      'when.minutes': '{n}m atrás',
      'when.hours': '{n}h atrás',
      'when.day': '1d atrás',
    };

    const DICTS = { en: EN, pt: PT };

    const COLUMNS = [
      { id: 'working', token: 'brand' },
      { id: 'waiting', token: 'warn' },
      { id: 'done', token: 'success' },
      { id: 'standby', token: 'idle' },
    ];

    const HUES = [212, 262, 318, 348, 16, 38, 96, 158, 186, 240];

    function localeId(locale) {
      try {
        const snap = locale && locale.getLocale ? locale.getLocale() : null;
        const raw = String((snap && (snap.id || snap.locale || snap.language)) || 'en');
        return raw.toLowerCase();
      } catch (_error) {
        return 'en';
      }
    }

    function dictFor(locale) {
      const id = localeId(locale);
      const base = id.split(/[-_]/)[0];
      return DICTS[base] || DICTS[id] || DICTS.en;
    }

    function makeT(locale) {
      return (key, params) => {
        const dict = dictFor(locale);
        let text = dict[key];
        if (typeof text !== 'string') text = EN[key];
        if (typeof text !== 'string') return key;
        if (params && typeof params === 'object') {
          for (const name of Object.keys(params)) {
            text = text.split('{' + name + '}').join(String(params[name]));
          }
        }
        return text;
      };
    }

    function readJson(key, fallback) {
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : fallback;
      } catch (_error) {
        return fallback;
      }
    }

    function writeJson(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (_error) {
        /* storage is optional */
      }
    }

    function readFlag(key) {
      try {
        return window.localStorage.getItem(key) === '1';
      } catch (_error) {
        return false;
      }
    }

    function writeFlag(key, value) {
      try {
        window.localStorage.setItem(key, value ? '1' : '0');
      } catch (_error) {
        /* storage is optional */
      }
    }

    function hueFor(key) {
      let hash = 0;
      const text = String(key || '');
      for (let index = 0; index < text.length; index += 1) {
        hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
      }
      return HUES[hash % HUES.length];
    }

    function pad(value) {
      return value < 10 ? '0' + value : String(value);
    }

    /** Under 48h: relative. Under a week: clock and date. Older: date only. */
    function formatWhen(ts, now, t) {
      const time = Number(ts);
      if (!Number.isFinite(time) || time <= 0) return '';
      const diff = Math.max(0, now - time);
      const minute = 60 * 1000;
      const hour = 60 * minute;
      const day = 24 * hour;
      if (diff < minute) return t('when.now');
      if (diff < hour) return t('when.minutes', { n: Math.floor(diff / minute) });
      if (diff < day) return t('when.hours', { n: Math.floor(diff / hour) });
      if (diff < 2 * day) return t('when.day');
      const date = new Date(time);
      const d = pad(date.getDate());
      const mo = pad(date.getMonth() + 1);
      const y = String(date.getFullYear()).slice(-2);
      if (diff < 7 * day) return pad(date.getHours()) + ':' + pad(date.getMinutes()) + ' - ' + d + '/' + mo + '/' + y;
      return d + '/' + mo + '/' + y;
    }

    function sessionState(row, status, now) {
      if (status && status.pendingInteraction) return 'waiting';
      if ((status && status.running) || (row && row.running)) return 'working';
      const ts = Number(row && row.updatedAt) || 0;
      return now - ts < DONE_WINDOW_MS ? 'done' : 'standby';
    }

    /** Column a project lands in: the most urgent state any of its chats holds. */
    const PRECEDENCE = { waiting: 0, working: 1, done: 2, standby: 3 };

    function statusFor(statuses, sessionId) {
      if (!statuses) return undefined;
      if (typeof statuses.get === 'function') return statuses.get(sessionId);
      return statuses[sessionId];
    }

    /** Subscribe to a plain ObservableSnapshot when a slot does not inject a hook. */
    function useSnapshot(source) {
      const [value, setValue] = React.useState(() => (source && typeof source.getSnapshot === 'function' ? source.getSnapshot() : undefined));
      React.useEffect(() => {
        if (!source || typeof source.subscribe !== 'function') return undefined;
        setValue(source.getSnapshot());
        return source.subscribe(() => setValue(source.getSnapshot()));
      }, [source]);
      return value;
    }

    function titleOf(row, t) {
      const raw = row && (row.displayTitle || row.title);
      return typeof raw === 'string' && raw.trim() ? raw.trim() : t('untitled');
    }

    function buildModel(input) {
      const { byId, ids, statuses, workspace, now, showArchived, pinned, order, query, content, t } = input;
      const rows = byId && typeof byId === 'object' ? byId : EMPTY;
      const idList = Array.isArray(ids) && ids.length ? ids : Object.keys(rows);
      const archived = new Set(Array.isArray(workspace.archivedSessionIds) ? workspace.archivedSessionIds : []);
      const items = Array.isArray(workspace.items) ? workspace.items : [];
      const pinnedSet = new Set(pinned);
      const orderIndex = new Map(order.map((key, index) => [key, index]));
      const needle = String(query || '').trim().toLowerCase();
      const matches = content instanceof Map ? content : EMPTY_MAP;

      const groups = new Map();
      const ensureGroup = (key, item) => {
        let group = groups.get(key);
        if (!group) {
          group = {
            key,
            workspaceId: item ? item.workspaceId : null,
            title: item ? String(item.title || item.path || key) : t('untitled'),
            hue: hueFor(key),
            pinned: pinnedSet.has(key),
            chats: [],
            latest: 0,
            createdAt: item ? Number(Date.parse(item.createdAt)) || 0 : 0,
          };
          groups.set(key, group);
        }
        return group;
      };

      const owner = new Map();
      const byPath = new Map();
      for (const item of items) {
        const list = Array.isArray(item && item.sessionIds) ? item.sessionIds : [];
        for (const sessionId of list) owner.set(sessionId, item);
        const path = item && typeof item.path === 'string' ? item.path : '';
        if (path) {
          byPath.set(path.toLowerCase(), item);
          ensureGroup(String(item.workspaceId || path), item);
        }
      }

      let chatCount = 0;
      for (const sessionId of idList) {
        const row = rows[sessionId];
        if (!row || row.blank === true) continue;
        const isArchived = archived.has(sessionId);
        if (isArchived && !showArchived) continue;

        const item = owner.get(sessionId) || byPath.get(String((row && row.cwd) || '').toLowerCase());
        const key = item ? String(item.workspaceId || item.path || 'ungrouped') : 'ungrouped';
        const group = ensureGroup(key, item);

        const title = titleOf(row, t);
        const snippet = matches.get(sessionId);
        if (needle) {
          const inTitle = title.toLowerCase().includes(needle) || group.title.toLowerCase().includes(needle);
          if (!inTitle && typeof snippet !== 'string') continue;
        }

        const status = statusFor(statuses, sessionId);
        const updatedAt = Number(row.updatedAt) || 0;
        group.chats.push({
          id: sessionId,
          title,
          snippet: typeof snippet === 'string' && needle && !title.toLowerCase().includes(needle) ? snippet : '',
          when: formatWhen(updatedAt, now, t),
          state: sessionState(row, status, now),
          archived: isArchived,
          error: Boolean(row.lastAgentError || row.promptError),
          updatedAt,
        });
        if (updatedAt > group.latest) group.latest = updatedAt;
        chatCount += 1;
      }

      const columns = { working: [], waiting: [], done: [], standby: [] };
      let projectCount = 0;
      for (const group of groups.values()) {
        if (!group.chats.length) {
          if (needle) continue;
          columns.standby.push(group);
          continue;
        }
        projectCount += 1;
        group.chats.sort((a, b) => b.updatedAt - a.updatedAt);
        let state = 'standby';
        for (const chat of group.chats) {
          if (PRECEDENCE[chat.state] < PRECEDENCE[state]) state = chat.state;
        }
        columns[state].push(group);
      }

      const byProject = (a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        if (a.pinned && b.pinned) {
          const ai = orderIndex.has(a.key) ? orderIndex.get(a.key) : Number.MAX_SAFE_INTEGER;
          const bi = orderIndex.has(b.key) ? orderIndex.get(b.key) : Number.MAX_SAFE_INTEGER;
          if (ai !== bi) return ai - bi;
        }
        if (!a.chats.length || !b.chats.length) {
          if (a.chats.length !== b.chats.length) return a.chats.length ? -1 : 1;
          return b.createdAt - a.createdAt;
        }
        return b.latest - a.latest;
      };

      for (const id of Object.keys(columns)) columns[id].sort(byProject);

      return { columns, chatCount, projectCount, searching: needle.length > 0 };
    }

    const CSS = [
      '.dshboard-shell{display:flex;flex-direction:column;height:100%;min-height:0;box-sizing:border-box;padding:16px 20px 14px;gap:12px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-size:13px}',
      // macOS draws its window buttons (close/minimize/zoom) inside the content
      // area because the title bar is hiddenInset, and a main panel starts at the
      // window's top-left corner whenever the sidebar is collapsed or drawn over
      // the content. The shell publishes --dsh-frame-leading-clearance for exactly
      // that case (the inline band its window-chrome seat occupies, measured from
      // the frame edge), so the board header starts past the buttons instead of
      // covering them. Shell left padding here is 20px, hence the subtraction.
      '.dshboard-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;min-height:30px;padding-inline-start:max(0px,calc(var(--dsh-frame-leading-clearance,0px) - 20px))}',
      '.dshboard-h1{margin:0;font-size:16px;font-weight:600;letter-spacing:-.01em}',
      '.dshboard-sub{color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.dshboard-spacer{flex:1}',
      '.dshboard-tools{display:flex;align-items:center;gap:6px}',
      '.dshboard-toggle{display:inline-flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer;user-select:none;margin-right:4px}',
      '.dshboard-iconbtn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.dshboard-iconbtn:hover{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary)}',
      '.dshboard-iconbtn[data-on="true"]{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}',
      '.dshboard-iconbtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dshboard-btn{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}',
      '.dshboard-btn:hover{border-color:var(--dsw-alias-border-l2)}',
      '.dshboard-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dshboard-btn svg{color:var(--dsw-alias-label-secondary)}',
      '.dshboard-btn[data-accent="true"] svg{color:var(--dsw-alias-brand-primary)}',
      '.dshboard-search{display:flex;align-items:center;gap:6px;height:28px;padding:0 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);min-width:220px}',
      '.dshboard-search input{flex:1;min-width:0;border:none;outline:none;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px}',
      '.dshboard-search input::placeholder{color:var(--dsw-alias-label-secondary)}',
      '.dshboard-notice{font-size:12px;color:var(--dsw-alias-state-error-primary)}',
      '.dshboard-cols{display:grid;grid-template-columns:repeat(4,minmax(212px,1fr));gap:12px;flex:1;min-height:0;overflow-x:auto;overflow-y:hidden;padding-bottom:2px}',
      '.dshboard-col{display:flex;flex-direction:column;min-height:0;min-width:0;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-top:2px solid var(--dshboard-accent);border-radius:12px;overflow:hidden}',
      '.dshboard-col[data-state="working"]{--dshboard-accent:var(--dsw-alias-brand-primary)}',
      '.dshboard-col[data-state="waiting"]{--dshboard-accent:var(--dsw-alias-state-warn-primary)}',
      '.dshboard-col[data-state="done"]{--dshboard-accent:var(--dsw-alias-state-success-primary)}',
      '.dshboard-col[data-state="standby"]{--dshboard-accent:var(--dsw-alias-state-idle-primary)}',
      '.dshboard-colhead{display:flex;align-items:center;gap:8px;padding:10px 12px 8px;flex:none}',
      '.dshboard-colidot{width:8px;height:8px;border-radius:50%;background:var(--dshboard-accent);flex:none}',
      '.dshboard-colname{font-weight:600;font-size:12px;letter-spacing:.02em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}',
      '.dshboard-count{margin-left:auto;font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.dshboard-hint{padding:0 12px 8px;font-size:11px;color:var(--dsw-alias-label-secondary);opacity:.8;flex:none}',
      '.dshboard-body{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:0 8px 10px;display:flex;flex-direction:column;gap:8px}',
      '.dshboard-group{border:1px solid var(--dsw-alias-border-l1);border-left:3px solid var(--dshboard-hue);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}',
      '.dshboard-group[data-pinned="true"]{box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2)}',
      '.dshboard-group[data-empty="true"]{background:transparent;border-style:dashed;border-left-width:3px}',
      '.dshboard-group[data-flash="true"]{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.dshboard-grouphead{display:flex;align-items:center;gap:6px;padding:7px 8px;min-width:0}',
      '.dshboard-grouphead[data-draggable="true"]{cursor:grab}',
      '.dshboard-grouptitle{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1}',
      '.dshboard-pin{border:none;background:transparent;cursor:pointer;padding:0 2px;font-size:12px;line-height:1;color:var(--dsw-alias-label-secondary);opacity:.55}',
      '.dshboard-pin:hover{opacity:1}',
      '.dshboard-pin[data-on="true"]{opacity:1;color:var(--dsw-alias-brand-primary)}',
      '.dshboard-add{border:none;background:transparent;cursor:pointer;padding:0 2px;color:var(--dsw-alias-label-secondary);opacity:.55;display:inline-flex;align-items:center}',
      '.dshboard-add:hover{opacity:1;color:var(--dsw-alias-brand-primary)}',
      '.dshboard-cards{display:flex;flex-direction:column;gap:4px;padding:0 6px 6px}',
      '.dshboard-card{display:flex;flex-direction:column;gap:3px;width:100%;text-align:left;border:1px solid transparent;border-radius:8px;background:var(--dsw-alias-bg-layer-1);padding:6px 8px;cursor:pointer;color:inherit;font:inherit}',
      '.dshboard-card:hover{border-color:var(--dsw-alias-border-l2)}',
      '.dshboard-card:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dshboard-card[data-archived="true"]{opacity:.55;cursor:default}',
      '.dshboard-card[data-muted="true"]{background:transparent}',
      '.dshboard-card[data-muted="true"] .dshboard-cardtitle{color:var(--dsw-alias-label-secondary)}',
      '.dshboard-card[data-muted="true"] .dshboard-snippet{opacity:.55}',
      '.dshboard-card[data-muted="true"] .dshboard-cardmeta{opacity:.65}',
      '.dshboard-card[data-muted="true"]:hover{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l2)}',
      '.dshboard-card[data-muted="true"]:hover .dshboard-cardtitle{color:var(--dsw-alias-label-primary)}',
      '.dshboard-card[data-muted="true"]:hover .dshboard-cardmeta{opacity:1}',
      '.dshboard-cardtitle{font-size:12px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}',
      '.dshboard-snippet{font-size:11px;line-height:1.35;color:var(--dsw-alias-label-secondary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;opacity:.85}',
      '.dshboard-cardmeta{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.dshboard-dot{width:6px;height:6px;border-radius:50%;flex:none}',
      '.dshboard-dot[data-state="working"]{background:var(--dsw-alias-brand-primary)}',
      '.dshboard-dot[data-state="waiting"]{background:var(--dsw-alias-state-warn-primary)}',
      '.dshboard-dot[data-state="done"]{background:var(--dsw-alias-state-success-primary)}',
      '.dshboard-dot[data-state="standby"]{background:var(--dsw-alias-state-idle-primary)}',
      '.dshboard-dot[data-error="true"]{background:var(--dsw-alias-state-error-primary)}',
      '.dshboard-flag{font-size:10px;text-transform:uppercase;letter-spacing:.04em;opacity:.75}',
      '.dshboard-empty{margin:2px 0;padding:10px;border:1px dashed var(--dsw-alias-border-l1);border-radius:8px;color:var(--dsw-alias-label-secondary);font-size:11px;text-align:center}',
      '.dshboard-shell[data-compact="true"] .dshboard-card{flex-direction:row;align-items:center;gap:8px;padding:4px 8px}',
      '.dshboard-shell[data-compact="true"] .dshboard-cardtitle{-webkit-line-clamp:1;flex:1;min-width:0}',
      '.dshboard-shell[data-compact="true"] .dshboard-snippet{display:none}',
      '.dshboard-shell[data-compact="true"] .dshboard-cardmeta{flex:none;margin-left:auto}',
      '.dshboard-colhead[data-draggable="true"]{cursor:grab}',
      '.dshboard-colhead[data-dragging="true"]{opacity:.45}',
      '.dshboard-quota{display:flex;flex-direction:column;gap:2px;padding:4px 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:1.3;cursor:pointer;font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.dshboard-quota:hover{border-color:var(--dsw-alias-border-l2)}',
      '.dshboard-quota:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dshboard-quotaRow{display:flex;align-items:center;gap:6px}',
      '.dshboard-quotaLabel{min-width:14px;opacity:.75}',
      '.dshboard-quotaPct{min-width:30px;color:var(--dsw-alias-label-primary);font-weight:600}',
      '.dshboard-quotaVal{color:var(--dsw-alias-label-secondary)}',
      '.dshboard-quotaReset{margin-left:auto;padding-left:8px;opacity:.7}',
      '.dshboard-blank{flex:1;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary);font-size:13px}',
      '.dshboard-launch{display:flex;flex-direction:column;align-items:center;gap:10px;max-width:340px;text-align:center}',
      '.dshboard-launch .dshboard-sub{margin:0;line-height:1.5}',
    ].join('');

    function IconSearch() {
      return h(
        'svg',
        { width: 15, height: 15, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true, focusable: false },
        h('circle', { cx: 7, cy: 7, r: 4.5, stroke: 'currentColor', strokeWidth: 1.4 }),
        h('path', { d: 'M10.5 10.5 14 14', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
      );
    }

    function IconPlus() {
      return h(
        'svg',
        { width: 15, height: 15, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true, focusable: false },
        h('path', { d: 'M8 3.5v9M3.5 8h9', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
      );
    }

    function IconFolderPlus() {
      return h(
        'svg',
        { width: 15, height: 15, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true, focusable: false },
        h('path', {
          d: 'M2 5.2c0-.66.54-1.2 1.2-1.2h3l1.2 1.5h5.4c.66 0 1.2.54 1.2 1.2v4.6c0 .66-.54 1.2-1.2 1.2H3.2A1.2 1.2 0 0 1 2 11.3V5.2Z',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinejoin: 'round',
        }),
        h('path', { d: 'M9.6 8.6v2.2M8.5 9.7h2.2', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
      );
    }

    function IconClose() {
      return h(
        'svg',
        { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true, focusable: false },
        h('path', { d: 'M4.5 4.5l7 7m0-7-7 7', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
      );
    }

    function IconCompact() {
      return h(
        'svg',
        { width: 15, height: 15, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true, focusable: false },
        h('path', { d: 'M2.5 5.5h7M2.5 10.5h7', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
        h('path', { d: 'M12 5.5h1.5M12 10.5h1.5', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
      );
    }

    /**
     * Command Code quota source.
     *
     * The namespace is a remote service path, not a plain service key, so it is
     * resolved through `ctx.inject` exactly as the provider plugin does. The
     * returned object is an ObservableSnapshot of the namespace itself, which
     * lets the board appear once the provider mounts and disappear with it.
     */
    function readCommandCodeNamespace(ctx) {
      try {
        const direct = ctx.remote && ctx.remote.commandcode;
        if (direct) return direct;
      } catch (_error) {
        /* service path not exposed on this context */
      }
      try {
        const viaGet = typeof ctx.get === 'function' ? ctx.get('remote.commandcode') : undefined;
        if (viaGet) return viaGet;
      } catch (_error) {
        /* unknown service */
      }
      return null;
    }

    function createCreditsSource(ctx) {
      let namespace = null;
      const listeners = new Set();
      const notify = () => {
        for (const listener of listeners) listener();
      };
      const sync = () => {
        const found = readCommandCodeNamespace(ctx);
        if (found === namespace) return;
        namespace = found;
        notify();
      };

      sync();
      const timer = setInterval(sync, 5000);
      try {
        ctx.effect(() => () => clearInterval(timer), 'dsh-board: commandcode poll');
      } catch (_error) {
        /* leave the timer to the page lifetime */
      }

      try {
        ctx.inject(['remote.commandcode'], (namespaceCtx) => {
          const found = namespaceCtx.remote.commandcode;
          if (found && found !== namespace) {
            namespace = found;
            notify();
          }
        });
      } catch (error) {
        console.warn('[dsh-board] command code inject unavailable', error);
      }

      return {
        getSnapshot: () => namespace,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        providerPresent: () => {
          try {
            const entries = ctx.slots && typeof ctx.slots.entries === 'function' ? ctx.slots.entries('main') : [];
            return (entries || []).some((entry) => {
              const options = entry && entry.options ? entry.options : {};
              const id = String(options.key || options.id || '');
              return id === 'commandcode-panel' || id.indexOf('commandcode') >= 0;
            });
          } catch (_error) {
            return false;
          }
        },
        report: async () => {
          const current = namespace;
          if (!current || typeof current.report !== 'function') return null;
          const result = await current.report();
          const value = result && result.ok === true ? result.value : result;
          const accounts = value && Array.isArray(value.accounts) ? value.accounts : [];
          if (!accounts.length) return null;
          const active = accounts.find((entry) => entry && entry.active) || accounts[0];
          const credits = (active && active.report && active.report.credits) || {};
          const pick = (window) => {
            if (!window || !(Number(window.cap) > 0)) return null;
            return {
              used: Number(window.used) || 0,
              cap: Number(window.cap),
              exceeded: Boolean(window.exceeded),
              resetAt: Number(window.resetAt) || 0,
            };
          };
          const fiveHour = pick(credits.fiveHour);
          const weekly = pick(credits.weekly);
          if (!fiveHour && !weekly) return null;
          const plan =
            (active && active.plan && active.plan.name) ||
            (active && active.report && active.report.plan && active.report.plan.name) ||
            '';
          return { fiveHour, weekly, plan: String(plan || '') };
        },
      };
    }

    function Ring(props) {
      const size = Number(props.size) || 16;
      const percent = Math.max(0, Math.min(100, Number(props.percent) || 0));
      const radius = size / 2 - 2;
      const center = size / 2;
      const circumference = 2 * Math.PI * radius;
      const dash = (circumference * percent) / 100;
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 ' + size + ' ' + size, 'aria-hidden': true, focusable: false },
        h('circle', { cx: center, cy: center, r: radius, fill: 'none', stroke: 'var(--dsw-alias-border-l2)', strokeWidth: 2 }),
        h('circle', {
          cx: center,
          cy: center,
          r: radius,
          fill: 'none',
          stroke: props.warn ? 'var(--dsw-alias-state-warn-primary)' : 'var(--dsw-alias-brand-primary)',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeDasharray: dash + ' ' + circumference,
          transform: 'rotate(-90 ' + center + ' ' + center + ')',
        }),
      );
    }

    function money(value) {
      const amount = Number(value) || 0;
      if (amount === 0) return '$0.00';
      return Math.abs(amount) < 0.01 ? '$' + amount.toFixed(4) : '$' + amount.toFixed(2);
    }

    /** Local reset moment: clock time today, date and time otherwise. */
    function resetLabel(ms, now) {
      const time = Number(ms);
      if (!Number.isFinite(time) || time <= 0) return '';
      const date = new Date(time);
      const clock = pad(date.getHours()) + ':' + pad(date.getMinutes());
      const sameDay = new Date(now).toDateString() === date.toDateString();
      return sameDay ? clock : pad(date.getDate()) + '/' + pad(date.getMonth() + 1) + ' ' + clock;
    }

    function CreditsBlock(props) {
      if (!props.available) return null;
      const credits = props.credits;

      if (!credits) {
        return h(
          'button',
          {
            type: 'button',
            className: 'dshboard-quota',
            title: props.reachable
              ? 'Command Code quota report unavailable'
              : 'Command Code found, but its quota source is not reachable from this panel',
            'aria-label': 'Command Code quota',
            onClick: () => props.onOpen && props.onOpen(),
          },
          h(
            'span',
            { className: 'dshboard-quotaRow' },
            h(Ring, { percent: 0, size: 12 }),
            h('span', { className: 'dshboard-quotaPct' }, '\u2014'),
          ),
        );
      }

      const rows = [
        { key: '5h', label: '5h', window: credits.fiveHour },
        { key: 'wk', label: 'wk', window: credits.weekly },
      ].filter((row) => row.window);

      const tooltip = rows
        .map((row) => {
          const percent = Math.round((row.window.used / row.window.cap) * 100);
          const reset = resetLabel(row.window.resetAt, props.now);
          return row.label + ' ' + percent + '% ' + money(row.window.used) + ' / ' + money(row.window.cap) + (reset ? ' · resets ' + reset : '');
        })
        .join('\n');
      const updated = props.updatedAt ? '\nupdated ' + resetLabel(props.updatedAt, props.now) : '';

      return h(
        'button',
        {
          type: 'button',
          className: 'dshboard-quota',
          title: (credits.plan ? credits.plan + '\n' : '') + tooltip + updated,
          'aria-label': tooltip,
          onClick: () => props.onOpen && props.onOpen(),
        },
        rows.map((row) => {
          const percent = Math.round((row.window.used / row.window.cap) * 100);
          const reset = resetLabel(row.window.resetAt, props.now);
          return h(
            'span',
            { className: 'dshboard-quotaRow', key: row.key },
            h(Ring, { percent, size: 12, warn: row.window.exceeded || percent >= 90 }),
            h('span', { className: 'dshboard-quotaLabel' }, row.label),
            h('span', { className: 'dshboard-quotaPct' }, percent + '%'),
            h('span', { className: 'dshboard-quotaVal' }, money(row.window.used) + ' / ' + money(row.window.cap)),
            reset ? h('span', { className: 'dshboard-quotaReset' }, '\u21bb ' + reset) : null,
          );
        }),
      );
    }

    function BoardPanel(props) {
      const useSessions = typeof props.useSessions === 'function' ? props.useSessions : () => EMPTY;
      const useSessionStatus = typeof props.useSessionStatus === 'function' ? props.useSessionStatus : () => EMPTY_MAP;
      const useWorkspaces = typeof props.useWorkspaces === 'function' ? props.useWorkspaces : () => EMPTY_WS;

      const t = typeof props.tx === 'function' ? props.tx : typeof props.t === 'function' ? props.t : (key) => key;
      const hasSessionsHook = typeof props.useSessions === 'function';
      const hasStatusHook = typeof props.useSessionStatus === 'function';
      const hasWorkspacesHook = typeof props.useWorkspaces === 'function';

      const propById = useSessions((state) => (state && state.byId) || EMPTY) || EMPTY;
      const propIds = useSessions((state) => (state && state.ids) || null);
      const propStatuses = useSessionStatus((state) => state) || EMPTY_MAP;
      const propWorkspace = useWorkspaces((state) => state) || EMPTY_WS;

      const liveSessions = useSnapshot(props.sessionsSource);
      const liveWorkspaces = useSnapshot(props.workspacesSource);

      const byId = hasSessionsHook ? propById : (liveSessions && liveSessions.byId) || EMPTY;
      const ids = hasSessionsHook ? propIds : (liveSessions && liveSessions.ids) || null;
      const statuses = hasStatusHook ? propStatuses : EMPTY_MAP;
      const workspace = hasWorkspacesHook ? propWorkspace : liveWorkspaces || EMPTY_WS;

      const useContextMenu = typeof props.useContextMenu === 'function' ? props.useContextMenu : null;
      const menu = useContextMenu ? useContextMenu() : null;

      const [now, setNow] = React.useState(() => Date.now());
      const [showArchived, setShowArchived] = React.useState(false);
      const [pinned, setPinned] = React.useState(() => readJson(PIN_KEY, []));
      const [order, setOrder] = React.useState(() => readJson(ORDER_KEY, []));
      const [query, setQuery] = React.useState('');
      const [searchOpen, setSearchOpen] = React.useState(false);
      const [content, setContent] = React.useState(() => new Map());
      const [notice, setNotice] = React.useState(null);
      const [flash, setFlash] = React.useState(null);
      const [compact, setCompact] = React.useState(() => readFlag(COMPACT_KEY));
      const [columnOrder, setColumnOrder] = React.useState(() => {
        const ids = COLUMNS.map((column) => column.id);
        const stored = readJson(COLUMN_ORDER_KEY, []).filter((id) => ids.includes(id));
        for (const id of ids) if (!stored.includes(id)) stored.push(id);
        return stored;
      });
      const [draggingColumn, setDraggingColumn] = React.useState(null);
      const [credits, setCredits] = React.useState(null);
      const [creditsAt, setCreditsAt] = React.useState(0);
      const dragKey = React.useRef(null);
      const dragColumn = React.useRef(null);
      const searchInput = React.useRef(null);

      const searchSessions = props.searchSessions;
      const searchRef = React.useRef(searchSessions);
      searchRef.current = searchSessions;
      const creditsSource = props.creditsSource;
      const creditsNamespace = useSnapshot(creditsSource);
      const creditsProvider =
        creditsSource && typeof creditsSource.providerPresent === 'function' ? creditsSource.providerPresent() : false;

      React.useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 30000);
        return () => clearInterval(timer);
      }, []);

      React.useEffect(() => {
        if (!creditsSource || !creditsNamespace) {
          setCredits(null);
          return undefined;
        }
        let cancelled = false;
        const load = () => {
          Promise.resolve(creditsSource.report())
            .then((value) => {
              if (cancelled) return;
              setCredits(value || null);
              setCreditsAt(Date.now());
            })
            .catch(() => {
              if (!cancelled) setCredits(null);
            });
        };
        load();
        const timer = setInterval(load, 300000);
        return () => {
          cancelled = true;
          clearInterval(timer);
        };
      }, [creditsSource, creditsNamespace]);

      React.useEffect(() => {
        const term = query.trim();
        const run = searchRef.current;
        if (!term || typeof run !== 'function') {
          setContent(new Map());
          return undefined;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => {
          Promise.resolve(run(term, controller.signal))
            .then((result) => {
              if (controller.signal.aborted) return;
              const items = result && Array.isArray(result.items) ? result.items : [];
              const next = new Map();
              for (const item of items) {
                if (item && typeof item.sessionId === 'string') {
                  next.set(item.sessionId, typeof item.snippet === 'string' ? item.snippet : '');
                }
              }
              setContent(next);
            })
            .catch(() => {
              if (!controller.signal.aborted) setContent(new Map());
            });
        }, 250);
        return () => {
          clearTimeout(timer);
          controller.abort();
        };
      }, [query]);

      React.useEffect(() => {
        if (searchOpen && searchInput.current && typeof searchInput.current.focus === 'function') {
          searchInput.current.focus();
        }
      }, [searchOpen]);

      React.useEffect(() => {
        if (!flash) return undefined;
        const timer = setTimeout(() => setFlash(null), 4000);
        return () => clearTimeout(timer);
      }, [flash]);

      React.useEffect(() => {
        if (!notice) return undefined;
        const timer = setTimeout(() => setNotice(null), 6000);
        return () => clearTimeout(timer);
      }, [notice]);

      const model = React.useMemo(
        () =>
          buildModel({
            byId,
            ids,
            statuses,
            workspace,
            now,
            showArchived,
            pinned,
            order,
            query,
            content,
            t,
          }),
        [byId, ids, statuses, workspace, now, showArchived, pinned, order, query, content, t],
      );

      const togglePin = React.useCallback((key) => {
        setPinned((current) => {
          const next = current.includes(key) ? current.filter((item) => item !== key) : current.concat([key]);
          writeJson(PIN_KEY, next);
          return next;
        });
        setOrder((current) => {
          const next = current.includes(key) ? current : current.concat([key]);
          writeJson(ORDER_KEY, next);
          return next;
        });
      }, []);

      const swapPinned = React.useCallback((from, to) => {
        setOrder((current) => {
          if (!current.includes(from) || !current.includes(to)) return current;
          const next = current.slice();
          const a = next.indexOf(from);
          const b = next.indexOf(to);
          next[a] = to;
          next[b] = from;
          writeJson(ORDER_KEY, next);
          return next;
        });
      }, []);

      const moveColumn = React.useCallback((from, to) => {
        setColumnOrder((current) => {
          if (from === to || !current.includes(from) || !current.includes(to)) return current;
          const next = current.filter((id) => id !== from);
          const index = next.indexOf(to);
          if (index < 0) return current;
          next.splice(index, 0, from);
          writeJson(COLUMN_ORDER_KEY, next);
          return next;
        });
      }, []);

      const startChat = React.useCallback(
        (workspaceId) => {
          if (typeof props.startChat !== 'function') return;
          try {
            props.startChat(workspaceId || undefined);
          } catch (error) {
            console.warn('[dsh-board] startChat failed', error);
          }
        },
        [props.startChat],
      );

      const createProject = React.useCallback(() => {
        if (typeof props.createProject !== 'function') return;
        setNotice(null);
        Promise.resolve(props.createProject())
          .then((workspaceId) => {
            if (workspaceId) {
              setFlash(String(workspaceId));
              setNotice(t('created'));
            }
          })
          .catch((error) => {
            const message = error && error.message ? String(error.message) : '';
            setNotice(message || t('createFailed'));
          });
      }, [props.createProject, t]);

      const open = props.openChat;

      if (!hasStatusHook) {
        return h(
          'div',
          { className: 'dshboard-shell' },
          h('style', null, CSS),
          h(
            'div',
            { className: 'dshboard-blank' },
            h(
              'div',
              { className: 'dshboard-launch' },
              h('div', { className: 'dshboard-h1' }, t('title')),
              h('p', { className: 'dshboard-sub' }, t('launchHint')),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dshboard-btn',
                  'data-accent': 'true',
                  onClick: () => props.openBoard && props.openBoard(),
                },
                t('openBoard'),
              ),
            ),
          ),
        );
      }

      const renderGroup = (group, columnId) => {
        const empty = group.chats.length === 0;
        return h(
          'div',
          {
            key: group.key,
            className: 'dshboard-group',
            'data-pinned': String(group.pinned),
            'data-empty': String(empty),
            'data-flash': String(flash === group.key),
            style: { '--dshboard-hue': 'hsl(' + group.hue + ' 58% 52%)' },
          },
          h(
            'div',
            {
              className: 'dshboard-grouphead',
              'data-draggable': String(group.pinned),
              draggable: group.pinned,
              onDragStart: group.pinned
                ? (event) => {
                    dragKey.current = group.key;
                    try {
                      event.dataTransfer.setData('text/plain', group.key);
                      event.dataTransfer.effectAllowed = 'move';
                    } catch (_error) {
                      /* older engines */
                    }
                  }
                : undefined,
              onDragEnd: group.pinned ? () => { dragKey.current = null; } : undefined,
              onDragOver: group.pinned
                ? (event) => {
                    if (dragKey.current && dragKey.current !== group.key) event.preventDefault();
                  }
                : undefined,
              onDrop: group.pinned
                ? (event) => {
                    event.preventDefault();
                    const from = dragKey.current;
                    dragKey.current = null;
                    if (from && from !== group.key) swapPinned(from, group.key);
                  }
                : undefined,
            },
            h('span', { className: 'dshboard-grouptitle', title: group.title }, group.title),
            group.workspaceId
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshboard-add',
                    title: t('newChat'),
                    'aria-label': t('newChat') + ': ' + group.title,
                    onClick: () => startChat(group.workspaceId),
                  },
                  h(IconPlus),
                )
              : null,
            h(
              'button',
              {
                type: 'button',
                className: 'dshboard-pin',
                'data-on': String(group.pinned),
                title: group.pinned ? t('unpinProject') : t('pinProject'),
                'aria-label': group.pinned ? t('unpinProject') : t('pinProject'),
                'aria-pressed': String(group.pinned),
                onClick: () => togglePin(group.key),
              },
              group.pinned ? '\u2605' : '\u2606',
            ),
          ),
          empty
            ? h(
                'div',
                { className: 'dshboard-cards' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshboard-card',
                    onClick: group.workspaceId ? () => startChat(group.workspaceId) : undefined,
                  },
                  h('span', { className: 'dshboard-cardtitle' }, t('startChat')),
                ),
              )
            : h(
                'div',
                { className: 'dshboard-cards' },
                group.chats.map((chat) => {
                  const trigger =
                    menu && typeof menu.getTriggerProps === 'function'
                      ? menu.getTriggerProps({ kind: 'session', value: { sessionId: chat.id, displayTitle: chat.title } })
                      : null;
                  return h(
                    'button',
                    {
                      ...(trigger || {}),
                      key: chat.id,
                      type: 'button',
                      className: 'dshboard-card',
                      'data-archived': String(chat.archived),
                      'data-muted': String(chat.state !== columnId),
                      title: chat.archived ? t('archived') : t('openChat'),
                      onClick: chat.archived ? undefined : () => open && open(chat.id),
                    },
                    h('span', { className: 'dshboard-cardtitle' }, chat.title),
                    chat.snippet ? h('span', { className: 'dshboard-snippet' }, chat.snippet) : null,
                    h(
                      'span',
                      { className: 'dshboard-cardmeta' },
                      h('span', {
                        className: 'dshboard-dot',
                        'data-state': chat.state,
                        'data-error': String(chat.error),
                        'aria-hidden': true,
                      }),
                      h('span', null, chat.when),
                      chat.archived ? h('span', { className: 'dshboard-flag' }, t('archived')) : null,
                    ),
                  );
                }),
              ),
        );
      };

      const orderedColumns = columnOrder.map((id) => COLUMNS.find((column) => column.id === id)).filter(Boolean);

      const columns = orderedColumns.map((column) => {
        const groups = model.columns[column.id] || [];
        return h(
          'section',
          { key: column.id, className: 'dshboard-col', 'data-state': column.id },
          h(
            'div',
            {
              className: 'dshboard-colhead',
              'data-draggable': 'true',
              'data-dragging': String(draggingColumn === column.id),
              draggable: true,
              title: t('reorderColumn'),
              onDragStart: (event) => {
                dragColumn.current = column.id;
                setDraggingColumn(column.id);
                try {
                  event.dataTransfer.setData('text/plain', column.id);
                  event.dataTransfer.effectAllowed = 'move';
                } catch (_error) {
                  /* older engines */
                }
              },
              onDragEnd: () => {
                dragColumn.current = null;
                setDraggingColumn(null);
              },
              onDragOver: (event) => {
                if (dragColumn.current && dragColumn.current !== column.id) event.preventDefault();
              },
              onDrop: (event) => {
                event.preventDefault();
                const from = dragColumn.current;
                dragColumn.current = null;
                setDraggingColumn(null);
                if (from && from !== column.id) moveColumn(from, column.id);
              },
            },
            h('span', { className: 'dshboard-colidot', 'aria-hidden': true }),
            h('span', { className: 'dshboard-colname' }, t('column.' + column.id)),
            h('span', { className: 'dshboard-count' }, String(groups.reduce((sum, g) => sum + g.chats.length, 0))),
          ),
          h('div', { className: 'dshboard-hint' }, t('column.hint.' + column.id)),
          h(
            'div',
            { className: 'dshboard-body' },
            groups.length ? groups.map((group) => renderGroup(group, column.id)) : h('div', { className: 'dshboard-empty' }, model.searching ? t('noMatches') : t('empty')),
          ),
        );
      });

      const tools = h(
        'div',
        { className: 'dshboard-tools' },
        h(CreditsBlock, {
          credits,
          available: Boolean(creditsNamespace) || creditsProvider,
          reachable: Boolean(creditsNamespace),
          now,
          updatedAt: creditsAt,
          onOpen: props.openCredits,
        }),
        h(
          'button',
          {
            type: 'button',
            className: 'dshboard-iconbtn',
            'data-on': String(compact),
            title: t('compactHint'),
            'aria-label': t('compact'),
            'aria-pressed': String(compact),
            onClick: () =>
              setCompact((value) => {
                const next = !value;
                writeFlag(COMPACT_KEY, next);
                return next;
              }),
          },
          h(IconCompact),
        ),
        searchOpen
          ? h(
              'div',
              { className: 'dshboard-search' },
              h(IconSearch),
              h('input', {
                ref: searchInput,
                type: 'text',
                value: query,
                placeholder: t('searchPlaceholder'),
                'aria-label': t('searchPlaceholder'),
                onChange: (event) => setQuery(event.target.value),
                onKeyDown: (event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setQuery('');
                    setSearchOpen(false);
                  }
                },
              }),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dshboard-iconbtn',
                  title: t('clearSearch'),
                  'aria-label': t('clearSearch'),
                  onClick: () => {
                    setQuery('');
                    setSearchOpen(false);
                  },
                  style: { width: 20, height: 20 },
                },
                h(IconClose),
              ),
            )
          : h(
              'button',
              {
                type: 'button',
                className: 'dshboard-iconbtn',
                title: t('search'),
                'aria-label': t('search'),
                onClick: () => setSearchOpen(true),
              },
              h(IconSearch),
            ),
        h(
          'button',
          {
            type: 'button',
            className: 'dshboard-btn',
            onClick: createProject,
            title: t('newProject'),
          },
          h(IconFolderPlus),
          t('newProject'),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dshboard-btn',
            'data-accent': 'true',
            onClick: () => startChat(),
            title: t('newChat'),
          },
          h(IconPlus),
          t('newChat'),
        ),
      );

      const header = h(
        'div',
        { className: 'dshboard-head' },
        h('h1', { className: 'dshboard-h1' }, t('title')),
        h('span', { className: 'dshboard-sub' }, t('subtitle', { chats: model.chatCount, projects: model.projectCount })),
        h('span', { className: 'dshboard-spacer' }),
        h(
          'label',
          { className: 'dshboard-toggle' },
          h('input', {
            type: 'checkbox',
            checked: showArchived,
            onChange: (event) => setShowArchived(Boolean(event.target.checked)),
          }),
          t('showArchived'),
        ),
        tools,
        notice ? h('span', { className: 'dshboard-notice' }, notice) : null,
      );

      return h(
        'div',
        { className: 'dshboard-shell', 'data-compact': String(compact) },
        h('style', null, CSS),
        header,
        model.chatCount || workspace.items?.length
          ? h('div', { className: 'dshboard-cols' }, columns)
          : h('div', { className: 'dshboard-blank' }, t('emptyBoard')),
      );
    }

    function BoardIcon(props) {
      const size = Math.max(16, Number(props && props.size) || 18) + 2;
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          'aria-hidden': true,
          focusable: false,
          style: { display: 'block' },
        },
        h('rect', { x: 3, y: 4, width: 4, height: 16, rx: 2, fill: 'currentColor', opacity: 0.45 }),
        h('rect', { x: 9, y: 4, width: 4, height: 11, rx: 2, fill: 'currentColor', opacity: 0.7 }),
        h('rect', { x: 15, y: 4, width: 4, height: 14, rx: 2, fill: 'currentColor', opacity: 0.55 }),
      );
    }

    /**
     * Open a chat from the board.
     *
     * `openSession` is a no-op when that Session is already the open one, so
     * the panel is brought forward explicitly; the Conversation then shows
     * whichever view tab it already had, which is Chat because the board is
     * never a Conversation view.
     */
    const HEADER_BTN_CSS = [
      // This entry point sits in the chat header's leading cell, which begins at
      // the header's 20px padding. On macOS the collapsed-sidebar window chrome
      // (the traffic lights and the sidebar seat) owns that corner, so shift the
      // button past it by the same clearance the chat's own title row uses.
      '.dshboard-hbtn{position:relative;display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;margin-inline-start:max(0px,calc(var(--dsh-frame-leading-clearance,0px) - 20px));border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:1;cursor:pointer;white-space:nowrap}',
      '.dshboard-hbtn:hover{border-color:var(--dsw-alias-border-l2)}',
      '.dshboard-hbtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dshboard-hbtn svg{color:var(--dsw-alias-label-secondary);flex:none}',
      '.dshboard-hbtn:hover svg{color:var(--dsw-alias-brand-primary)}',
      '.dshboard-badge{position:absolute;top:-6px;right:-6px;min-width:16px;height:16px;padding:0 4px;box-sizing:border-box;border-radius:999px;font-size:10px;font-weight:600;line-height:16px;text-align:center;font-variant-numeric:tabular-nums;color:var(--dsw-alias-bg-base);background:var(--dsw-alias-state-success-primary)}',
      '.dshboard-badge[data-tone="wait"]{background:var(--dsw-alias-state-warn-primary)}',
    ].join('');

    /** Header entry point: opens the board as the main panel, badged with unseen activity. */
    function BoardHeaderButton(props) {
      const t = typeof props.tx === 'function' ? props.tx : (key) => key;

      const useSessions = typeof props.useSessions === 'function' ? props.useSessions : null;
      const useSessionStatus = typeof props.useSessionStatus === 'function' ? props.useSessionStatus : null;
      const usePanelInfo = typeof props.usePanelInfo === 'function' ? props.usePanelInfo : null;

      const byId = (useSessions ? useSessions((state) => (state && state.byId) || EMPTY) : null) || EMPTY;
      const statuses = (useSessionStatus ? useSessionStatus((state) => state) : null) || EMPTY_MAP;
      const onBoard = usePanelInfo ? Boolean(usePanelInfo((info) => info && info.activePanelId === 'board')) : false;

      const currentId = React.useMemo(() => {
        for (const key of Object.keys(byId)) {
          const row = byId[key];
          if (row && row.retainedBy && (row.retainedBy.mainView || 0) > 0) return key;
        }
        return null;
      }, [byId]);

      let waiting = 0;
      let finished = 0;
      if (statuses && typeof statuses.forEach === 'function') {
        statuses.forEach((status, id) => {
          if (!status || id === currentId) return;
          const row = byId[id];
          if (!row || row.blank === true) return;
          if (status.pendingInteraction) {
            waiting += 1;
            return;
          }
          if (status.completionUnread) finished += 1;
        });
      }

      const total = waiting + finished;
      const show = total > 0 && !onBoard;
      const detail = [];
      if (waiting) detail.push(t('badgeWaiting', { n: waiting }));
      if (finished) detail.push(t('badgeFinished', { n: finished }));
      const title = detail.length ? t('title') + ' — ' + detail.join(' · ') : t('title');

      return h(
        React.Fragment,
        null,
        h('style', null, HEADER_BTN_CSS),
        h(
          'button',
          {
            type: 'button',
            className: 'dshboard-hbtn',
            title,
            'aria-label': title,
            onClick: () => props.openBoard && props.openBoard(),
          },
          h(BoardIcon, { size: 18 }),
          h('span', null, t('title')),
          show
            ? h(
                'span',
                {
                  className: 'dshboard-badge',
                  'data-tone': waiting ? 'wait' : 'done',
                  'aria-hidden': true,
                },
                total > 99 ? '99+' : String(total),
              )
            : null,
        ),
      );
    }

    function createMenuStore() {
      let value = null;
      const listeners = new Set();
      const publish = () => {
        for (const listener of listeners) listener();
      };
      return {
        getSnapshot: () => value,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        open: (next) => {
          value = next;
          publish();
        },
        close: () => {
          if (value === null) return;
          value = null;
          publish();
        },
      };
    }

    const CRUMB_CSS = [
      '.dshboard-crumb{order:-1;display:inline-flex;align-items:center;gap:4px;min-width:0;max-width:100%}',
      '.dshboard-crumbBtn{display:inline-flex;align-items:center;gap:4px;border:none;background:transparent;padding:4px 6px;border-radius:6px;font:inherit;font-size:14px;line-height:20px;color:var(--dsw-alias-label-tertiary);cursor:pointer;max-width:220px;min-width:0}',
      '.dshboard-crumbBtn:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary)}',
      '.dshboard-crumbBtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.dshboard-crumbLabel{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dshboard-crumbChev{order:1;display:inline-flex;align-items:center;justify-content:center;flex:none;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);padding:3px;margin-left:2px;border-radius:5px;cursor:pointer}',
      '.dshboard-crumbChev:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary)}',
      '.dshboard-crumbChev:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.dshboard-crumbSep{color:var(--dsw-alias-label-tertiary);opacity:.7;flex:none}',
    ].join('');

    function IconChevronDown() {
      return h(
        'svg',
        { width: 10, height: 10, viewBox: '0 0 10 10', fill: 'none', 'aria-hidden': true, focusable: false },
        h('path', {
          d: 'M2.5 3.75 5 6.25 7.5 3.75',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      );
    }

    function IconChevronRight() {
      return h(
        'svg',
        { width: 10, height: 10, viewBox: '0 0 10 10', fill: 'none', 'aria-hidden': true, focusable: false },
        h('path', {
          d: 'M3.75 2.5 6.25 5 3.75 7.5',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      );
    }

    const MENU_CSS = [
      '.dshboard-menu{position:fixed;z-index:2147483000;min-width:240px;max-width:320px;max-height:60vh;overflow-y:auto;padding:4px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay);box-shadow:0 12px 32px rgba(0,0,0,.28);color:var(--dsw-alias-label-primary);font-size:13px}',
      '.dshboard-menuHead{padding:6px 8px 4px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--dsw-alias-label-secondary);opacity:.8}',
      '.dshboard-menuItem{display:flex;align-items:center;gap:8px;width:100%;text-align:left;border:none;background:transparent;color:inherit;font:inherit;padding:6px 8px;border-radius:6px;cursor:pointer}',
      '.dshboard-menuItem:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-1))}',
      '.dshboard-menuItem:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.dshboard-menuItem[data-current="true"]{color:var(--dsw-alias-brand-primary)}',
      '.dshboard-menuItem[data-open="true"]{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-1))}',
      '.dshboard-menuCaret{display:inline-flex;flex:none;color:var(--dsw-alias-label-secondary)}',
      '.dshboard-flyout{position:fixed;z-index:2147483001;min-width:240px;max-width:340px;max-height:60vh;overflow-y:auto;padding:4px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay);box-shadow:0 12px 32px rgba(0,0,0,.28);color:var(--dsw-alias-label-primary);font-size:13px;display:flex;flex-direction:column;gap:1px}',
      '.dshboard-menuChild{padding-left:10px;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.dshboard-menuChild[data-current="true"]{color:var(--dsw-alias-brand-primary)}',
      '.dshboard-menuCreate{color:var(--dsw-alias-label-secondary);font-style:italic}',
      '.dshboard-menuCreate:hover{color:var(--dsw-alias-brand-primary)}',
      '.dshboard-menuLabel{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dshboard-menuHint{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary);opacity:.8}',
      '.dshboard-menuSep{height:1px;margin:4px 6px;background:var(--dsw-alias-border-l1)}',
    ].join('');

    function BoardLineage(props) {
      const t = typeof props.tx === 'function' ? props.tx : (key) => key;
      const sessionId = props.lineageSessionId;
      const displayTitle = props.displayTitle || t('untitled');

      const useSessions = typeof props.useSessions === 'function' ? props.useSessions : () => EMPTY;
      const useWorkspaces = typeof props.useWorkspaces === 'function' ? props.useWorkspaces : () => EMPTY_WS;
      const liveSessions = useSnapshot(props.sessionsSource);
      const liveWorkspaces = useSnapshot(props.workspacesSource);

      const byId = (typeof props.useSessions === 'function' ? useSessions((state) => (state && state.byId) || EMPTY) : null) || (liveSessions && liveSessions.byId) || EMPTY;
      const workspace = (typeof props.useWorkspaces === 'function' ? useWorkspaces((state) => state) : null) || liveWorkspaces || EMPTY_WS;
      const items = Array.isArray(workspace.items) ? workspace.items : [];

      const project = items.find((item) => item && Array.isArray(item.sessionIds) && item.sessionIds.includes(sessionId));
      const projectTitle = project ? String(project.title || project.path || '') : t('ungrouped');

      const anchor = (event) => {
        const rect = event && event.currentTarget ? event.currentTarget.getBoundingClientRect() : null;
        if (!rect) return null;
        return {
          x: Math.max(8, Math.min(rect.left, window.innerWidth - 300)),
          y: Math.min(rect.bottom + 6, window.innerHeight - 120),
        };
      };

      const projectItems = () => {
        const archived = new Set(Array.isArray(workspace.archivedSessionIds) ? workspace.archivedSessionIds : []);
        return items.map((item) => {
          const members = Array.isArray(item.sessionIds) ? item.sessionIds : [];
          const chats = members
            .map((id) => byId[id])
            .filter((row) => row && !archived.has(row.id))
            .map((row) => ({
              id: String(row.id),
              label: titleOf(row, t),
              hint: formatWhen(Number(row.updatedAt) || 0, Date.now(), t),
              current: row.id === sessionId,
              updatedAt: Number(row.updatedAt) || 0,
            }))
            .sort((a, b) => {
              if (a.current !== b.current) return a.current ? -1 : 1;
              return b.updatedAt - a.updatedAt;
            });
          return {
            id: String(item.workspaceId),
            label: String(item.title || item.path || ''),
            current: Boolean(project && item.workspaceId === project.workspaceId),
            children: chats,
            childPick: (id) => props.openChat(id),
            onCreate: () => props.startChat(String(item.workspaceId)),
            createLabel: t('newChat'),
          };
        });
      };

      const chatItems = () => {
        const members = project && Array.isArray(project.sessionIds) ? project.sessionIds : [sessionId];
        const archived = new Set(Array.isArray(workspace.archivedSessionIds) ? workspace.archivedSessionIds : []);
        return members
          .map((id) => byId[id])
          .filter((row) => row && !archived.has(row.id))
          .map((row) => ({
            id: String(row.id),
            label: titleOf(row, t),
            hint: formatWhen(Number(row.updatedAt) || 0, Date.now(), t),
            current: row.id === sessionId,
            updatedAt: Number(row.updatedAt) || 0,
          }))
          .sort((a, b) => {
            if (a.current !== b.current) return a.current ? -1 : 1;
            return b.updatedAt - a.updatedAt;
          });
      };

      const openProjectMenu = (event) => {
        const point = anchor(event);
        if (!point) return;
        props.menuStore.open({
          x: point.x,
          y: point.y,
          sections: [{ title: t('switchProject'), expandable: true, items: projectItems() }],
          onCreate: () => props.createProjectAndOpen(),
          createLabel: t('newProject'),
        });
      };

      const openChatMenu = (event) => {
        const point = anchor(event);
        if (!point) return;
        props.menuStore.open({
          x: point.x,
          y: point.y,
          sections: [{ title: t('switchChat'), items: chatItems(), onPick: (id) => props.openChat(id) }],
        });
      };

      return h(
        React.Fragment,
        null,
        h('style', null, CRUMB_CSS),
        h(
          'div',
          { className: 'dshboard-crumb' },
          h(
            'button',
            {
              type: 'button',
              className: 'dshboard-crumbBtn',
              title: t('switchProject'),
              onClick: openProjectMenu,
            },
            h('span', { className: 'dshboard-crumbLabel' }, projectTitle),
            h(IconChevronDown),
          ),
          h('span', { className: 'dshboard-crumbSep', 'aria-hidden': true }, '\u2192'),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dshboard-crumbChev',
            title: t('switchChat'),
            'aria-label': t('switchChat'),
            'aria-haspopup': 'menu',
            onClick: openChatMenu,
          },
          h(IconChevronDown),
        ),
      );
    }

    function BoardMenuOverlay(props) {
      const state = useSnapshot(props.menuStore);
      const [hover, setHover] = React.useState(null);

      React.useEffect(() => {
        setHover(null);
      }, [state]);

      React.useEffect(() => {
        if (!state) return undefined;
        const onPointerDown = (event) => {
          const target = event.target;
          if (target && typeof target.closest === 'function' && target.closest('.dshboard-menu, .dshboard-flyout')) return;
          props.menuStore.close();
        };
        const onKeyDown = (event) => {
          if (event.key === 'Escape') props.menuStore.close();
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown);
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true);
          document.removeEventListener('keydown', onKeyDown);
        };
      }, [state, props.menuStore]);

      if (!state) return null;

      const pick = (section, id) => {
        props.menuStore.close();
        if (section && typeof section.onPick === 'function') section.onPick(id);
      };

      const close = () => props.menuStore.close();

      const renderItem = (section, item) => {
        const children = Array.isArray(item.children) ? item.children : [];
        const canExpand = Boolean(section.expandable) && (children.length > 0 || typeof item.onCreate === 'function');
        const open = Boolean(hover && hover.id === item.id);

        const openAt = (event, nextOpen) => {
          if (!canExpand) return;
          if (nextOpen) {
            const rect = event && event.currentTarget ? event.currentTarget.getBoundingClientRect() : null;
            if (!rect) return;
            const width = 280;
            const left = rect.right + 6 + width > window.innerWidth - 8 ? Math.max(8, rect.left - width - 6) : rect.right + 6;
            const top = Math.max(8, Math.min(rect.top, window.innerHeight - 260));
            setHover({ id: item.id, left, top });
            return;
          }
          setHover(null);
        };

        return h(
          'button',
          {
            key: item.id,
            type: 'button',
            role: 'menuitem',
            className: 'dshboard-menuItem',
            'data-current': String(Boolean(item.current)),
            'data-open': String(open),
            'aria-expanded': canExpand ? String(open) : undefined,
            'aria-haspopup': canExpand ? 'menu' : undefined,
            onMouseEnter: canExpand ? (event) => openAt(event, true) : () => setHover(null),
            onClick: canExpand ? (event) => openAt(event, !open) : () => pick(section, item.id),
          },
          canExpand ? h('span', { className: 'dshboard-menuCaret', 'aria-hidden': true }, h(IconChevronRight)) : null,
          h('span', { className: 'dshboard-menuLabel' }, item.label),
          item.hint ? h('span', { className: 'dshboard-menuHint' }, item.hint) : null,
        );
      };

      const sections = Array.isArray(state.sections) ? state.sections : [];
      const flyoutOwner =
        hover && sections.map((section) => (section.items || []).find((item) => item.id === hover.id)).find(Boolean);

      const flyout = flyoutOwner
        ? h(
            'div',
            {
              className: 'dshboard-flyout',
              style: { left: hover.left + 'px', top: hover.top + 'px' },
              role: 'menu',
              onMouseLeave: () => setHover(null),
            },
            (flyoutOwner.children || []).map((child) =>
              h(
                'button',
                {
                  key: child.id,
                  type: 'button',
                  role: 'menuitem',
                  className: 'dshboard-menuItem dshboard-menuChild',
                  'data-current': String(Boolean(child.current)),
                  onClick: () => {
                    close();
                    if (typeof flyoutOwner.childPick === 'function') flyoutOwner.childPick(child.id);
                  },
                },
                h('span', { className: 'dshboard-menuLabel' }, child.label),
                child.hint ? h('span', { className: 'dshboard-menuHint' }, child.hint) : null,
              ),
            ),
            typeof flyoutOwner.onCreate === 'function'
              ? h(
                  React.Fragment,
                  null,
                  h('div', { className: 'dshboard-menuSep' }),
                  h(
                    'button',
                    {
                      type: 'button',
                      role: 'menuitem',
                      className: 'dshboard-menuItem dshboard-menuChild dshboard-menuCreate',
                      onClick: () => {
                        close();
                        flyoutOwner.onCreate();
                      },
                    },
                    h('span', { className: 'dshboard-menuLabel' }, flyoutOwner.createLabel || '+'),
                  ),
                )
              : null,
          )
        : null;

      return h(
        React.Fragment,
        null,
        h('style', null, MENU_CSS),
        h(
          'div',
          { className: 'dshboard-menu', style: { left: state.x + 'px', top: state.y + 'px' }, role: 'menu' },
          sections.map((section, index) =>
            h(
              'div',
              { key: (section.title || 'section') + index },
              index > 0 ? h('div', { className: 'dshboard-menuSep' }) : null,
              section.title ? h('div', { className: 'dshboard-menuHead' }, section.title) : null,
              (section.items || []).map((item) => renderItem(section, item)),
            ),
          ),
          state.onCreate
            ? h(
                React.Fragment,
                null,
                h('div', { className: 'dshboard-menuSep' }),
                h(
                  'button',
                  {
                    type: 'button',
                    role: 'menuitem',
                    className: 'dshboard-menuItem',
                    onClick: () => {
                      props.menuStore.close();
                      state.onCreate();
                    },
                  },
                  h('span', { className: 'dshboard-menuLabel' }, state.createLabel || 'New project'),
                ),
              )
            : null,
        ),
        flyout,
      );
    }

    function openWorkspace(ctx, workspaceId) {
      try {
        const ui = ctx.get('uiWorkspace');
        if (ui && typeof ui.openWorkspace === 'function') {
          const result = ui.openWorkspace(workspaceId);
          if (result && typeof result.catch === 'function') result.catch(() => {});
        }
      } catch (error) {
        console.warn('[dsh-board] openWorkspace failed', error);
      }
      try {
        const layout = ctx.get('layout');
        if (layout && typeof layout.selectPanel === 'function') layout.selectPanel('conversation');
      } catch (error) {
        console.warn('[dsh-board] selectPanel failed', error);
      }
    }

    function openChat(ctx, sessionId) {
      try {
        const ui = ctx.get('uiWorkspace');
        if (ui && typeof ui.openSession === 'function') ui.openSession(sessionId);
      } catch (error) {
        console.warn('[dsh-board] openSession failed', error);
      }
      try {
        const layout = ctx.get('layout');
        if (layout && typeof layout.selectPanel === 'function') layout.selectPanel('conversation');
      } catch (error) {
        console.warn('[dsh-board] selectPanel failed', error);
      }
    }

    function startChat(ctx, workspaceId) {
      const ui = ctx.get('uiWorkspace');
      if (!ui || typeof ui.startSession !== 'function') {
        throw new Error('Starting a chat is unavailable in this profile.');
      }
      ui.startSession(workspaceId);
    }

    async function createProject(ctx, t) {
      const ui = ctx.get('uiWorkspace');
      const workspaces = ctx.get('workspaces');
      if (!ui || typeof ui.pickDirectory !== 'function') {
        throw new Error(t('pickerUnavailable'));
      }
      const path = await ui.pickDirectory();
      if (!path) return null;
      if (!workspaces || typeof workspaces.create !== 'function') {
        throw new Error(t('createFailed'));
      }
      const view = await workspaces.create({ path });
      return view && view.workspaceId ? String(view.workspaceId) : null;
    }

    function searchSessionsOf(ctx) {
      const sessions = ctx.get('sessions');
      if (!sessions || typeof sessions.search !== 'function') return undefined;
      return async (term, signal) => {
        const result = await sessions.search(term, signal);
        if (!result || result.ok !== true) {
          throw new Error((result && result.error && result.error.message) || 'search failed');
        }
        return result.value;
      };
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const locale = ctx.get('locale');
        if (locale && typeof locale.register === 'function') {
          for (const id of Object.keys(DICTS)) {
            try {
              locale.register(NS, id, DICTS[id]);
            } catch (error) {
              console.warn('[dsh-board] locale registration skipped', id, error);
            }
          }
        }

        const t = makeT(locale);
        const search = searchSessionsOf(ctx);
        const sessionsSource = (() => {
          const sessions = ctx.get('sessions');
          return sessions && sessions.list ? sessions.list : undefined;
        })();
        const workspacesSource = (() => {
          const workspaces = ctx.get('workspaces');
          return workspaces && workspaces.list ? workspaces.list : undefined;
        })();
        const creditsSource = createCreditsSource(ctx);
        const menuStore = createMenuStore();

        const face = () => ({
          tx: t,
          sessionsSource,
          workspacesSource,
          openChat: (sessionId) => openChat(ctx, sessionId),
          startChat: (workspaceId) => startChat(ctx, workspaceId),
          createProject: () => createProject(ctx, t),
          searchSessions: search,
          creditsSource,
          menuStore,
          openWorkspace: (workspaceId) => openWorkspace(ctx, workspaceId),
          createProjectAndOpen: () =>
            createProject(ctx, t)
              .then((id) => {
                if (id) openWorkspace(ctx, id);
                return id;
              })
              .catch((error) => {
                console.warn('[dsh-board] create project failed', error);
                return null;
              }),
          openCredits: () => {
            try {
              const layout = ctx.get('layout');
              if (layout && typeof layout.selectPanel === 'function') layout.selectPanel('commandcode-panel');
            } catch (error) {
              console.warn('[dsh-board] openCredits failed', error);
            }
          },
          openBoard: () => {
            try {
              const layout = ctx.get('layout');
              if (layout && typeof layout.selectPanel === 'function') layout.selectPanel('board');
            } catch (error) {
              console.warn('[dsh-board] openBoard failed', error);
            }
          },
        });

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: 'board',
              order: 5,
              label: () => t('title'),
            },
            BoardIcon,
          ),
        );

        ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: 'board',
              locale: NS,
              inject: face,
            },
            BoardPanel,
          ),
        );

        ctx.slots.inject('conversation.session.header.lineage', () => {
          // A single slot accepts one registration per priority and throws for a
          // second one at the same priority. The shipped subagent plugin owns
          // priority 0 here, so claim -1; the lowest priority renders.
          try {
            return ctx.slots.register(
              {
                name: 'conversation.session.header.lineage',
                priority: -1,
                locale: NS,
                inject: face,
              },
              BoardLineage,
            );
          } catch (error) {
            console.warn('[dsh-board] lineage slot unavailable', error);
            return () => {};
          }
        });

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            {
              name: 'shell.overlay',
              id: 'board-menu',
              order: 100,
              inject: () => ({ menuStore }),
            },
            BoardMenuOverlay,
          ),
        );

        // The leading area is rendered even for a blank New Session, where the
        // whole title row (and with it every header action) is hidden.
        ctx.slots.inject('conversation.header.leading', () => {
          try {
            return ctx.slots.register(
              {
                name: 'conversation.header.leading',
                priority: -1,
                locale: NS,
                inject: face,
              },
              BoardHeaderButton,
            );
          } catch (error) {
            console.warn('[dsh-board] leading slot unavailable', error);
            return () => {};
          }
        });
      },
    };
  },
});
