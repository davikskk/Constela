(() => {
  'use strict';

  /* =====================================================================
   * Persistência: localStorage (principal) com cookies como alternativa.
   * O tema também é gravado em cookie.
   * ===================================================================== */
  const KEYS = { tasks: 'rotina.tarefas', folders: 'rotina.pastas', graph: 'rotina.grafo', theme: 'rotina.tema', ui: 'rotina.ui', v2: 'rotina.v2' };

  const hasLS = (() => {
    try { localStorage.setItem('__rotina', '1'); localStorage.removeItem('__rotina'); return true; }
    catch { return false; }
  })();

  function getCookie(name) {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/\./g, '\\.') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function setCookie(name, value) {
    document.cookie = `${name}=${encodeURIComponent(value)}; max-age=31536000; path=/; SameSite=Lax`;
  }

  const store = {
    get(key, fallback) {
      let raw = hasLS ? localStorage.getItem(key) : null;
      if (raw == null) raw = getCookie(key);
      if (raw == null) return fallback;
      try { return JSON.parse(raw); } catch { return fallback; }
    },
    set(key, value) {
      const raw = JSON.stringify(value);
      if (hasLS) { try { localStorage.setItem(key, raw); return; } catch { /* cota cheia: tenta cookie */ } }
      setCookie(key, raw);
    }
  };

  /* ===================== Utilidades ===================== */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isTyping = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

  function isoLocal(d) {
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 10);
  }
  const todayISO = () => isoLocal(new Date());
  function addDays(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoLocal(d); }
  function fmtDate(iso) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }

  const urgColor = (u, l = 50) => `hsl(${Math.round(130 * (1 - u))} 72% ${l}%)`;
  const urgLabel = (u) => (u >= 0.8 ? 'crítica' : u >= 0.6 ? 'alta' : u >= 0.35 ? 'média' : u > 0.1 ? 'baixa' : 'mínima');

  const TAG_RE = /(^|[\s(])#([\p{L}\p{N}_\-/]+)/gu;
  const WIKI_RE = /\[\[([^\[\]]+?)\]\]/g;
  function tagsOf(t) {
    const out = new Set();
    for (const m of `${t.title} ${t.desc}`.matchAll(TAG_RE)) out.add(m[2].toLowerCase());
    return [...out];
  }
  const wikiOf = (t) => [...t.desc.matchAll(WIKI_RE)].map((m) => m[1].trim()).filter(Boolean);

  const ICON = {
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5 10 17 19 7"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    cal: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    list: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>'
  };

  /* ===================== Dados ===================== */
  function normalizeTask(t) {
    if (!t || typeof t !== 'object' || !String(t.title || '').trim()) return null;
    return {
      id: String(t.id || uid()),
      title: String(t.title).trim().slice(0, 80),
      desc: String(t.desc || '').slice(0, 280),
      done: !!t.done,
      urgency: clamp(Number(t.urgency) || 0, 0, 1),
      date: /^\d{4}-\d{2}-\d{2}$/.test(t.date || '') ? t.date : '',
      created: Number(t.created) || Date.now(),
      links: Array.isArray(t.links) ? t.links.map(String) : []
    };
  }

  let tasks = (store.get(KEYS.tasks, []) || []).map(normalizeTask).filter(Boolean);

  // Remove (uma única vez) as tarefas de exemplo criadas pela versão anterior.
  if (!store.get(KEYS.v2, false)) {
    const SEEDS = new Set([
      'Planejar a semana|Revisar prioridades e distribuir as tarefas. #planejamento',
      'Pagar contas|Luz e internet antes do vencimento. #casa #financas',
      'Estudar JavaScript|Capítulo sobre promises, depois aplicar em [[Projeto do site]]. #estudos',
      'Projeto do site|Montar o layout principal e revisar cores. #trabalho',
      'Academia|Treino de pernas + 20 min de esteira. #saude',
      'Comprar mantimentos|Arroz, café, frutas e legumes. #casa',
      'Ler 20 páginas|Continuar o livro da semana. #estudos #saude'
    ]);
    const removed = new Set(tasks.filter((t) => SEEDS.has(t.title + '|' + t.desc)).map((t) => t.id));
    if (removed.size) {
      tasks = tasks.filter((t) => !removed.has(t.id));
      tasks.forEach((t) => { t.links = t.links.filter((l) => !removed.has(l)); });
      store.set(KEYS.tasks, tasks);
    }
    store.set(KEYS.v2, true);
  }

  const ui = Object.assign({ filter: 'all', sort: 'urgency', view: 'list', gsOpen: false, gsSections: {}, folder: null }, store.get(KEYS.ui, {}));

  /* ===================== Pastas ===================== */
  // Cada pasta é um gerenciador independente: tarefas, conexões e grafo próprios.
  const FOLDER_COLORS = ['#a882ff', '#4f9cff', '#2fbf8f', '#f5a524', '#ff6b8a', '#e05cff', '#3cc8de', '#9aa0a6'];
  function normalizeFolder(f) {
    if (!f || typeof f !== 'object') return null;
    return {
      id: String(f.id || uid()),
      name: String(f.name || '').trim().slice(0, 40) || 'Pasta',
      color: /^#[0-9a-f]{6}$/i.test(f.color || '') ? f.color : FOLDER_COLORS[0],
      created: Number(f.created) || Date.now(),
      tasks: (Array.isArray(f.tasks) ? f.tasks : []).map(normalizeTask).filter(Boolean)
    };
  }
  const makeFolder = (name, color, list = []) => normalizeFolder({ id: uid(), name, color, created: Date.now(), tasks: list });

  let folders = (store.get(KEYS.folders, null) || []).map(normalizeFolder).filter(Boolean);
  if (!folders.length) {
    // Primeira vez com pastas: as tarefas já existentes vão para uma pasta padrão.
    folders = [makeFolder('Minhas tarefas', FOLDER_COLORS[0], tasks)];
    store.set(KEYS.folders, folders);
  }
  if (!folders.some((f) => f.id === ui.folder)) ui.folder = folders[0].id;
  const currentFolder = () => folders.find((f) => f.id === ui.folder) || folders[0];
  tasks = currentFolder().tasks;
  const uniqueFolderName = (name) => {
    let out = name, n = 2;
    while (folders.some((f) => f.name.toLowerCase() === out.toLowerCase())) out = `${name} (${n++})`;
    return out;
  };

  // Modo somente leitura: ativo ao abrir tarefas compartilhadas por outra pessoa.
  let readOnly = false;
  let ownTasks = null;
  const persist = () => {
    if (readOnly) return;
    currentFolder().tasks = tasks;
    store.set(KEYS.folders, folders);
  };
  const persistUI = () => store.set(KEYS.ui, ui);
  const byId = (id) => tasks.find((t) => t.id === id);
  const byTitle = (title) => tasks.find((t) => t.title.toLowerCase() === title.toLowerCase());

  /* ===================== Toast ===================== */
  const toastEl = $('#toast');
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    toastEl.style.animation = 'none'; void toastEl.offsetWidth; toastEl.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2200);
  }

  /* ===================== Popovers (tema / dados) ===================== */
  function closePopovers() {
    $$('.popover').forEach((p) => { p.hidden = true; });
    $$('[data-popover]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }
  $$('[data-popover]').forEach((btn) => {
    const pop = $('#' + btn.dataset.popover);
    btn.addEventListener('click', () => {
      const willOpen = pop.hidden;
      closePopovers();
      if (willOpen) { pop.hidden = false; btn.setAttribute('aria-expanded', 'true'); }
    });
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.popover-wrap')) closePopovers(); });

  /* ===================== Tema ===================== */
  const THEMES = ['claro', 'escuro', 'ceu', 'por-do-sol', 'noite', 'universo'];
  function applyTheme(theme) {
    if (!THEMES.includes(theme)) theme = 'escuro';
    document.documentElement.setAttribute('data-theme', theme);
    $$('[data-theme-btn]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeBtn === theme)));
    store.set(KEYS.theme, theme);
    setCookie(KEYS.theme, JSON.stringify(theme));
    graph.refreshColors();
  }
  $$('[data-theme-btn]').forEach((b) => b.addEventListener('click', () => { applyTheme(b.dataset.themeBtn); closePopovers(); }));

  /* ===================== Pesquisa (só aparece com o botão ativo) ===================== */
  const searchBar = $('#search-bar'), searchInput = $('#search'), searchToggle = $('#search-toggle');
  const getQuery = () => (searchBar.hidden ? '' : searchInput.value.trim().toLowerCase());

  function onSearch() { renderList(); graph.rebuild(); }
  function setSearchOpen(open) {
    searchBar.hidden = !open;
    searchToggle.setAttribute('aria-pressed', String(open));
    if (open) searchInput.focus();
    else if (searchInput.value) { searchInput.value = ''; onSearch(); }
    else onSearch();
  }
  function setSearch(q) {
    searchInput.value = q;
    if (searchBar.hidden) setSearchOpen(true); else onSearch();
  }
  searchToggle.addEventListener('click', () => setSearchOpen(searchBar.hidden));
  $('#search-close').addEventListener('click', () => setSearchOpen(false));
  searchInput.addEventListener('input', onSearch);
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); setSearchOpen(false); searchToggle.focus(); } });

  function matchesSearch(t, q) {
    if (!q) return true;
    if (q.startsWith('#')) return tagsOf(t).some((tag) => ('#' + tag).startsWith(q));
    return t.title.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q) || tagsOf(t).some((tag) => tag.includes(q));
  }

  /* ===================== Modal: criar / editar ===================== */
  const modal = $('#task-modal');
  const form = $('#task-form');
  const fTitle = $('#f-title'), fDesc = $('#f-desc'), fDate = $('#f-date'), fUrg = $('#f-urg'), fUrgOut = $('#f-urg-out');
  const fLinks = $('#f-links'), fLinkSelect = $('#f-link-select');
  let editingId = null;
  let formLinks = new Set();

  function updateUrgOut() {
    const u = Number(fUrg.value);
    fUrgOut.textContent = u.toFixed(2);
    fUrgOut.style.color = urgColor(u, 45);
  }
  fUrg.addEventListener('input', updateUrgOut);

  function renderLinkPicker() {
    fLinks.innerHTML = [...formLinks].map((id) => {
      const t = byId(id);
      return t ? `<span class="chip"><span>${esc(t.title)}</span><button type="button" data-unlink="${esc(id)}" aria-label="Remover conexão">×</button></span>` : '';
    }).join('');
    const others = tasks.filter((t) => t.id !== editingId && !formLinks.has(t.id))
      .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
    fLinkSelect.innerHTML = `<option value="">+ Conectar a uma tarefa…</option>` +
      others.map((t) => `<option value="${esc(t.id)}">${esc(t.title)}</option>`).join('');
    // Sem outras tarefas não há o que conectar: esconde o campo.
    $('#links-field').hidden = !others.length && !formLinks.size;
    fLinkSelect.hidden = !others.length;
  }
  fLinkSelect.addEventListener('change', () => {
    if (fLinkSelect.value) formLinks.add(fLinkSelect.value);
    renderLinkPicker();
  });
  fLinks.addEventListener('click', (e) => {
    const b = e.target.closest('[data-unlink]');
    if (b) { formLinks.delete(b.dataset.unlink); renderLinkPicker(); }
  });

  function openModal(id = null, preset = {}) {
    closePopovers();
    if (readOnly) return;
    const t = id ? byId(id) : null;
    editingId = t ? t.id : null;
    form.reset();
    fTitle.setCustomValidity('');
    fTitle.value = t ? t.title : (preset.title || '');
    fDesc.value = t ? t.desc : '';
    fDate.value = t ? t.date : todayISO();
    fUrg.value = t ? t.urgency : 0.5;
    formLinks = new Set(t ? t.links.filter(byId) : []);
    $('#form-title').textContent = t ? 'Editar tarefa' : 'Nova tarefa';
    $('#submit-btn').textContent = t ? 'Salvar' : 'Adicionar';
    $('#delete-in-modal').hidden = !t;
    // Seletor de pasta (só aparece quando existe mais de uma)
    const fFolder = $('#f-folder');
    fFolder.innerHTML = folders.map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('');
    fFolder.value = currentFolder().id;
    $('#folder-field').hidden = folders.length < 2;
    updateUrgOut();
    renderLinkPicker();
    if (!modal.open) modal.showModal();
    requestAnimationFrame(() => fTitle.focus());
  }
  function closeModal() { if (modal.open) modal.close(); }
  modal.addEventListener('close', () => { editingId = null; });
  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.closest('[data-close]')) closeModal(); // clique fora ou "Cancelar"
  });
  $('#delete-in-modal').addEventListener('click', () => { if (editingId && deleteTask(editingId)) closeModal(); });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = fTitle.value.trim();
    if (!title) { fTitle.focus(); return; }
    const target = folders.find((f) => f.id === $('#f-folder').value) || currentFolder();
    const moving = target !== currentFolder();
    const dup = (moving ? target.tasks : tasks).find((t) => t.title.toLowerCase() === title.toLowerCase());
    if (dup && dup.id !== editingId) {
      fTitle.setCustomValidity(`Já existe uma tarefa com esse título${moving ? ` em “${target.name}”` : ''}.`);
      fTitle.reportValidity();
      return;
    }
    // Conexões só valem dentro da mesma pasta.
    const data = { title, desc: fDesc.value.trim(), date: fDate.value, urgency: Number(fUrg.value), links: moving ? [] : [...formLinks] };
    if (moving) {
      const wasEditing = !!editingId;
      const t = wasEditing ? byId(editingId) : normalizeTask({ id: uid(), done: false, created: Date.now(), title });
      Object.assign(t, data);
      tasks = tasks.filter((x) => x.id !== t.id);
      tasks.forEach((x) => { x.links = x.links.filter((l) => l !== t.id); });
      target.tasks.push(t);
      persist(); // salva a pasta atual e a de destino (ambas estão em "folders")
      closeModal();
      renderAll();
      toast(`${wasEditing ? 'Tarefa movida' : 'Tarefa criada'} em “${target.name}”`);
      return;
    }
    let id;
    if (editingId) {
      const t = byId(editingId);
      const oldTitle = t.title;
      Object.assign(t, data);
      // Renomeou? Atualiza os [[links]] das outras tarefas, como o Obsidian faz.
      if (oldTitle !== title) {
        const re = new RegExp(`\\[\\[${oldTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\]`, 'gi');
        tasks.forEach((o) => { o.desc = o.desc.replace(re, `[[${title}]]`); });
      }
      id = t.id;
      toast('Tarefa atualizada');
    } else {
      const t = normalizeTask({ ...data, id: uid(), done: false, created: Date.now() });
      tasks.push(t);
      id = t.id;
      toast('Tarefa criada');
    }
    persist();
    closeModal();
    renderAll();
    flashTask(id);
  });
  fTitle.addEventListener('input', () => fTitle.setCustomValidity(''));

  function deleteTask(id) {
    if (readOnly) return false;
    const t = byId(id);
    if (!t || !confirm(`Excluir a tarefa "${t.title}"?`)) return false;
    tasks = tasks.filter((x) => x.id !== id);
    tasks.forEach((x) => { x.links = x.links.filter((l) => l !== id); });
    persist(); renderAll();
    toast('Tarefa excluída');
    return true;
  }

  // Qualquer botão "Nova tarefa"
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="new"]')) openModal();
    else if (e.target.closest('[data-act="share"]')) openShare();
  });

  /* ===================== Pastas: interface ===================== */
  const folderModal = $('#folder-modal');
  let editingFolderId = null;
  const folderIcon = (c) => `<svg class="folder-ico" viewBox="0 0 24 24" style="color:${c}"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" fill="currentColor" fill-opacity=".28"/></svg>`;
  const folderTasks = (f) => (f === currentFolder() && !readOnly ? tasks : f.tasks);

  function renderFolderUI() {
    const cur = currentFolder();
    $('#folder-current').innerHTML = `${folderIcon(cur.color)}<span class="folder-name">${esc(cur.name)}</span>`;
    if (!readOnly) $('#graph-folder').innerHTML = `<i style="background:${cur.color}"></i>${esc(cur.name)}`;
    $('#folder-list').innerHTML = folders.map((f) => {
      const list = folderTasks(f);
      const pending = list.filter((t) => !t.done).length;
      const info = pending ? `${pending} pendente${pending === 1 ? '' : 's'}` : list.length ? 'tudo feito' : 'vazia';
      return `<div class="folder-item${f === cur ? ' active' : ''}">
          <button type="button" class="folder-pick" data-folder="${esc(f.id)}">${folderIcon(f.color)}<span>${esc(f.name)}</span><small>${info}</small></button>
          <button type="button" class="icon-btn" data-folder-edit="${esc(f.id)}" title="Editar pasta" aria-label="Editar pasta ${esc(f.name)}">${ICON.edit}</button>
        </div>`;
    }).join('');
  }

  function switchFolder(id) {
    const f = folders.find((x) => x.id === id);
    closePopovers();
    if (!f || f === currentFolder()) return;
    currentFolder().tasks = tasks;
    ui.folder = f.id;
    persistUI();
    tasks = f.tasks;
    renderAll();
    graph.warmup();
  }

  $('#folder-list').addEventListener('click', (e) => {
    const edit = e.target.closest('[data-folder-edit]');
    if (edit) { openFolderModal(edit.dataset.folderEdit); return; }
    const pick = e.target.closest('[data-folder]');
    if (pick) switchFolder(pick.dataset.folder);
  });
  $('#new-folder-btn').addEventListener('click', () => openFolderModal());

  function openFolderModal(id = null) {
    closePopovers();
    const f = id ? folders.find((x) => x.id === id) : null;
    editingFolderId = f ? f.id : null;
    const name = $('#fo-name');
    name.value = f ? f.name : '';
    name.setCustomValidity('');
    const color = f ? f.color : FOLDER_COLORS[folders.length % FOLDER_COLORS.length];
    $('#fo-colors').innerHTML = FOLDER_COLORS.map((c) =>
      `<label class="color-dot" style="--c:${c}"><input type="radio" name="fo-color" value="${c}" ${c === color ? 'checked' : ''} aria-label="Cor ${c}"><i></i></label>`).join('');
    $('#folder-title').textContent = f ? 'Editar pasta' : 'Nova pasta';
    $('#fo-submit').textContent = f ? 'Salvar' : 'Criar pasta';
    $('#fo-delete').hidden = !f || folders.length < 2;
    $('#fo-suggest').hidden = !!f;
    folderModal.showModal();
    requestAnimationFrame(() => name.focus());
  }
  folderModal.addEventListener('click', (e) => {
    if (e.target === folderModal || e.target.closest('[data-close]')) { folderModal.close(); return; }
    const s = e.target.closest('[data-suggest]');
    if (s) { $('#fo-name').value = s.dataset.suggest; $('#fo-name').setCustomValidity(''); $('#fo-name').focus(); }
  });
  $('#fo-name').addEventListener('input', (e) => e.target.setCustomValidity(''));

  $('#folder-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#fo-name');
    const name = input.value.trim().slice(0, 40);
    if (!name) return;
    if (folders.some((f) => f.name.toLowerCase() === name.toLowerCase() && f.id !== editingFolderId)) {
      input.setCustomValidity('Já existe uma pasta com esse nome.');
      input.reportValidity();
      return;
    }
    const color = ($('input[name="fo-color"]:checked') || {}).value || FOLDER_COLORS[0];
    folderModal.close();
    if (editingFolderId) {
      Object.assign(folders.find((f) => f.id === editingFolderId), { name, color });
      persist();
      renderFolderUI();
      toast('Pasta atualizada');
    } else {
      const nf = makeFolder(name, color);
      folders.push(nf);
      persist();
      switchFolder(nf.id);
      toast(`Pasta “${name}” criada`);
    }
  });

  $('#fo-delete').addEventListener('click', () => {
    const f = folders.find((x) => x.id === editingFolderId);
    if (!f || folders.length < 2) return;
    const n = folderTasks(f).length;
    if (!confirm(`Excluir a pasta “${f.name}”${n ? ` e suas ${n} tarefa${n === 1 ? '' : 's'}` : ''}? Isso não pode ser desfeito.`)) return;
    const wasCurrent = f === currentFolder();
    if (!wasCurrent) currentFolder().tasks = tasks;
    folders = folders.filter((x) => x !== f);
    if (wasCurrent) { ui.folder = folders[0].id; tasks = folders[0].tasks; persistUI(); }
    store.set(KEYS.folders, folders);
    folderModal.close();
    renderAll();
    graph.warmup();
    toast('Pasta excluída');
  });

  /* ===================== Lista ===================== */
  const listEl = $('#task-list');
  const sortSel = $('#list-sort');
  const layout = $('.layout');

  function renderDesc(desc) {
    return esc(desc)
      .replace(/\[\[([^\[\]]+?)\]\]/g, (_, name) => {
        const target = byTitle(name.trim());
        return `<span class="wikilink${target ? '' : ' unresolved'}" data-wiki="${name.trim()}">${name.trim()}</span>`;
      })
      .replace(TAG_RE, (_, pre, tag) => `${pre}<span class="tag" data-tag="${tag.toLowerCase()}">#${tag}</span>`);
  }

  function dateBadge(t) {
    if (!t.date) return '';
    const today = todayISO();
    let cls = '', label = fmtDate(t.date);
    if (!t.done && t.date < today) { cls = 'overdue'; label += ' · atrasada'; }
    else if (t.date === today) { cls = 'today'; label = 'Hoje'; }
    else if (t.date === addDays(today, 1)) label = 'Amanhã';
    return `<span class="date-badge ${cls}">${ICON.cal}${label}</span>`;
  }

  function degreeOf(t) {
    const set = new Set(t.links.filter(byId));
    wikiOf(t).forEach((w) => { const x = byTitle(w); if (x && x.id !== t.id) set.add(x.id); });
    tasks.forEach((o) => { if (o.id !== t.id && (o.links.includes(t.id) || wikiOf(o).some((w) => w.toLowerCase() === t.title.toLowerCase()))) set.add(o.id); });
    return set.size;
  }

  function renderList() {
    const q = getQuery();
    const visible = tasks
      .filter((t) => (ui.filter === 'pending' ? !t.done : ui.filter === 'done' ? t.done : true))
      .filter((t) => matchesSearch(t, q))
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        if (ui.sort === 'date') {
          if (a.date !== b.date) return !a.date ? 1 : !b.date ? -1 : a.date.localeCompare(b.date);
          return b.urgency - a.urgency;
        }
        if (ui.sort === 'created') return b.created - a.created;
        return b.urgency - a.urgency || (a.date || '9').localeCompare(b.date || '9');
      });

    if (!tasks.length) {
      listEl.innerHTML = `<li class="empty-list">${ICON.list}<strong>Nenhuma tarefa ainda</strong>
        <p>Crie sua primeira tarefa para começar a organizar a rotina.</p>
        <button type="button" class="btn primary" data-act="new">${ICON.plus}Criar tarefa</button></li>`;
    } else if (!visible.length) {
      listEl.innerHTML = `<li class="empty-list"><p>Nenhuma tarefa ${q ? 'encontrada para essa pesquisa' : ui.filter === 'done' ? 'concluída ainda' : 'pendente — tudo em dia!'}</p></li>`;
    } else {
      listEl.innerHTML = visible.map((t) => {
        const deg = degreeOf(t);
        return `
        <li class="task${t.done ? ' done' : ''}" data-id="${esc(t.id)}">
          <button type="button" class="check" data-act="toggle" aria-pressed="${t.done}" aria-label="${t.done ? 'Marcar como pendente' : 'Marcar como feita'}">${ICON.check}</button>
          <div class="task-body" data-act="edit">
            <div class="task-title">${esc(t.title)}</div>
            ${t.desc ? `<p class="task-desc">${renderDesc(t.desc)}</p>` : ''}
            <div class="task-meta">
              <span class="urg-badge" title="Urgência ${urgLabel(t.urgency)}"><span class="urg-bar"><i style="width:${Math.max(4, t.urgency * 100)}%;background:${urgColor(t.urgency)}"></i></span>${t.urgency.toFixed(2)}</span>
              ${dateBadge(t)}
              ${deg ? `<span class="links-badge" title="Conexões">${ICON.link}${deg}</span>` : ''}
            </div>
          </div>
          <div class="task-actions">
            <button type="button" class="icon-btn" data-act="edit" title="Editar" aria-label="Editar">${ICON.edit}</button>
            <button type="button" class="icon-btn danger" data-act="delete" title="Excluir" aria-label="Excluir">${ICON.trash}</button>
          </div>
        </li>`;
      }).join('');
    }

    const pending = tasks.filter((t) => !t.done).length;
    const done = tasks.length - pending;
    const overdue = tasks.filter((t) => !t.done && t.date && t.date < todayISO()).length;
    $('#stats').textContent = tasks.length
      ? `${pending} pendente${pending === 1 ? '' : 's'} · ${done} feita${done === 1 ? '' : 's'}${overdue ? ` · ${overdue} atrasada${overdue === 1 ? '' : 's'}` : ''}`
      : '';
    const navBtn = $('[data-view-btn="list"] span');
    navBtn.innerHTML = `Tarefas${pending ? ` <b class="count">${pending}</b>` : ''}`;
  }

  function flashTask(id) {
    const li = listEl.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!li) return;
    li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    li.classList.remove('flash'); void li.offsetWidth; li.classList.add('flash');
  }

  listEl.addEventListener('click', (e) => {
    const wiki = e.target.closest('[data-wiki]');
    if (wiki) {
      const t = byTitle(wiki.dataset.wiki);
      if (t) { flashTask(t.id); graph.focusNode('t:' + t.id); }
      else openModal(null, { title: wiki.dataset.wiki }); // link para tarefa inexistente: cria
      return;
    }
    const tag = e.target.closest('[data-tag]');
    if (tag) { setSearch('#' + tag.dataset.tag); return; }
    const btn = e.target.closest('[data-act]');
    const li = e.target.closest('.task');
    if (!btn || !li) return;
    const t = byId(li.dataset.id);
    if (!t) return;
    if (readOnly) return;
    if (btn.dataset.act === 'toggle') {
      t.done = !t.done;
      persist(); renderAll();
      toast(t.done ? 'Tarefa concluída ✓' : 'Tarefa reaberta');
    } else if (btn.dataset.act === 'edit') {
      openModal(t.id);
    } else if (btn.dataset.act === 'delete') {
      deleteTask(t.id);
    }
  });
  // Passar o mouse numa tarefa destaca o nó no grafo.
  listEl.addEventListener('mouseover', (e) => {
    const li = e.target.closest('.task');
    graph.setExternalHover(li ? 't:' + li.dataset.id : null);
  });
  listEl.addEventListener('mouseleave', () => graph.setExternalHover(null));

  sortSel.value = ui.sort;
  sortSel.addEventListener('change', () => { ui.sort = sortSel.value; persistUI(); renderList(); });
  $$('.segmented [data-filter]').forEach((b) => {
    b.classList.toggle('active', b.dataset.filter === ui.filter);
    b.addEventListener('click', () => {
      ui.filter = b.dataset.filter; persistUI();
      $$('.segmented [data-filter]').forEach((x) => x.classList.toggle('active', x === b));
      renderList();
    });
  });

  /* ===================== Abas (telas pequenas) ===================== */
  function setView(v) {
    ui.view = v === 'graph' ? 'graph' : 'list';
    layout.dataset.view = ui.view;
    $$('[data-view-btn]').forEach((b) => {
      b.classList.toggle('active', b.dataset.viewBtn === ui.view);
      b.setAttribute('aria-pressed', String(b.dataset.viewBtn === ui.view));
    });
    persistUI();
  }
  $$('[data-view-btn]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.viewBtn)));

  /* ===================== Exportar / Importar ===================== */
  $('#export-btn').addEventListener('click', () => {
    closePopovers();
    persist(); // garante que a pasta aberta está sincronizada
    const blob = new Blob([JSON.stringify({ app: 'constela', version: 3, exported: new Date().toISOString(), folders }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `constela-backup-${todayISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Backup exportado');
  });
  $('#import-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    closePopovers();
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      if (json && Array.isArray(json.folders)) {
        // Backup completo (todas as pastas)
        const list = json.folders.map(normalizeFolder).filter(Boolean);
        if (!list.length) throw new Error('vazio');
        const total = list.reduce((s, f) => s + f.tasks.length, 0);
        if (!confirm(`Importar ${list.length} pasta(s) com ${total} tarefa(s)? Todas as pastas atuais serão substituídas.`)) return;
        folders = list;
        ui.folder = folders[0].id;
        persistUI();
        tasks = folders[0].tasks;
        store.set(KEYS.folders, folders);
        renderAll(); graph.warmup();
        toast(`${list.length} pasta(s) importada(s)`);
        return;
      }
      // Backup antigo (lista única): entra na pasta aberta
      const list = (Array.isArray(json) ? json : json.tasks || []).map(normalizeTask).filter(Boolean);
      if (!list.length) throw new Error('vazio');
      if (tasks.length && !confirm(`Importar ${list.length} tarefa(s) para “${currentFolder().name}”? As tarefas atuais dessa pasta serão substituídas.`)) return;
      tasks = list;
      persist(); renderAll(); graph.warmup();
      toast(`${list.length} tarefa(s) importada(s)`);
    } catch {
      alert('Arquivo inválido. Use um backup exportado por este site.');
    }
  });

  /* =====================================================================
   * Compartilhar: as tarefas viram um código compacto (JSON enxuto,
   * comprimido com deflate e em base64url) que vai no próprio link (#c=…).
   * Funciona em hospedagem estática (GitHub Pages): nada vai para servidor,
   * e o "#" nem é enviado ao GitHub.
   * ===================================================================== */
  const canZip = 'CompressionStream' in window && 'DecompressionStream' in window;
  const pipe = async (bytes, stream) =>
    new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  function b64urlEncode(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlDecode(str) {
    const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  }

  async function encodeShare(list, name) {
    // Formato v1: n = nome da pasta; t = [título, descrição, feita, urgência×100, AAAAMMDD, [índices dos links]]
    const idx = new Map(list.map((t, i) => [t.id, i]));
    const payload = {
      v: 1,
      n: name,
      t: list.map((t) => {
        const row = [t.title, t.desc, t.done ? 1 : 0, Math.round(t.urgency * 100), t.date.replace(/-/g, '')];
        const links = t.links.map((l) => idx.get(l)).filter((i) => i != null);
        if (links.length) row.push(links);
        return row;
      })
    };
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    return canZip
      ? 'z' + b64urlEncode(await pipe(bytes, new CompressionStream('deflate-raw')))
      : 'j' + b64urlEncode(bytes);
  }

  async function decodeShare(input) {
    let code = String(input).trim();
    const m = code.match(/[#&?]c=([A-Za-z0-9_-]+)/);
    if (m) code = m[1];
    code = code.replace(/\s+/g, '');
    if (!/^[zj][A-Za-z0-9_-]{4,}$/.test(code)) throw new Error('Isso não parece um link ou código do Constela.');
    let bytes;
    try {
      bytes = b64urlDecode(code.slice(1));
      if (code[0] === 'z') {
        if (!canZip) throw new Error('old');
        bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
      }
    } catch (err) {
      throw new Error(err.message === 'old'
        ? 'Seu navegador é antigo demais para abrir este código. Atualize-o.'
        : 'O código está incompleto ou corrompido. Copie-o novamente.');
    }
    let data;
    try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { data = null; }
    if (!data || data.v !== 1 || !Array.isArray(data.t)) throw new Error('O código está incompleto ou corrompido.');
    const ids = data.t.map(() => uid());
    const now = Date.now();
    const list = data.t.map((r, i) => Array.isArray(r) && normalizeTask({
      id: ids[i], title: r[0], desc: r[1], done: r[2] === 1,
      urgency: (Number(r[3]) || 0) / 100,
      date: /^\d{8}$/.test(r[4] || '') ? `${r[4].slice(0, 4)}-${r[4].slice(4, 6)}-${r[4].slice(6)}` : '',
      created: now - i,
      links: Array.isArray(r[5]) ? r[5].map((j) => ids[j]).filter(Boolean) : []
    })).filter(Boolean);
    if (!list.length) throw new Error('Nenhuma tarefa encontrada nesse código.');
    return { list, name: String(data.n || '').trim().slice(0, 40) || 'Compartilhadas' };
  }

  const shareModal = $('#share-modal');
  const codeModal = $('#code-modal');
  [shareModal, codeModal].forEach((d) => d.addEventListener('click', (e) => {
    if (e.target === d || e.target.closest('[data-close]')) d.close();
  }));

  let shareInfo = null;
  async function refreshShare() {
    const list = $('#share-done').checked ? tasks : tasks.filter((t) => !t.done);
    const warn = $('#share-warn');
    if (!list.length) {
      shareInfo = null;
      $('#share-link').value = $('#share-code').value = '';
      $('#share-count').textContent = '0 tarefas';
      warn.textContent = 'Nenhuma tarefa para compartilhar com esse filtro.';
      warn.hidden = false;
      return;
    }
    const code = await encodeShare(list, currentFolder().name);
    const link = location.href.split('#')[0] + '#c=' + code;
    shareInfo = { link, n: list.length };
    $('#share-link').value = link;
    $('#share-code').value = code;
    $('#share-count').textContent = `${list.length} tarefa${list.length === 1 ? '' : 's'} · ${link.length.toLocaleString('pt-BR')} caracteres`;
    warn.textContent = 'O link ficou longo. Alguns apps de mensagem podem cortá-lo — se isso acontecer, envie o código.';
    warn.hidden = link.length < 4000;
  }

  async function openShare() {
    closePopovers();
    if (readOnly) return;
    if (!tasks.length) { toast('Crie tarefas antes de compartilhar'); return; }
    $('#share-title').textContent = `Compartilhar “${currentFolder().name}”`;
    await refreshShare();
    $('#native-share').hidden = !navigator.share;
    shareModal.showModal();
    $('#share-link').select();
  }
  $('#share-done').addEventListener('change', refreshShare);

  shareModal.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    const el = $('#' + b.dataset.copy);
    if (!el.value) return;
    let ok = false;
    try { await navigator.clipboard.writeText(el.value); ok = true; }
    catch { el.select(); ok = document.execCommand('copy'); }
    b.dataset.label = b.dataset.label || b.textContent;
    b.textContent = ok ? 'Copiado ✓' : 'Selecione e copie';
    b.classList.toggle('copied', ok);
    clearTimeout(b._t);
    b._t = setTimeout(() => { b.textContent = b.dataset.label; b.classList.remove('copied'); }, 1600);
  });
  $('#native-share').addEventListener('click', async () => {
    if (!shareInfo) return;
    try {
      await navigator.share({ title: 'Constela', text: `${shareInfo.n} tarefa(s) compartilhada(s) pelo Constela`, url: shareInfo.link });
    } catch { /* cancelado pelo usuário */ }
  });

  // Abrir link ou código colado
  $('#open-code-btn').addEventListener('click', () => {
    closePopovers();
    $('#code-input').value = '';
    $('#code-error').hidden = true;
    codeModal.showModal();
  });
  $('#code-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const shared = await decodeShare($('#code-input').value);
      codeModal.close();
      enterShared(shared);
    } catch (err) {
      $('#code-error').textContent = err.message;
      $('#code-error').hidden = false;
    }
  });

  // Modo de visualização: mostra as tarefas recebidas sem tocar nas suas.
  let sharedName = '';
  function enterShared({ list, name }) {
    if (!readOnly) ownTasks = tasks;
    readOnly = true;
    tasks = list;
    sharedName = name;
    closeModal();
    document.body.classList.add('readonly');
    $('#shared-text').innerHTML = `Visualizando a pasta <strong>“${esc(name)}”</strong> · ${list.length} tarefa${list.length === 1 ? '' : 's'} — somente leitura`;
    $('#graph-folder').innerHTML = `<i style="background:var(--accent)"></i>${esc(name)}`;
    $('#shared-banner').hidden = false;
    renderAll();
    graph.warmup();
  }
  function exitShared(nextTasks) {
    if (!readOnly) return;
    tasks = nextTasks || ownTasks;
    ownTasks = null;
    readOnly = false;
    document.body.classList.remove('readonly');
    $('#shared-banner').hidden = true;
    if (/[#&]c=/.test(location.hash)) history.replaceState(null, '', location.href.split('#')[0]);
    persist();
    renderAll();
    graph.warmup();
  }
  $('#shared-exit').addEventListener('click', () => exitShared());
  $('#shared-save').addEventListener('click', () => {
    const incoming = tasks;
    const name = sharedName;
    exitShared();
    // Salva numa pasta com o mesmo nome (mesclando) ou cria uma nova.
    let target = folders.find((f) => f.name.toLowerCase() === name.toLowerCase());
    const created = !target;
    if (!target) {
      target = makeFolder(name, FOLDER_COLORS[folders.length % FOLDER_COLORS.length]);
      folders.push(target);
    }
    const own = folderTasks(target);
    const key = (t) => t.title.toLowerCase() + '|' + t.desc;
    const ownByKey = new Map(own.map((t) => [key(t), t.id]));
    // Tarefas idênticas às que já existem não são duplicadas; links para elas são reaproveitados.
    const remap = new Map();
    incoming.forEach((t) => { if (ownByKey.has(key(t))) remap.set(t.id, ownByKey.get(key(t))); });
    const fresh = incoming.filter((t) => !remap.has(t.id));
    const titles = new Set(own.map((t) => t.title.toLowerCase()));
    fresh.forEach((t) => {
      t.links = t.links.map((l) => remap.get(l) || l);
      if (titles.has(t.title.toLowerCase())) { // título repetido: ganha sufixo
        let n = 2;
        while (titles.has(`${t.title} (${n})`.toLowerCase())) n++;
        t.title = `${t.title} (${n})`;
      }
      titles.add(t.title.toLowerCase());
    });
    if (target === currentFolder()) tasks = own.concat(fresh);
    else target.tasks = own.concat(fresh);
    persist();
    if (target !== currentFolder()) switchFolder(target.id);
    else { renderAll(); graph.warmup(); }
    const n = fresh.length;
    toast(created
      ? `Pasta “${target.name}” criada com ${n} tarefa${n === 1 ? '' : 's'}`
      : n ? `${n} tarefa${n === 1 ? '' : 's'} adicionada${n === 1 ? '' : 's'} a “${target.name}”` : `“${target.name}” já tinha todas essas tarefas`);
  });

  async function openFromHash() {
    const m = location.hash.match(/[#&]c=([A-Za-z0-9_-]+)/);
    if (!m) return;
    try { enterShared(await decodeShare(m[1])); }
    catch (err) {
      toast('Link de compartilhamento inválido');
      history.replaceState(null, '', location.href.split('#')[0]);
    }
  }
  window.addEventListener('hashchange', openFromHash);

  /* ===================== Atalhos de teclado ===================== */
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(searchBar.hidden || document.activeElement !== searchInput); return; }
    if (document.querySelector('dialog[open]') || isTyping(document.activeElement) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openModal(); }
    else if (e.key === '/') { e.preventDefault(); setSearchOpen(true); }
    else if (e.key === 'Escape') closePopovers();
  });

  /* =====================================================================
   * Visualização de grafo — recriação do Graph View do Obsidian:
   * simulação de forças (repulsão, links, centro), zoom/pan, arrastar nós,
   * destaque de vizinhos ao passar o mouse, rótulos que somem ao afastar,
   * nós de tags, links inexistentes, órfãos, setas e card de exibição.
   * ===================================================================== */
  const graph = (() => {
    const DEFAULTS = {
      showTags: true, showDone: true, showUnresolved: false, showOrphans: true,
      colorUrgency: true, arrows: false,
      textFade: 0.7, nodeSize: 1, linkWidth: 1,
      center: 0.5, repel: 10, linkForce: 0.7, linkDistance: 120
    };
    const gs = Object.assign({}, DEFAULTS, store.get(KEYS.graph, {}));
    delete gs.search;
    const saveGS = () => store.set(KEYS.graph, gs);

    const stage = $('#graph-stage');
    const canvas = $('#graph');
    const ctx = canvas.getContext('2d');
    const tooltip = $('#graph-tooltip');
    const emptyEl = $('#graph-empty');
    const settingsEl = $('#graph-settings');
    const gsContent = $('#gs-content');
    const gsToggle = $('#gs-toggle');
    let W = 0, H = 0, dpr = 1, fitted = false;

    const view = { k: 1, tx: 0, ty: 0 };
    const sim = { nodes: [], edges: [], alpha: 1, alphaTarget: 0, alphaMin: 0.001, alphaDecay: 1 - Math.pow(0.001, 1 / 300) };
    const positions = new Map(); // preserva posições entre reconstruções
    let colors = {};
    let fontFamily = 'Inter, sans-serif';
    let dirty = true;

    const hover = { node: null, external: null, fade: 0, shown: null, neighbors: new Set(), active: false };

    /* ---------- Cores do tema ---------- */
    function refreshColors() {
      const cs = getComputedStyle(document.documentElement);
      const v = (n) => cs.getPropertyValue(n).trim();
      colors = { node: v('--graph-node'), line: v('--graph-line'), tag: v('--graph-tag'), ghost: v('--graph-ghost'), text: v('--graph-text'), accent: v('--graph-accent') };
      fontFamily = getComputedStyle(document.body).fontFamily;
      dirty = true;
    }

    /* ---------- Construção dos dados ---------- */
    function rebuild() {
      const q = getQuery();
      const nodes = new Map();
      const edges = [];
      const keys = new Set();
      const addEdge = (s, t) => {
        if (s === t) return;
        const k = s < t ? s + '|' + t : t + '|' + s;
        if (keys.has(k)) return;
        keys.add(k);
        edges.push({ s, t });
      };
      const visible = tasks.filter((t) => gs.showDone || !t.done);
      visible.forEach((t) => nodes.set('t:' + t.id, { id: 't:' + t.id, kind: 'task', task: t, label: t.title }));
      for (const t of visible) {
        const sid = 't:' + t.id;
        t.links.forEach((l) => { if (nodes.has('t:' + l)) addEdge(sid, 't:' + l); });
        for (const w of wikiOf(t)) {
          const target = byTitle(w);
          if (target) { if (nodes.has('t:' + target.id)) addEdge(sid, 't:' + target.id); }
          else if (gs.showUnresolved) {
            const gid = 'u:' + w.toLowerCase();
            if (!nodes.has(gid)) nodes.set(gid, { id: gid, kind: 'ghost', label: w });
            addEdge(sid, gid);
          }
        }
        if (gs.showTags) {
          for (const tag of tagsOf(t)) {
            const id = '#:' + tag;
            if (!nodes.has(id)) nodes.set(id, { id, kind: 'tag', label: '#' + tag });
            addEdge(sid, id);
          }
        }
      }

      // Mesma pesquisa da lista também filtra o grafo
      if (q) {
        for (const [id, n] of nodes) {
          const ok = n.kind === 'task' ? matchesSearch(n.task, q) : n.label.toLowerCase().includes(q.replace(/^#/, ''));
          if (!ok) nodes.delete(id);
        }
      }
      const live = edges.filter((e) => nodes.has(e.s) && nodes.has(e.t));
      const deg = new Map();
      live.forEach((e) => { deg.set(e.s, (deg.get(e.s) || 0) + 1); deg.set(e.t, (deg.get(e.t) || 0) + 1); });
      if (!gs.showOrphans) for (const id of [...nodes.keys()]) if (!deg.get(id)) nodes.delete(id);

      // Mantém posições anteriores; novos nós nascem perto de um vizinho.
      sim.nodes.forEach((n) => positions.set(n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy }));
      const list = [...nodes.values()];
      const neighborOf = new Map();
      live.forEach((e) => { neighborOf.set(e.s, e.t); neighborOf.set(e.t, e.s); });
      list.forEach((n, i) => {
        n.degree = deg.get(n.id) || 0;
        const p = positions.get(n.id);
        if (p) Object.assign(n, p);
        else {
          const nb = positions.get(neighborOf.get(n.id));
          if (nb) { n.x = nb.x + (Math.random() - 0.5) * 40; n.y = nb.y + (Math.random() - 0.5) * 40; }
          else { const r = 12 * Math.sqrt(0.5 + i), a = i * Math.PI * (3 - Math.sqrt(5)); n.x = r * Math.cos(a); n.y = r * Math.sin(a); }
          n.vx = 0; n.vy = 0;
        }
        n.fx = null; n.fy = null;
      });
      const map = new Map(list.map((n) => [n.id, n]));
      sim.nodes = list;
      sim.edges = live.filter((e) => map.has(e.s) && map.has(e.t)).map((e) => ({ source: map.get(e.s), target: map.get(e.t) }));
      if (hover.node && !map.has(hover.node.id)) hover.node = null;
      if (hover.shown && !map.has(hover.shown.id)) hover.shown = null;
      updateNeighbors();
      emptyEl.hidden = list.length > 0;
      $('#graph-empty-text').textContent = tasks.length
        ? 'Nenhum nó corresponde à pesquisa ou aos filtros'
        : 'Crie tarefas para vê-las conectadas aqui';
      reheat(0.8);
    }

    /* ---------- Simulação de forças (modelo do d3-force) ---------- */
    const radius = (n) => gs.nodeSize * (n.kind === 'task' ? 4.5 + 2.2 * Math.sqrt(n.degree) : 3.5 + 1.6 * Math.sqrt(n.degree));
    function reheat(a = 0.5) { sim.alpha = Math.max(sim.alpha, a); dirty = true; }

    function tick() {
      const { nodes, edges } = sim;
      const alpha = sim.alpha;
      const charge = -gs.repel * 30;

      // Repulsão entre todos os pares
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          let d2 = dx * dx + dy * dy;
          if (d2 > 1000000) continue;
          if (d2 === 0) { dx = (Math.random() - 0.5) * 1e-2; dy = (Math.random() - 0.5) * 1e-2; d2 = dx * dx + dy * dy; }
          d2 = Math.max(d2, 36);
          const w = (charge * alpha) / d2;
          a.vx += dx * w; a.vy += dy * w;
          b.vx -= dx * w; b.vy -= dy * w;
        }
      }
      // Molas dos links
      for (const e of edges) {
        const s = e.source, t = e.target;
        let dx = t.x + t.vx - s.x - s.vx, dy = t.y + t.vy - s.y - s.vy;
        let l = Math.sqrt(dx * dx + dy * dy) || 1e-3;
        const strength = gs.linkForce / Math.max(1, Math.min(s.degree, t.degree));
        l = ((l - gs.linkDistance) / l) * alpha * strength;
        dx *= l; dy *= l;
        const bias = s.degree / (s.degree + t.degree || 1);
        t.vx -= dx * bias; t.vy -= dy * bias;
        s.vx += dx * (1 - bias); s.vy += dy * (1 - bias);
      }
      // Força central + integração
      const cs = gs.center * 0.08;
      for (const n of nodes) {
        n.vx -= n.x * cs * alpha;
        n.vy -= n.y * cs * alpha;
        if (n.fx != null) { n.x = n.fx; n.y = n.fy; n.vx = 0; n.vy = 0; }
        else { n.vx *= 0.6; n.vy *= 0.6; n.x += n.vx; n.y += n.vy; }
      }
      sim.alpha += (sim.alphaTarget - sim.alpha) * sim.alphaDecay;
    }

    /* ---------- Destaque (hover) ---------- */
    function updateNeighbors() {
      const focus = hover.node || (hover.external && sim.nodes.find((n) => n.id === hover.external)) || null;
      if (focus) hover.shown = focus;
      hover.neighbors = new Set();
      if (hover.shown) sim.edges.forEach((e) => {
        if (e.source === hover.shown) hover.neighbors.add(e.target);
        if (e.target === hover.shown) hover.neighbors.add(e.source);
      });
      hover.active = !!focus;
      dirty = true;
    }

    /* ---------- Desenho ---------- */
    function nodeColor(n) {
      if (n.kind === 'tag') return colors.tag;
      if (n.kind === 'ghost') return colors.ghost;
      if (gs.colorUrgency) return urgColor(n.task.urgency, 55);
      return colors.node;
    }

    function strokeEdges(filter) {
      ctx.beginPath();
      for (const e of sim.edges) {
        if (!filter(e)) continue;
        ctx.moveTo(e.source.x, e.source.y);
        ctx.lineTo(e.target.x, e.target.y);
      }
      ctx.stroke();
    }

    function draw() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * view.tx, dpr * view.ty);

      const f = hover.fade;
      const focus = hover.shown;
      const nb = hover.neighbors;
      const isHi = (n) => focus && (n === focus || nb.has(n));
      const touches = (e) => focus && (e.source === focus || e.target === focus);
      const dim = 1 - 0.82 * f;

      // Links
      const lw = Math.max(gs.linkWidth, 0.6 / view.k);
      ctx.lineWidth = lw;
      ctx.strokeStyle = colors.line;
      ctx.globalAlpha = focus ? 1 - 0.75 * f : 1;
      strokeEdges((e) => !(f > 0 && touches(e)));
      if (gs.arrows) for (const e of sim.edges) if (!(f > 0 && touches(e))) drawArrow(e, colors.line, lw);

      if (focus && f > 0) {
        ctx.globalAlpha = f;
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = lw * 1.6;
        strokeEdges(touches);
        if (gs.arrows) for (const e of sim.edges) if (touches(e)) drawArrow(e, colors.accent, lw * 1.6);
        ctx.globalAlpha = 1 - f;
        ctx.strokeStyle = colors.line;
        ctx.lineWidth = lw;
        strokeEdges(touches);
      }

      // Nós
      for (const n of sim.nodes) {
        const r = radius(n);
        let col = nodeColor(n);
        const a = focus && !isHi(n) ? dim : 1;
        if (n === focus && f > 0.5) col = colors.accent;
        ctx.globalAlpha = a;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        if (n.kind === 'task' && n.task.done) {
          // Tarefa concluída: anel vazado
          ctx.globalAlpha = a * 0.28;
          ctx.fill();
          ctx.globalAlpha = a;
          ctx.lineWidth = Math.max(1.2, r * 0.32);
          ctx.strokeStyle = col;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r - ctx.lineWidth / 2, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fill();
        }
      }

      // Rótulos (somem ao afastar o zoom, como no Obsidian)
      const base = clamp((view.k - (gs.textFade - 0.35)) / 0.35, 0, 1);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = colors.text;
      for (const n of sim.nodes) {
        let a = base;
        if (focus) a = isHi(n) ? Math.max(base, f) : base * dim;
        if (a <= 0.01) continue;
        const fs = n === focus ? 13 : 12;
        ctx.font = `${n === focus ? 600 : 400} ${fs / Math.sqrt(view.k)}px ${fontFamily}`;
        ctx.globalAlpha = a;
        let label = n.label.length > 32 ? n.label.slice(0, 31) + '…' : n.label;
        if (n.kind === 'task' && n.task.done) label = '✓ ' + label;
        ctx.fillText(label, n.x, n.y + radius(n) + 4);
      }
      ctx.globalAlpha = 1;
    }

    function drawArrow(e, color, lw) {
      const { source: s, target: t } = e;
      const dx = t.x - s.x, dy = t.y - s.y;
      const d = Math.hypot(dx, dy);
      if (d < 1) return;
      const ux = dx / d, uy = dy / d;
      const r = radius(t) + 1;
      const tipX = t.x - ux * r, tipY = t.y - uy * r;
      const size = 4 + lw * 2.5;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - ux * size - uy * size * 0.55, tipY - uy * size + ux * size * 0.55);
      ctx.lineTo(tipX - ux * size + uy * size * 0.55, tipY - uy * size - ux * size * 0.55);
      ctx.closePath();
      ctx.fill();
    }

    /* ---------- Loop ---------- */
    function frame() {
      if (sim.alpha > sim.alphaMin || sim.alphaTarget > 0) { tick(); dirty = true; }
      const targetFade = hover.active ? 1 : 0;
      if (hover.fade !== targetFade) {
        hover.fade += (targetFade - hover.fade) * 0.18;
        if (Math.abs(hover.fade - targetFade) < 0.01) hover.fade = targetFade;
        if (hover.fade === 0) { hover.shown = null; hover.neighbors = new Set(); }
        dirty = true;
      }
      if (dirty && W) { draw(); dirty = false; }
      requestAnimationFrame(frame);
    }

    /* ---------- Tamanho / câmera ---------- */
    function settingsWidth() {
      return !settingsEl.classList.contains('minimized') && W > 760 ? settingsEl.offsetWidth + 24 : 0;
    }
    // Enquadra todos os nós na área livre (descontando o card de exibição, se aberto).
    function fitTarget(maxK = 2) {
      const freeW = W - settingsWidth();
      if (!sim.nodes.length) return { k: 1, tx: freeW / 2, ty: H / 2 };
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const n of sim.nodes) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); }
      const pad = Math.min(70, W * 0.1);
      const k = clamp(Math.min((freeW - pad * 2) / Math.max(x1 - x0, 1), (H - pad * 2) / Math.max(y1 - y0, 1)), 0.15, maxK);
      return { k, tx: freeW / 2 - ((x0 + x1) / 2) * k, ty: H / 2 - ((y0 + y1) / 2) * k };
    }

    function resize() {
      const r = stage.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return; // painel oculto (aba "Tarefas" no celular)
      const oldW = W, oldH = H;
      W = r.width; H = r.height;
      dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      if (!fitted) { Object.assign(view, fitTarget(1.1)); fitted = true; }
      else { view.tx += (W - oldW) / 2; view.ty += (H - oldH) / 2; }
      dirty = true;
    }
    new ResizeObserver(resize).observe(stage);

    function toWorld(px, py) { return { x: (px - view.tx) / view.k, y: (py - view.ty) / view.k }; }
    function zoomAt(px, py, factor) {
      const k = clamp(view.k * factor, 0.08, 8);
      const w = toWorld(px, py);
      view.k = k;
      view.tx = px - w.x * k;
      view.ty = py - w.y * k;
      dirty = true;
    }
    let camAnim = null;
    function animateView(target) {
      const from = { ...view };
      const t0 = performance.now();
      cancelAnimationFrame(camAnim);
      const step = (now) => {
        const p = clamp((now - t0) / 450, 0, 1);
        const e = 1 - Math.pow(1 - p, 3);
        view.k = from.k + (target.k - from.k) * e;
        view.tx = from.tx + (target.tx - from.tx) * e;
        view.ty = from.ty + (target.ty - from.ty) * e;
        dirty = true;
        if (p < 1) camAnim = requestAnimationFrame(step);
      };
      camAnim = requestAnimationFrame(step);
    }
    const fit = () => { if (W) animateView(fitTarget()); };
    function focusNode(id) {
      const n = sim.nodes.find((x) => x.id === id);
      if (!n || !W) return;
      const k = Math.max(view.k, 1.2);
      animateView({ k, tx: (W - settingsWidth()) / 2 - n.x * k, ty: H / 2 - n.y * k });
      hover.external = id;
      updateNeighbors();
      setTimeout(() => { if (hover.external === id) { hover.external = null; updateNeighbors(); } }, 1600);
    }

    /* ---------- Interação ---------- */
    function nodeAt(px, py, touch = false) {
      const p = toWorld(px, py);
      const extra = (touch ? 12 : 4) / view.k; // alvo maior no toque
      for (let i = sim.nodes.length - 1; i >= 0; i--) {
        const n = sim.nodes[i];
        const r = radius(n) + extra;
        if ((n.x - p.x) ** 2 + (n.y - p.y) ** 2 <= r * r) return n;
      }
      return null;
    }
    const localPos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

    const pointers = new Map();
    let drag = null;

    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      const p = localPos(e);
      pointers.set(e.pointerId, p);
      hideTooltip();
      if (pointers.size === 2) {
        if (drag && drag.node) { drag.node.fx = drag.node.fy = null; sim.alphaTarget = 0; }
        const [a, b] = [...pointers.values()];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        drag = { mode: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: view.k, world: toWorld(mid.x, mid.y) };
        return;
      }
      if (pointers.size > 2) return;
      const n = nodeAt(p.x, p.y, e.pointerType !== 'mouse');
      if (n) {
        drag = { mode: 'node', node: n, sx: p.x, sy: p.y, moved: false };
        hover.node = n; updateNeighbors();
      } else {
        drag = { mode: 'pan', sx: p.x, sy: p.y, tx: view.tx, ty: view.ty, moved: false };
      }
      canvas.classList.add('dragging');
    });

    canvas.addEventListener('pointermove', (e) => {
      const p = localPos(e);
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);

      if (drag && drag.mode === 'pinch' && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        view.k = clamp(drag.k * (Math.hypot(a.x - b.x, a.y - b.y) / drag.dist), 0.08, 8);
        view.tx = mid.x - drag.world.x * view.k;
        view.ty = mid.y - drag.world.y * view.k;
        dirty = true;
        return;
      }
      if (drag && drag.mode === 'node') {
        if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) > 4) {
          drag.moved = true;
          sim.alphaTarget = 0.3; reheat(0.3);
        }
        if (drag.moved) {
          const w = toWorld(p.x, p.y);
          drag.node.fx = w.x; drag.node.fy = w.y;
        }
        return;
      }
      if (drag && drag.mode === 'pan') {
        if (Math.hypot(p.x - drag.sx, p.y - drag.sy) > 4) drag.moved = true;
        view.tx = drag.tx + (p.x - drag.sx);
        view.ty = drag.ty + (p.y - drag.sy);
        dirty = true;
        return;
      }
      // Hover (somente mouse)
      if (e.pointerType !== 'mouse') return;
      const n = nodeAt(p.x, p.y);
      if (n !== hover.node) { hover.node = n; updateNeighbors(); }
      canvas.classList.toggle('on-node', !!n);
      if (n) showTooltip(n, p); else hideTooltip();
    });

    function endPointer(e) {
      pointers.delete(e.pointerId);
      if (!drag) return;
      if (drag.mode === 'pinch') { if (pointers.size === 0) drag = null; return; }
      if (drag.mode === 'node') {
        drag.node.fx = drag.node.fy = null;
        sim.alphaTarget = 0;
        if (!drag.moved && e.type === 'pointerup') onNodeClick(drag.node);
        if (e.pointerType !== 'mouse') { hover.node = null; updateNeighbors(); }
      }
      drag = null;
      canvas.classList.remove('dragging');
    }
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('pointerleave', () => {
      if (drag) return;
      if (hover.node) { hover.node = null; updateNeighbors(); }
      canvas.classList.remove('on-node');
      hideTooltip();
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = localPos(e);
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(p.x, p.y, Math.exp(-delta * 0.0015));
      hideTooltip();
    }, { passive: false });
    canvas.addEventListener('dblclick', (e) => { const p = localPos(e); if (!nodeAt(p.x, p.y)) fit(); });

    function onNodeClick(n) {
      hideTooltip();
      if (n.kind === 'task') { flashTask(n.task.id); openModal(n.task.id); }
      else if (n.kind === 'tag') setSearch(n.label);
      else if (n.kind === 'ghost') openModal(null, { title: n.label }); // igual ao Obsidian: "cria a nota"
    }

    function showTooltip(n, p) {
      let html;
      if (n.kind === 'task') {
        const t = n.task;
        html = `<strong>${t.done ? '✓ ' : ''}${esc(t.title)}</strong>
          <div class="tt-meta"><span style="color:${urgColor(t.urgency, 50)}">● urgência ${t.urgency.toFixed(2)}</span>${t.date ? `<span>${fmtDate(t.date)}</span>` : ''}</div>
          ${t.desc ? `<p>${esc(t.desc)}</p>` : ''}`;
      } else if (n.kind === 'tag') {
        html = `<strong>${esc(n.label)}</strong><div class="tt-meta">${n.degree} tarefa${n.degree === 1 ? '' : 's'}</div>`;
      } else {
        html = `<strong>${esc(n.label)}</strong><div class="tt-meta">Tarefa ainda não criada — clique para criar</div>`;
      }
      tooltip.innerHTML = html;
      tooltip.hidden = false;
      const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
      let x = p.x + 16, y = p.y + 16;
      if (x + tw > W - 8) x = p.x - tw - 16;
      if (y + th > H - 8) y = p.y - th - 16;
      tooltip.style.left = Math.max(8, x) + 'px';
      tooltip.style.top = Math.max(8, y) + 'px';
    }
    function hideTooltip() { tooltip.hidden = true; }

    /* ---------- Card de exibição (minimizável) ---------- */
    const SECTIONS = [
      { title: 'Filtros', items: [
        { key: 'showTags', type: 'toggle', label: 'Tags' },
        { key: 'showDone', type: 'toggle', label: 'Tarefas concluídas' },
        { key: 'showUnresolved', type: 'toggle', label: 'Links inexistentes' },
        { key: 'showOrphans', type: 'toggle', label: 'Órfãos' }
      ] },
      { title: 'Grupos', items: [
        { key: 'colorUrgency', type: 'toggle', label: 'Colorir por urgência' },
        { type: 'legend' }
      ] },
      { title: 'Aparência', items: [
        { key: 'arrows', type: 'toggle', label: 'Setas' },
        { key: 'textFade', type: 'range', label: 'Limite para esmaecer texto', min: 0.2, max: 2, step: 0.05 },
        { key: 'nodeSize', type: 'range', label: 'Tamanho dos nós', min: 0.4, max: 3, step: 0.05 },
        { key: 'linkWidth', type: 'range', label: 'Espessura dos links', min: 0.2, max: 4, step: 0.1 }
      ] },
      { title: 'Forças', items: [
        { key: 'center', type: 'range', label: 'Força central', min: 0, max: 1, step: 0.01, force: true },
        { key: 'repel', type: 'range', label: 'Força de repulsão', min: 0, max: 20, step: 0.5, force: true },
        { key: 'linkForce', type: 'range', label: 'Força dos links', min: 0, max: 1, step: 0.01, force: true },
        { key: 'linkDistance', type: 'range', label: 'Distância dos links', min: 30, max: 400, step: 5, force: true }
      ] }
    ];
    const ITEMS = SECTIONS.flatMap((s) => s.items);
    const REBUILD_KEYS = ['showTags', 'showDone', 'showUnresolved', 'showOrphans'];

    function renderSettings() {
      // Por padrão só "Filtros" começa aberto, para o card ficar enxuto.
      gsContent.innerHTML = SECTIONS.map((s, i) => `
        <details class="gs-section" data-sec="${i}" ${(ui.gsSections[i] ?? i === 0) ? 'open' : ''}>
          <summary>${s.title}</summary>
          <div class="gs-body">
            ${s.items.map((it) => {
              if (it.type === 'toggle') return `<label class="gs-row"><span>${it.label}</span><span class="toggle"><input type="checkbox" data-gs="${it.key}" ${gs[it.key] ? 'checked' : ''}><i></i></span></label>`;
              if (it.type === 'legend') return `<div class="gs-legend"><div class="bar"></div><div class="ends"><span>0 · baixa</span><span>1 · alta</span></div></div>`;
              return `<label class="gs-range"><span>${it.label}</span><input type="range" data-gs="${it.key}" min="${it.min}" max="${it.max}" step="${it.step}" value="${gs[it.key]}"></label>`;
            }).join('')}
          </div>
        </details>`).join('') +
        `<div class="gs-footer"><button type="button" class="btn ghost" id="gs-reset">Restaurar padrões</button></div>`;
    }

    gsContent.addEventListener('input', (e) => {
      const el = e.target.closest('[data-gs]');
      if (!el) return;
      const key = el.dataset.gs;
      gs[key] = el.type === 'checkbox' ? el.checked : Number(el.value);
      saveGS();
      const item = ITEMS.find((i) => i.key === key);
      if (REBUILD_KEYS.includes(key)) rebuild();
      else if (item && item.force) reheat(0.5);
      else dirty = true;
    });
    gsContent.addEventListener('toggle', (e) => {
      const d = e.target.closest('details[data-sec]');
      if (!d) return;
      ui.gsSections[d.dataset.sec] = d.open;
      persistUI();
    }, true);
    gsContent.addEventListener('click', (e) => {
      if (e.target.id !== 'gs-reset') return;
      Object.assign(gs, DEFAULTS);
      saveGS(); renderSettings(); rebuild();
    });

    function setSettingsOpen(open) {
      settingsEl.classList.toggle('minimized', !open);
      gsToggle.setAttribute('aria-expanded', String(open));
      gsToggle.title = open ? 'Minimizar opções de exibição' : 'Mostrar opções de exibição';
    }
    gsToggle.addEventListener('click', () => { ui.gsOpen = !ui.gsOpen; persistUI(); setSettingsOpen(ui.gsOpen); });
    $('#fit-btn').addEventListener('click', fit);

    /* ---------- Init ---------- */
    renderSettings();
    setSettingsOpen(ui.gsOpen);
    refreshColors();
    requestAnimationFrame(frame);

    // Pré-calcula o layout para abrir já organizado (o enquadramento ocorre no 1º resize).
    function warmup() {
      for (let i = 0; i < 220 && sim.alpha > 0.05; i++) tick();
      if (W) Object.assign(view, fitTarget(1.1));
      dirty = true;
    }

    return {
      rebuild, refreshColors, fit, focusNode, warmup,
      setExternalHover(id) { if (hover.external !== id) { hover.external = id; updateNeighbors(); } }
    };
  })();

  /* ===================== Inicialização ===================== */
  function renderAll() {
    renderFolderUI();
    renderList();
    graph.rebuild();
  }

  applyTheme(store.get(KEYS.theme, null) || document.documentElement.getAttribute('data-theme'));
  setView(ui.view);
  renderAll();
  graph.warmup();
  openFromHash();
})();
