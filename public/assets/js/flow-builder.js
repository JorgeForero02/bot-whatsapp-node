let allNodes    = [];
let nodeKeywords = [];
let currentFilter = 'all';
let currentView   = 'list';

async function loadNodes() {
    try {
        const res  = await apiFetch('/api/flows');
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        allNodes = data.data || [];
        applyFilters();
    } catch (e) {
        document.getElementById('nodes-container').innerHTML =
            `<div style="text-align:center;padding:3rem 1rem;color:var(--color-error);">Error al cargar flujos: ${e.message}</div>`;
    }
}

function setFilter(filter, btn) {
    currentFilter = filter;
    document.querySelectorAll('.fb-filter-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyFilters();
}

function setView(view) {
    currentView = view;
    document.getElementById('btn-view-list').classList.toggle('active', view === 'list');
    document.getElementById('btn-view-tree').classList.toggle('active', view === 'tree');
    applyFilters();
}

function applyFilters() {
    const query = (document.getElementById('fb-search').value || '').toLowerCase().trim();

    let sorted = [...allNodes].sort((a, b) => {
        if (a.isRoot && !b.isRoot) return -1;
        if (!a.isRoot && b.isRoot) return 1;
        return (a.name || '').localeCompare(b.name || '');
    });

    let filtered = sorted.filter(node => {
        if (currentFilter === 'root')     return !!node.isRoot;
        if (currentFilter === 'calendar') return !!node.requiresCalendar;
        if (currentFilter === 'terminal') return !(node.options && node.options.length) && !node.nextNodeId;
        return true;
    });

    if (query) {
        filtered = filtered.filter(node => {
            const nameMatch = (node.name || '').toLowerCase().includes(query);
            const kws = Array.isArray(node.triggerKeywords) ? node.triggerKeywords : [];
            const kwMatch = kws.some(k => k.toLowerCase().includes(query));
            return nameMatch || kwMatch;
        });
    }

    const count = filtered.length;
    const total = allNodes.length;

    const counter = document.getElementById('fb-node-count');
    counter.textContent = count === total
        ? `${total} nodo${total !== 1 ? 's' : ''} en el flujo`
        : `${count} de ${total} nodo${total !== 1 ? 's' : ''}`;

    const label = document.getElementById('fb-filter-label');
    label.textContent = query ? `Buscando: "${query}"` : '';

    if (currentView === 'tree') {
        renderTree(filtered);
    } else {
        renderNodes(filtered);
    }
}

function renderNodes(nodes) {
    const container = document.getElementById('nodes-container');
    if (!nodes.length && !allNodes.length) {
        container.innerHTML = `
            <div class="fb-empty">
                <svg class="fb-empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                </svg>
                <p class="fb-empty-title">No hay nodos creados</p>
                <p style="font-size:0.8125rem;color:var(--text-muted);">Sigue estos pasos para comenzar:</p>
                <div class="fb-empty-steps">
                    <div class="fb-empty-step"><span class="fb-empty-step-num">1</span><span>Crea un nodo raíz con el mensaje de bienvenida</span></div>
                    <div class="fb-empty-step"><span class="fb-empty-step-num">2</span><span>Agrega keywords que lo activen (ej: "hola", "menu")</span></div>
                    <div class="fb-empty-step"><span class="fb-empty-step-num">3</span><span>Agrega opciones numeradas que lleven a otros nodos</span></div>
                </div>
            </div>`;
        return;
    }

    if (!nodes.length) {
        container.innerHTML = `<div class="fb-empty"><p class="fb-empty-title">Sin resultados</p><p style="font-size:0.8125rem;color:var(--text-muted);">Ningún nodo coincide con el filtro actual.</p></div>`;
        return;
    }

    container.innerHTML = '<div style="display:flex;flex-direction:column;gap:0.75rem;">' + nodes.map(node => nodeCard(node)).join('') + '</div>';

    container.querySelectorAll('.fb-node-del-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            deleteNode(parseInt(this.dataset.id, 10), this.dataset.name);
        });
    });
}

function nodeCard(node) {
    const keywords   = Array.isArray(node.triggerKeywords) ? node.triggerKeywords : [];
    const options    = node.options || [];
    const optCount   = options.length;
    const MSG_LIMIT  = 120;
    const msgFull    = node.messageText || '';
    const msgShort   = msgFull.length > MSG_LIMIT ? msgFull.slice(0, MSG_LIMIT) : msgFull;
    const needsExpand = msgFull.length > MSG_LIMIT;
    const cardId     = 'nc-' + node.id;

    const badges = [
        node.isRoot           ? `<span class="fb-badge fb-badge-root">Raíz</span>` : '',
        node.requiresCalendar ? `<span class="fb-badge fb-badge-calendar">Calendario</span>` : '',
        node.matchAnyInput   ? `<span class="fb-badge fb-badge-any">Cualquier msg</span>` : '',
        node.isFarewell       ? `<span class="fb-badge fb-badge-farewell">Despedida</span>` : '',
        !node.isActive        ? `<span class="fb-badge fb-badge-inactive">Inactivo</span>` : '',
    ].filter(Boolean).join('');

    let keywordsHtml = '';
    if (node.matchAnyInput) {
        keywordsHtml = `<div><p class="fb-section-label">Se activa con</p><span class="fb-chip fb-chip-opt">Cualquier mensaje</span></div>`;
    } else if (keywords.length) {
        const chips = keywords.map(k => `<span class="fb-chip fb-chip-kw">${escapeHtml(k)}</span>`).join('');
        keywordsHtml = `<div><p class="fb-section-label">Se activa con</p><div class="fb-chips-row">${chips}</div></div>`;
    }

    const msgHtml = `<div>
        <p class="fb-section-label">Responde</p>
        <div class="fb-message-bubble" id="${cardId}-msg">${escapeHtml(msgShort)}${needsExpand ? `<span id="${cardId}-ellipsis">... <button class="fb-message-expand-btn" onclick="expandMsg('${cardId}')">Ver completo</button></span>` : ''}</div>
        <div id="${cardId}-full" class="fb-message-bubble" style="display:none;">${escapeHtml(msgFull)} <button class="fb-message-expand-btn" onclick="collapseMsg('${cardId}')">Ver menos</button></div>
    </div>`;

    let footerHtml = '';
    if (optCount) {
        const optRows = options.map((opt, i) => {
            const dest = allNodes.find(n => n.id == opt.nextNodeId);
            const kws  = Array.isArray(opt.optionKeywords) ? opt.optionKeywords : [];
            const kwChips = kws.map(k => `<span class="fb-chip fb-chip-opt" style="font-size:0.625rem;padding:1px 6px;">${escapeHtml(k)}</span>`).join('');
            const kwPanelId = `${cardId}-opt-kw-${i}`;
            return `<div class="fb-option-row" style="flex-wrap:wrap;">
                <span class="fb-option-text">${escapeHtml(opt.optionText)}</span>
                <span class="fb-option-arrow">→</span>
                <span class="fb-option-dest" onclick="openNodeModal(${opt.nextNodeId || 0})">${dest ? escapeHtml(dest.name) : '—'}</span>
                ${kws.length ? `<button class="fb-option-kw-toggle" onclick="toggleOptKw('${kwPanelId}',this)">keywords ▾</button>` : ''}
                ${kws.length ? `<div id="${kwPanelId}" class="fb-option-kw-panel" style="display:none;width:100%;">${kwChips}</div>` : ''}
            </div>`;
        }).join('');
        footerHtml = `<div class="fb-node-footer">
            <p class="fb-section-label">Opciones (${optCount})</p>
            <div class="fb-options-list">${optRows}</div>
        </div>`;
    } else {
        footerHtml = `<div class="fb-node-footer"><p class="fb-section-label">Opciones</p><p class="fb-terminal-label">Nodo terminal</p></div>`;
    }

    return `<div class="fb-node-card${!node.isActive ? ' fb-node-inactive' : ''}">
        <div class="fb-node-header">
            <div class="fb-node-header-badges">${badges}</div>
            <span class="fb-node-name">${escapeHtml(node.name)}</span>
            <div class="fb-node-actions">
                <button class="fb-node-action-btn" onclick="openNodeModal(${node.id})" title="Editar">
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                </button>
                <button class="fb-node-action-btn danger fb-node-del-btn" data-id="${node.id}" data-name="${escapeHtml(node.name)}" title="Eliminar">
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
            </div>
        </div>
        <div class="fb-node-body">
            ${keywordsHtml}
            ${msgHtml}
        </div>
        ${footerHtml}
    </div>`;
}

function expandMsg(cardId) {
    document.getElementById(cardId + '-msg').style.display   = 'none';
    document.getElementById(cardId + '-full').style.display  = '';
}
function collapseMsg(cardId) {
    document.getElementById(cardId + '-msg').style.display   = '';
    document.getElementById(cardId + '-full').style.display  = 'none';
}
function toggleOptKw(panelId, btn) {
    const panel = document.getElementById(panelId);
    const open  = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : 'flex';
    btn.textContent = open ? 'keywords ▾' : 'keywords ▴';
}

function renderTree(nodes) {
    const container = document.getElementById('nodes-container');
    if (!nodes.length) {
        container.innerHTML = `<div class="fb-empty"><p class="fb-empty-title">Sin resultados</p></div>`;
        return;
    }

    const visited = new Set();
    const lines   = [];

    function renderNode(nodeId, depth, isLast) {
        if (visited.has(nodeId)) {
            const node = allNodes.find(n => n.id == nodeId);
            const indent = buildIndent(depth, isLast);
            lines.push(`<div class="fb-tree-node">${indent}<div class="fb-tree-item">
                <span class="fb-tree-item-name">${escapeHtml(node ? node.name : '#' + nodeId)}</span>
                <span class="fb-tree-cycle">↺ ciclo</span>
            </div></div>`);
            return;
        }
        visited.add(nodeId);

        const node = allNodes.find(n => n.id == nodeId);
        if (!node) return;

        const badges = [
            node.isRoot           ? `<span class="fb-badge fb-badge-root" style="font-size:0.5625rem;padding:1px 5px;">RAÍZ</span>` : '',
            node.requiresCalendar ? `<span class="fb-badge fb-badge-calendar" style="font-size:0.5625rem;padding:1px 5px;">CAL</span>` : '',
            node.matchAnyInput   ? `<span class="fb-badge fb-badge-any" style="font-size:0.5625rem;padding:1px 5px;">ANY</span>` : '',
            node.isFarewell       ? `<span class="fb-badge fb-badge-farewell" style="font-size:0.5625rem;padding:1px 5px;">DESP</span>` : '',
        ].filter(Boolean).join('');

        const optCount  = (node.options || []).length;
        const indent    = buildIndent(depth, isLast);
        lines.push(`<div class="fb-tree-node">${indent}<div class="fb-tree-item" onclick="openNodeModal(${node.id})">
            ${badges}
            <span class="fb-tree-item-name">${escapeHtml(node.name)}</span>
            <span class="fb-tree-item-meta">${optCount} opc.</span>
        </div></div>`);

        (node.options || []).forEach((opt, i) => {
            if (opt.nextNodeId) {
                renderNode(opt.nextNodeId, depth + 1, i === optCount - 1);
            }
        });
    }

    function buildIndent(depth, isLast) {
        if (depth === 0) return '';
        let html = '';
        for (let i = 0; i < depth - 1; i++) html += '<div class="fb-tree-line"></div>';
        html += '<div class="fb-tree-connector"></div>';
        return `<div class="fb-tree-indent">${html}</div>`;
    }

    const roots = nodes.filter(n => n.isRoot);
    const rest  = nodes.filter(n => !n.isRoot);
    [...roots, ...rest].forEach((n, i, arr) => {
        if (!visited.has(n.id)) renderNode(n.id, 0, i === arr.length - 1);
    });

    container.innerHTML = `<div class="fb-tree">${lines.join('')}</div>`;
}

function openNodeModal(nodeId) {
    nodeKeywords = [];
    document.getElementById('node-id').value        = '';
    document.getElementById('node-name').value       = '';
    document.getElementById('node-message').value    = '';
    document.getElementById('node-is-root').checked  = false;
    document.getElementById('node-requires-calendar').checked = false;
    document.getElementById('node-match-any-input').checked   = false;
    document.getElementById('node-is-farewell').checked       = false;
    document.getElementById('node-order').value      = 0;
    document.getElementById('node-is-active').checked = true;
    document.getElementById('node-next').value       = '';
    document.getElementById('options-container').innerHTML = '';
    document.getElementById('modal-title').textContent = nodeId ? 'Editar Nodo' : 'Nuevo Nodo';

    // Always expand all sections when opening the modal
    document.querySelectorAll('#node-modal .fb-form-section').forEach(function(s) {
        s.classList.remove('collapsed');
    });
    document.getElementById('message-preview').classList.add('hidden');
    document.getElementById('match-any-input-row').classList.add('hidden');
    document.getElementById('match-any-notice').classList.add('hidden');
    document.getElementById('calendar-notice').classList.add('hidden');
    document.getElementById('keywords-input').disabled = false;
    document.getElementById('keywords-tags').style.opacity = '';
    updateCharCounter('');

    populateNextNodeSelect(nodeId || null);

    if (nodeId) {
        const node = allNodes.find(n => n.id == nodeId);
        if (node) {
            document.getElementById('node-id').value        = node.id;
            document.getElementById('node-name').value       = node.name;
            document.getElementById('node-message').value    = node.messageText;
            document.getElementById('node-is-root').checked  = !!node.isRoot;
            document.getElementById('node-requires-calendar').checked = !!node.requiresCalendar;
            document.getElementById('node-match-any-input').checked   = !!node.matchAnyInput;
            document.getElementById('node-is-farewell').checked       = !!node.isFarewell;
            document.getElementById('node-order').value      = node.positionOrder;
            document.getElementById('node-is-active').checked = !!node.isActive;
            document.getElementById('node-next').value       = node.nextNodeId || '';

            onIsRootChange();
            if (node.matchAnyInput) onMatchAnyInputChange();
            if (node.requiresCalendar) onCalendarToggle();

            nodeKeywords = Array.isArray(node.triggerKeywords) ? [...node.triggerKeywords] : [];
            renderKeywordTags();
            updateMessagePreview();
            updateCharCounter(node.messageText || '');

            (node.options || []).forEach(opt => {
                const kws = Array.isArray(opt.optionKeywords) ? opt.optionKeywords : [];
                addOption(opt.optionText, kws, opt.nextNodeId || '');
            });
        }
    }

    const modal = document.getElementById('node-modal');
    modal.classList.add('visible');
    modal.style.pointerEvents = '';
    document.body.style.overflow = 'hidden';
    const modalBody = modal.querySelector('.modal-body');
    if (modalBody) modalBody.scrollTop = 0;
}

function closeNodeModal() {
    const modal = document.getElementById('node-modal');
    modal.classList.remove('visible');
    modal.style.pointerEvents = 'none';
    document.body.style.overflow = '';
}

function toggleFormSection(header) {
    header.closest('.fb-form-section').classList.toggle('collapsed');
}

function populateNextNodeSelect(excludeId) {
    const sel = document.getElementById('node-next');
    sel.innerHTML = '<option value="">— Ninguno —</option>';
    allNodes.forEach(n => {
        if (n.id == excludeId) return;
        const opt = document.createElement('option');
        opt.value   = n.id;
        opt.textContent = n.name;
        sel.appendChild(opt);
    });
}

function handleKeywordInput(e) {
    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = e.target.value.trim().replace(/,$/, '');
        if (val && !nodeKeywords.includes(val)) {
            nodeKeywords.push(val);
            renderKeywordTags();
        }
        e.target.value = '';
    }
}

function renderKeywordTags() {
    const container = document.getElementById('keywords-tags');
    container.innerHTML = nodeKeywords.map((kw, i) =>
        `<span class="fb-chip fb-chip-opt">
            ${escapeHtml(kw)}
            <button type="button" class="fb-chip-del" onclick="removeKeyword(${i})">×</button>
        </span>`
    ).join('');
}

function removeKeyword(index) {
    nodeKeywords.splice(index, 1);
    renderKeywordTags();
}

function addOption(text = '', keywords = [], nextNodeId = '') {
    const container = document.getElementById('options-container');
    const idx = container.children.length;

    const div = document.createElement('div');
    div.className = 'fb-opt-row';
    div.dataset.optionIndex = idx;

    const nodeOptions = allNodes.map(n =>
        `<option value="${n.id}" ${n.id == nextNodeId ? 'selected' : ''}>${escapeHtml(n.name)}</option>`
    ).join('');

    const kwChips = keywords.map((k, ki) =>
        `<span class="fb-chip fb-chip-opt">${escapeHtml(k)}<button type="button" class="fb-chip-del" onclick="removeOptionKeyword(this,${ki})">×</button></span>`
    ).join('');

    div.innerHTML = `
        <div class="fb-opt-row-header">
            <span class="fb-opt-row-label">Opción ${idx + 1}</span>
            <button type="button" class="fb-opt-move-btn" onclick="moveOption(this,-1)" title="Subir">↑</button>
            <button type="button" class="fb-opt-move-btn" onclick="moveOption(this,1)" title="Bajar">↓</button>
            <button type="button" class="fb-opt-del-btn" onclick="this.closest('.fb-opt-row').remove(); renumberOptions()">
                <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>
        <div class="fb-opt-row-body">
            <input type="text" placeholder="Texto de la opción (ej: 1. Agendar cita)" value="${escapeHtml(text)}" class="opt-text form-input" style="font-size:0.8125rem;padding:0.4375rem 0.625rem;">
            <div>
                <div class="opt-kw-tags" style="display:flex;flex-wrap:wrap;gap:0.25rem;padding:0.375rem;border:1px solid var(--border-color);border-radius:var(--radius-md);background:var(--bg-surface);min-height:32px;">${kwChips}</div>
                <input type="text" placeholder="Keywords → Enter para agregar" class="opt-kw-input form-input" style="margin-top:0.25rem;font-size:0.75rem;padding:0.3125rem 0.5rem;" onkeydown="handleOptionKeywordInput(event,this)">
            </div>
            <select class="opt-next form-select" style="font-size:0.8125rem;padding:0.4375rem 0.625rem;">
                <option value="">— Ningún nodo destino —</option>
                ${nodeOptions}
            </select>
        </div>`;

    div._optionKeywords = [...keywords];
    container.appendChild(div);
}

function moveOption(btn, dir) {
    const row  = btn.closest('.fb-opt-row');
    const cont = row.parentElement;
    const rows = Array.from(cont.querySelectorAll('.fb-opt-row'));
    const idx  = rows.indexOf(row);
    const swap = rows[idx + dir];
    if (!swap) return;
    if (dir === -1) cont.insertBefore(row, swap);
    else cont.insertBefore(swap, row);
    renumberOptions();
}

function handleOptionKeywordInput(e, input) {
    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = input.value.trim().replace(/,$/, '');
        if (!val) return;
        const optDiv = input.closest('[data-option-index]');
        if (!optDiv._optionKeywords) optDiv._optionKeywords = [];
        if (!optDiv._optionKeywords.includes(val)) {
            optDiv._optionKeywords.push(val);
            const tagsDiv = optDiv.querySelector('.opt-kw-tags');
            const ki = optDiv._optionKeywords.length - 1;
            const span = document.createElement('span');
            span.className = 'fb-chip fb-chip-opt';
            span.innerHTML = `${escapeHtml(val)}<button type="button" class="fb-chip-del" onclick="removeOptionKeyword(this,${ki})">×</button>`;
            tagsDiv.appendChild(span);
        }
        input.value = '';
    }
}

function removeOptionKeyword(btn, ki) {
    const optDiv = btn.closest('[data-option-index]');
    if (optDiv._optionKeywords) optDiv._optionKeywords.splice(ki, 1);
    btn.closest('.fb-chip').remove();
}

function renumberOptions() {
    document.querySelectorAll('#options-container .fb-opt-row').forEach((div, i) => {
        div.dataset.optionIndex = i;
        const label = div.querySelector('.fb-opt-row-label');
        if (label) label.textContent = `Opción ${i + 1}`;
    });
}

function updateCharCounter(val) {
    const len     = (val || '').length;
    const counter = document.getElementById('msg-char-counter');
    if (!counter) return;
    counter.textContent = `${len} caracteres`;
    counter.className   = 'fb-char-counter' + (len > 4096 ? ' over' : len > 1000 ? ' warn' : '');
}

function updateMessagePreview() {
    const msg     = document.getElementById('node-message').value;
    const preview = document.getElementById('message-preview');
    updateCharCounter(msg);
    if (msg.trim()) {
        preview.classList.remove('hidden');
        preview.querySelector('div').textContent = msg;
    } else {
        preview.classList.add('hidden');
    }
}

document.getElementById('node-message').addEventListener('input', updateMessagePreview);

async function saveNode() {
    const name    = document.getElementById('node-name').value.trim();
    const message = document.getElementById('node-message').value.trim();

    if (!name || !message) {
        showToast('El nombre y el mensaje son obligatorios.', 'error');
        return;
    }

    const options = [];
    document.querySelectorAll('#options-container .fb-opt-row').forEach(div => {
        const nextVal = div.querySelector('.opt-next').value || null;
        options.push({
            optionText:     div.querySelector('.opt-text').value.trim(),
            optionKeywords: div._optionKeywords || [],
            nextNodeId:     nextVal ? parseInt(nextVal) : null,
            positionOrder:  parseInt(div.dataset.optionIndex),
        });
    });

    const nodeId = document.getElementById('node-id').value;
    const nextNodeVal = document.getElementById('node-next').value || null;

    const payload = {
        id:               nodeId ? parseInt(nodeId) : null,
        name,
        triggerKeywords:  nodeKeywords,
        messageText:      message,
        nextNodeId:       nextNodeVal ? parseInt(nextNodeVal) : null,
        isRoot:           document.getElementById('node-is-root').checked,
        requiresCalendar: document.getElementById('node-requires-calendar').checked,
        matchAnyInput:    document.getElementById('node-match-any-input').checked,
        isFarewell:       document.getElementById('node-is-farewell').checked,
        positionOrder:    parseInt(document.getElementById('node-order').value),
        isActive:         document.getElementById('node-is-active').checked,
        options,
    };

    try {
        const res  = await apiFetch('/api/flows', {
            method:  'POST',
            headers: {'Content-Type': 'application/json'},
            body:    JSON.stringify(payload),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        closeNodeModal();
        showToast('Nodo guardado correctamente', 'success');
        await loadNodes();
    } catch (e) {
        showToast('Error al guardar: ' + e.message, 'error');
    }
}

async function deleteNode(id, name) {
    showConfirmModal(
        `¿Eliminar el nodo <strong>${escapeHtml(name)}</strong>? Se quitarán todas sus opciones y referencias.`,
        {
            title:       'Eliminar nodo',
            confirmText: 'Eliminar',
            isDanger:    true,
            onConfirm:   async function() {
                try {
                    const res  = await apiFetch('/api/flows/' + id, {method: 'DELETE'});
                    const data = await res.json();
                    if (!data.success) throw new Error(data.error);
                    showToast('Nodo eliminado', 'warning');
                    await loadNodes();
                } catch (e) {
                    showToast('Error al eliminar: ' + e.message, 'error');
                }
            },
        }
    );
}

async function exportFlow() {
    const res  = await apiFetch('/api/flows');
    const data = await res.json();
    const blob = new Blob([JSON.stringify({version:'1.0', exported_at: new Date().toISOString(), nodes: data.data || []}, null, 2)], {type: 'application/json'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'flow_export_' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
}

async function importFlow(event) {
    const file = event.target.files[0];
    if (!file) return;
    const text = await file.text();
    event.target.value = '';
    showConfirmModal(
        'Importar este flujo <strong>reemplazará todos los nodos existentes</strong>. Esta acción no se puede deshacer.',
        {
            title:       'Importar flujo',
            confirmText: 'Importar',
            isDanger:    true,
            onConfirm:   async function() {
                try {
                    const res  = await apiFetch('/api/flows/import', {
                        method:  'POST',
                        headers: {'Content-Type': 'application/json'},
                        body:    text,
                    });
                    const data = await res.json();
                    if (!data.success) throw new Error(data.error);
                    showToast('Importación completada', 'success');
                    await loadNodes();
                } catch (e) {
                    showToast('Error al importar: ' + e.message, 'error');
                }
            },
        }
    );
}

async function sendSimMessage() {
    const input = document.getElementById('sim-input');
    const msg   = input.value.trim();
    if (!msg) return;
    input.value = '';

    appendSimMessage(msg, 'user');

    try {
        const res  = await apiFetch('/api/simulate-flow', {
            method:  'POST',
            headers: {'Content-Type': 'application/json'},
            body:    JSON.stringify({message: msg}),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        const result   = data.data || {};
        const prefix   = result.type === 'calendar' ? '[Calendario] ' : '';
        appendSimMessage(prefix + result.response, 'bot');
    } catch (e) {
        appendSimMessage('Error: ' + e.message, 'bot');
    }
}

function formatWhatsApp(text) {
    const d = document.createElement('div');
    d.textContent = String(text ?? '');
    let s = d.innerHTML;
    s = s.replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>');
    s = s.replace(/_([^_\n]+)_/g, '<em>$1</em>');
    s = s.replace(/`([^`\n]+)`/g, '<code style="background:rgba(0,0,0,0.1);padding:0.1em 0.35em;border-radius:3px;font-size:0.85em;font-family:monospace;">$1</code>');
    s = s.replace(/\n/g, '<br>');
    return s;
}

function appendSimMessage(text, sender, nodeName) {
    const chat = document.getElementById('sim-chat');
    const empty = chat.querySelector('.fb-sim-empty');
    if (empty) empty.remove();

    const wrap = document.createElement('div');
    wrap.className = `fb-sim-bubble-wrap ${sender}`;

    const bubble = document.createElement('div');
    bubble.className = `fb-sim-bubble ${sender}`;
    bubble.innerHTML = formatWhatsApp(text);
    wrap.appendChild(bubble);

    if (sender === 'bot' && nodeName) {
        const label = document.createElement('div');
        label.className = 'fb-sim-node-label';
        label.textContent = 'Nodo: ' + nodeName;
        wrap.appendChild(label);
    }

    chat.appendChild(wrap);
    chat.scrollTop = chat.scrollHeight;
}

async function resetSimulator() {
    await apiFetch('/api/simulate-flow', {
        method:  'POST',
        headers: {'Content-Type': 'application/json'},
        body:    JSON.stringify({message: '', reset: true}),
    });
    const chat = document.getElementById('sim-chat');
    chat.innerHTML = '<div class="fb-sim-empty">Conversación reiniciada. Escribe para comenzar.</div>';
}

function showToast(msg, type) {
    const colors = {success: '#16a34a', error: '#dc2626', warning: '#d97706', info: '#2563eb'};
    const div = document.createElement('div');
    div.style.cssText = `position:fixed;top:5rem;right:1rem;background:${colors[type]||colors.success};color:#fff;padding:0.625rem 1.25rem;border-radius:0.5rem;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:9999;font-size:0.875rem;font-weight:500;`;
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(() => { div.style.opacity = '0'; div.style.transition = 'opacity 0.3s'; setTimeout(() => div.remove(), 300); }, 2700);
}

function onIsRootChange() {
    const isRoot = document.getElementById('node-is-root').checked;
    const row    = document.getElementById('match-any-input-row');
    if (isRoot) {
        row.classList.remove('hidden');
    } else {
        row.classList.add('hidden');
        document.getElementById('node-match-any-input').checked = false;
        document.getElementById('match-any-notice').classList.add('hidden');
        document.getElementById('keywords-input').disabled = false;
        document.getElementById('keywords-tags').style.opacity = '';
    }
}

function onMatchAnyInputChange() {
    const isChecked = document.getElementById('node-match-any-input').checked;
    const notice    = document.getElementById('match-any-notice');
    const kwInput   = document.getElementById('keywords-input');
    const kwTags    = document.getElementById('keywords-tags');
    if (isChecked) {
        notice.classList.remove('hidden');
        kwInput.disabled = true;
        kwTags.style.opacity = '0.4';
    } else {
        notice.classList.add('hidden');
        kwInput.disabled = false;
        kwTags.style.opacity = '';
    }
}

function onCalendarToggle() {
    const chk    = document.getElementById('node-requires-calendar');
    const notice = document.getElementById('calendar-notice');

    if (chk.checked && typeof CALENDAR_ENABLED !== 'undefined' && !CALENDAR_ENABLED) {
        chk.checked = false;
        notice.classList.add('hidden');
        return;
    }

    if (chk.checked) notice.classList.remove('hidden');
    else             notice.classList.add('hidden');
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// Close node modal when clicking backdrop outside the modal-box
document.getElementById('node-modal').addEventListener('click', function(e) {
    if (e.target === this) closeNodeModal();
});

// Close node modal on Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const modal = document.getElementById('node-modal');
        if (modal && modal.classList.contains('visible')) closeNodeModal();
    }
});

loadNodes();
