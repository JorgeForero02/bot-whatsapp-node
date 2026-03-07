(function () {
  'use strict';

  const bp = typeof BASE_PATH !== 'undefined' ? BASE_PATH : '';

  let currentFilter         = 'all';
  let currentConversationId = null;
  let allConversations      = [];
  let messagesOffset        = 0;
  let hasMoreMessages       = false;
  let autoRefreshHandle     = null;
  let convsRefreshHandle    = null;
  let lastCheckTime         = null;
  let lastConvsCheck        = null;
  let loadConvsAbort        = null;
  let refreshConvsAbort      = null;

  const $ = id => document.getElementById(id);

  function esc(text) {
    const d = document.createElement('div');
    d.textContent = String(text ?? '');
    return d.innerHTML;
  }

  function updateFilterButtons() {
    const map = { all: 'filter-all', active: 'filter-active', pending_human: 'filter-pending' };
    Object.entries(map).forEach(([key, id]) => {
      const btn = $(id);
      if (!btn) return;
      if (key === currentFilter) {
        btn.className = 'conv-filter-btn active';
      } else {
        btn.className = 'conv-filter-btn';
      }
    });
  }

  function renderConversationsList(conversations) {
    const container = $('conversations-list');
    if (!container) return;

    if (!conversations || conversations.length === 0) {
      container.innerHTML = `
        <div style="padding:3rem 1.5rem;text-align:center;color:var(--text-muted);">
          <svg width="48" height="48" viewBox="0 0 20 20" fill="currentColor" style="margin:0 auto 0.75rem;display:block;opacity:0.3;">
            <path fill-rule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7z" clip-rule="evenodd"/>
          </svg>
          <p style="font-size:0.875rem;font-weight:500;color:var(--text-secondary);">No hay conversaciones</p>
          <p style="font-size:0.8125rem;margin-top:0.25rem;">Las conversaciones aparecerán aquí</p>
        </div>`;
      return;
    }

    const statusMap = {
      active:        { cls: 'badge-success', label: 'Activa' },
      pending_human: { cls: 'badge-warning', label: 'Pendiente' },
      closed:        { cls: 'badge-neutral', label: 'Cerrada' },
    };

    const fragment = document.createDocumentFragment();

    conversations.forEach(conv => {
      const s       = statusMap[conv.status] || statusMap.closed;
      const initial = (conv.contact_name || conv.phone_number || '?').charAt(0).toUpperCase();
      const name    = conv.contact_name || conv.phone_number || 'Sin nombre';
      const preview = (conv.last_message || 'Sin mensajes').substring(0, 50);
      const timeAgo = window.formatTimeAgo ? window.formatTimeAgo(new Date(conv.last_message_at)) : '';
      const isActive = currentConversationId === conv.id;

      const div = document.createElement('div');
      div.dataset.convId     = conv.id;
      div.dataset.lastUpdate = conv.last_message_at;
      div.dataset.status     = conv.status;
      div.className = 'conv-item' + (isActive ? ' selected' : '');
      div.onclick   = () => viewConversation(conv.id, name, conv.phone_number);

      div.innerHTML = `
        <div class="avatar avatar-md" style="flex-shrink:0;">${esc(initial)}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;margin-bottom:0.2rem;">
            <span style="font-size:0.875rem;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(name)}</span>
            <span style="font-size:0.6875rem;color:var(--text-muted);flex-shrink:0;">${esc(timeAgo)}</span>
          </div>
          <div style="font-size:0.8125rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:0.2rem;">${esc(conv.phone_number)}</div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;">
            <span style="font-size:0.8125rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;">${esc(preview)}${preview.length >= 50 ? '…' : ''}</span>
            <span class="badge ${s.cls}" style="flex-shrink:0;">${s.label}</span>
          </div>
        </div>`;

      fragment.appendChild(div);
    });

    container.innerHTML = '';
    container.appendChild(fragment);
  }

  async function loadConversations(status, abortPrevious = true) {
    if (abortPrevious && loadConvsAbort) { loadConvsAbort.abort(); }
    loadConvsAbort = new AbortController();
    const signal = loadConvsAbort.signal;
    try {
      const url = status ? `${bp}/api/get-conversations.php?status=${status}` : `${bp}/api/get-conversations.php`;
      const res  = await fetch(url, { signal, cache: 'no-store' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Error');
      allConversations = data.conversations || [];
      renderConversationsList(allConversations);
      updateFilterButtons();
    } catch (err) {
      if (err.name === 'AbortError') return;
      const c = $('conversations-list');
      if (c) c.innerHTML = `<div style="padding:2rem;text-align:center;"><span class="badge badge-error">${esc(err.message)}</span></div>`;
    }
  }

  async function refreshConversations(status) {
    if (refreshConvsAbort) { refreshConvsAbort.abort(); }
    refreshConvsAbort = new AbortController();
    const signal = refreshConvsAbort.signal;
    try {
      const url = status ? `${bp}/api/get-conversations.php?status=${status}` : `${bp}/api/get-conversations.php`;
      const res  = await fetch(url, { signal, cache: 'no-store' });
      const data = await res.json();
      if (!data.success) return;
      allConversations = data.conversations || [];
      renderConversationsList(allConversations);
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }

  window.filterConversations = function (status) {
    currentFilter = status;
    loadConversations(status === 'all' ? null : status, true);
  };

  const searchInput = $('search-conversations');
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      const filtered = allConversations.filter(c =>
        (c.contact_name || '').toLowerCase().includes(q) || (c.phone_number || '').includes(q)
      );
      renderConversationsList(filtered);
    });
  }

  function renderMessages(messages) {
    if (!messages || messages.length === 0) {
      return `<div style="text-align:center;color:var(--text-muted);padding:2rem;font-size:0.875rem;">No hay mensajes en esta conversación</div>`;
    }

    return `<div class="messages-wrapper">` + messages.map(msg => {
      const isUser = msg.sender_type === 'user';
      const time   = new Date(msg.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
      const bubbleBg = isUser
        ? 'background:var(--bg-surface);border:1px solid var(--border-color);'
        : 'background:var(--color-primary);';
      const textColor = isUser ? 'color:var(--text-primary);' : 'color:#fff;';

      let inner = '';
      if (msg.media_type === 'audio' && msg.audio_url) {
        inner = `
          <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="${isUser ? 'var(--color-primary)' : '#fff'}">
              <path fill-rule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clip-rule="evenodd"/>
            </svg>
            <span style="font-size:0.75rem;font-weight:600;${textColor}">Mensaje de voz</span>
          </div>
          <audio controls style="width:100%;max-width:260px;height:36px;border-radius:18px;">
            <source src="${bp}${esc(msg.audio_url)}" type="audio/ogg">
          </audio>
          <details style="margin-top:0.5rem;">
            <summary style="cursor:pointer;font-size:0.75rem;${isUser ? 'color:var(--text-muted)' : 'color:rgba(255,255,255,0.7)'}">Ver transcripción</summary>
            <p style="margin-top:0.375rem;font-size:0.8125rem;${textColor};font-style:italic;">${esc(msg.message_text.replace('[Audio] ', ''))}</p>
          </details>`;
      } else {
        inner = `<p style="font-size:0.875rem;line-height:1.55;word-break:break-word;${textColor}">${esc(msg.message_text)}</p>`;
      }

      const checkmark = !isUser
        ? `<svg width="14" height="14" viewBox="0 0 20 20" fill="#3b82f6"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>`
        : '';
      const confScore = msg.confidence_score
        ? `<span style="font-size:0.6875rem;color:var(--text-muted);">(${Math.round(msg.confidence_score * 100)}%)</span>`
        : '';

      return `
        <div class="message-bubble" style="display:flex;justify-content:${isUser ? 'flex-start' : 'flex-end'};margin-bottom:0.75rem;">
          <div style="max-width:min(75%,360px);">
            <div style="padding:0.625rem 0.875rem;border-radius:${isUser ? '0.25rem 1rem 1rem 1rem' : '1rem 0.25rem 1rem 1rem'};${bubbleBg}">${inner}</div>
            <div style="display:flex;align-items:center;gap:0.25rem;margin-top:0.25rem;padding:0 0.25rem;justify-content:${isUser ? 'flex-start' : 'flex-end'};">
              <span style="font-size:0.6875rem;color:var(--text-muted);">${time}</span>
              ${confScore}${checkmark}
            </div>
          </div>
        </div>`;
    }).join('') + `</div>`;
  }

  async function loadMessages(conversationId, append = false) {
    try {
      const res  = await fetch(`${bp}/api/get-conversation-messages.php?id=${conversationId}&offset=${messagesOffset}&limit=20`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Error');

      if (!append && data.server_time) lastCheckTime = data.server_time;

      hasMoreMessages = data.has_more;
      const loadMoreBtn = $('load-more-btn');
      if (loadMoreBtn) loadMoreBtn.classList.toggle('hidden', !hasMoreMessages);

      const messagesContent = $('messages-content');
      if (!messagesContent) return;

      const html = renderMessages(data.messages || []);

      if (append) {
        const existing = messagesContent.querySelector('.messages-wrapper');
        if (existing) {
          const tmp = document.createElement('div');
          tmp.innerHTML = html;
          const newWrapper = tmp.querySelector('.messages-wrapper');
          if (newWrapper) {
            Array.from(newWrapper.children).reverse().forEach(child => {
              existing.insertBefore(child, existing.firstChild);
            });
          }
        }
      } else {
        const lastMsg   = (data.messages || []).slice(-1)[0];
        const newHash   = lastMsg ? `${lastMsg.id}-${lastMsg.message_text.length}` : 'empty';
        const existing  = messagesContent.querySelector('.messages-wrapper');
        const existHash = existing ? existing.dataset.hash : null;

        if (!existing || existHash !== newHash) {
          const chatMessages = $('chat-messages');
          const atBottom = chatMessages
            ? (chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight) < 80
            : true;
          messagesContent.innerHTML = html;
          const newWrapper = messagesContent.querySelector('.messages-wrapper');
          if (newWrapper) newWrapper.dataset.hash = newHash;
          if (atBottom && chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
        }
      }
    } catch (err) {
      const mc = $('messages-content');
      if (mc) mc.innerHTML = `<div style="text-align:center;padding:2rem;"><span class="badge badge-error">${esc(err.message)}</span></div>`;
    }
  }

  window.loadMoreMessages = async function () {
    if (!currentConversationId || !hasMoreMessages) return;
    const btn = $('load-more-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Cargando…'; }
    const chatMessages = $('chat-messages');
    const heightBefore = chatMessages ? chatMessages.scrollHeight : 0;
    messagesOffset += 20;
    await loadMessages(currentConversationId, true);
    if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight - heightBefore;
    if (btn) { btn.disabled = false; btn.textContent = 'Cargar mensajes anteriores'; }
  };

  function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshHandle = visibilityInterval(async () => {
      if (!currentConversationId || !lastCheckTime) return;
      try {
        const url = `${bp}/api/check-updates.php?last_check=${encodeURIComponent(lastCheckTime)}&conversation_id=${currentConversationId}`;
        const res  = await fetch(url, { cache: 'no-store' });
        const data = await res.json();
        if (data.server_time) lastCheckTime = data.server_time;
        if (!data.success || !data.has_update) return;
        const chatMessages = $('chat-messages');
        const atBottom     = chatMessages ? (chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight) < 100 : false;
        const prevOffset   = messagesOffset;
        messagesOffset = 0;
        await loadMessages(currentConversationId);
        messagesOffset = prevOffset;
        if (atBottom && chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
      } catch (_) {}
    }, 1500);
  }

  function stopAutoRefresh() {
    if (autoRefreshHandle) { autoRefreshHandle.stop(); autoRefreshHandle = null; }
  }

  function startConvsRefresh() {
    stopConvsRefresh();
    convsRefreshHandle = visibilityInterval(async () => {
      try {
        if (!lastConvsCheck) {
          const init = await fetch(`${bp}/api/check-updates.php`, { cache: 'no-store' });
          const initData = await init.json();
          lastConvsCheck = initData.server_time || new Date().toISOString();
        }
        const res  = await fetch(`${bp}/api/check-conversation-updates.php?last_check=${encodeURIComponent(lastConvsCheck)}`, { cache: 'no-store' });
        const data = await res.json();
        if (data.server_time) lastConvsCheck = data.server_time;
        if (!data.success || !data.has_updates) return;
        await refreshConversations(currentFilter === 'all' ? null : currentFilter);
      } catch (_) {}
    }, 3000);
  }

  function stopConvsRefresh() {
    if (convsRefreshHandle) { convsRefreshHandle.stop(); convsRefreshHandle = null; }
  }

  window.viewConversation = async function (id, name, phone) {
    if (currentConversationId === id) return;
    currentConversationId = id;
    messagesOffset        = 0;

    const conv = allConversations.find(c => c.id === id);

    const chatPanel = $('chat-panel');
    const listPanel = $('list-panel');
    if (chatPanel) chatPanel.classList.remove('hidden');

    /* Mobile: switch to chat view */
    if (window.innerWidth < 768) {
      if (listPanel) listPanel.style.display = 'none';
      if (chatPanel) chatPanel.style.display = 'flex';
    }

    /* Header */
    const headerEl = $('chat-header');
    if (headerEl) headerEl.classList.remove('hidden');
    const chatInput = $('chat-input');
    if (chatInput) chatInput.classList.remove('hidden');

    const nameEl = $('chat-contact-name');
    if (nameEl) nameEl.textContent = name;
    const phoneEl = $('chat-contact-phone');
    if (phoneEl) phoneEl.textContent = phone;

    const aiToggle = $('ai-toggle');
    if (aiToggle && conv) aiToggle.checked = parseInt(conv.ai_enabled) !== 0;

    await loadMessages(id);
    renderConversationsList(allConversations);
    startAutoRefresh();
    startConvsRefresh();
  };

  window.closeChat = function () {
    const listPanel = $('list-panel');
    const chatPanel = $('chat-panel');

    if (window.innerWidth < 768) {
      if (listPanel) listPanel.style.display = '';
      if (chatPanel) chatPanel.style.display = 'none';
    }

    const headerEl = $('chat-header');
    if (headerEl) headerEl.classList.add('hidden');
    const chatInput = $('chat-input');
    if (chatInput) chatInput.classList.add('hidden');
    const loadMoreBtn = $('load-more-btn');
    if (loadMoreBtn) loadMoreBtn.classList.add('hidden');

    const mc = $('messages-content');
    if (mc) mc.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--text-muted);text-align:center;gap:0.75rem;padding:2rem;">
        <svg width="56" height="56" viewBox="0 0 20 20" fill="currentColor" style="opacity:0.2;">
          <path fill-rule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7z" clip-rule="evenodd"/>
        </svg>
        <p style="font-size:1rem;font-weight:500;color:var(--text-secondary);">Selecciona una conversación</p>
        <p style="font-size:0.875rem;">Elige una conversación de la lista para ver los mensajes</p>
      </div>`;

    currentConversationId = null;
    messagesOffset = 0;
    stopAutoRefresh();
    stopConvsRefresh();
    renderConversationsList(allConversations);
  };

  window.sendReply = async function () {
    const textarea   = $('reply-input');
    const sendButton = $('send-btn');
    const message    = textarea ? textarea.value.trim() : '';
    if (!message) return;

    if (sendButton) { sendButton.disabled = true; sendButton.classList.add('btn-loading'); }

    try {
      const res  = await fetch(`${bp}/api/reply-conversation.php?id=${currentConversationId}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Error');

      if (textarea) { textarea.value = ''; textarea.style.height = 'auto'; }
      messagesOffset = 0;
      await loadMessages(currentConversationId);
      await loadConversations(currentFilter === 'all' ? null : currentFilter);
      const cm = $('chat-messages');
      if (cm) cm.scrollTop = cm.scrollHeight;
    } catch (err) {
      if (window.showToast) showToast('Error al enviar: ' + err.message, 'error');
    } finally {
      if (sendButton) { sendButton.disabled = false; sendButton.classList.remove('btn-loading'); }
    }
  };

  window.toggleAI = async function () {
    if (!currentConversationId) return;
    const aiToggle = $('ai-toggle');
    const newState = aiToggle ? aiToggle.checked : false;

    if (newState) {
      try {
        const res  = await fetch(`${bp}/api/check-openai-status.php`, { cache: 'no-store' });
        const data = await res.json();
        if (data.success && !data.can_enable_ai) {
          if (window.showToast) showToast('Fondos insuficientes en OpenAI. Por favor recarga tu cuenta.', 'warning');
          if (aiToggle) aiToggle.checked = false;
          return;
        }
      } catch (_) {}
    }

    try {
      const res  = await fetch(`${bp}/api/toggle-ai.php?id=${currentConversationId}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ai_enabled: newState }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Error');
      const conv = allConversations.find(c => c.id === currentConversationId);
      if (conv) conv.ai_enabled = newState;
      if (window.showToast) showToast(`IA Bot ${newState ? 'activado' : 'desactivado'}`, 'success');
    } catch (err) {
      if (aiToggle) aiToggle.checked = !newState;
      if (window.showToast) showToast('Error: ' + err.message, 'error');
    }
  };

  const replyInput = $('reply-input');
  if (replyInput) {
    replyInput.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
    replyInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); }
    });
  }

  loadConversations(null, false);

  visibilityInterval(() => {
    if (!currentConversationId) {
      refreshConversations(currentFilter === 'all' ? null : currentFilter);
    }
  }, 15000);

})();
