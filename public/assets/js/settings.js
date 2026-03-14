async function loadSettings() {
    try {
        const response = await apiFetch('/api/settings', { cache: 'no-store' });
        const data = await response.json();
        
        if (data.success && data.data) {
            const s = data.data;
            
            if (s.system_prompt) document.getElementById('system-prompt').value = s.system_prompt;
            if (s.welcome_message) document.getElementById('welcome-message').value = s.welcome_message;
            if (s.error_message) document.getElementById('error-message').value = s.error_message;
            if (s.context_messages_count !== undefined) document.getElementById('context-messages-count').value = s.context_messages_count;
            if (s.calendar_enabled !== undefined) {
                document.getElementById('calendar-enabled').checked = s.calendar_enabled === 'true';
                updateCalendarStatusInfo(s.calendar_enabled === 'true');
            }
            if (s.bot_mode) {
                const radio = document.querySelector(`input[name="bot-mode"][value="${s.bot_mode}"]`);
                if (radio) radio.checked = true;
                updateClassicModeLink(s.bot_mode);
            }
            if (s.openai_embedding_model) {
                document.getElementById('openai-embedding-model').value = s.openai_embedding_model;
            }
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

async function saveSettings() {
    const settings = {
        systemPrompt: document.getElementById('system-prompt').value,
        welcomeMessage: document.getElementById('welcome-message').value,
        errorMessage: document.getElementById('error-message').value,
        contextMessagesCount: parseInt(document.getElementById('context-messages-count').value),
        calendarEnabled: document.getElementById('calendar-enabled').checked,
        botMode: document.querySelector('input[name="bot-mode"]:checked')?.value || 'ai',
        embeddingModel: document.getElementById('openai-embedding-model').value
    };
    
    try {
        const saveRes = await apiFetch('/api/settings', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                system_prompt: settings.systemPrompt,
                welcome_message: settings.welcomeMessage,
                error_message: settings.errorMessage,
                context_messages_count: String(settings.contextMessagesCount),
                calendar_enabled: String(settings.calendarEnabled),
                bot_mode: settings.botMode,
                openai_embedding_model: settings.embeddingModel
            })
        });
        
        const data = await saveRes.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Error al guardar');
        }

        if (data.reindexJobId) {
            showToast('⚙️ Configuración guardada. Reindexando documentos...', 'info');
        } else {
            showToast('Configuración guardada correctamente', 'success');
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        showToast('Error al guardar la configuración: ' + error.message, 'error');
        return;
    }
}

function resetSettings() {
    showConfirmModal('¿Restablecer la configuración a los valores por defecto?', {
        title: 'Restablecer configuración',
        confirmText: 'Restablecer',
        cancelText: 'Cancelar',
        isDanger: false,
        onConfirm: async () => {
            document.getElementById('system-prompt').value = '';
            document.getElementById('welcome-message').value = '';
            document.getElementById('error-message').value = '';
            document.getElementById('context-messages-count').value = '5';
            document.getElementById('calendar-enabled').checked = true;

            await saveSettings();
            showToast('Configuración restablecida a valores por defecto', 'info');
        },
    });
}

async function forceReindex() {
    const btn = document.getElementById('btn-reindex');
    const status = document.getElementById('reindex-status');
    btn.disabled = true;
    status.textContent = 'Iniciando reindexación...';
    try {
        const res = await apiFetch('/api/reindex', { method: 'POST' });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Error desconocido');
        status.textContent = `⚙️ Reindexando con ${data.model}...`;
        pollReindexProgress(data.reindexJobId, btn, status);
    } catch (error) {
        status.textContent = '';
        btn.disabled = false;
        showToast('Error al iniciar reindexación: ' + error.message, 'error');
    }
}

function pollReindexProgress(jobId, btn, status) {
    const interval = setInterval(async () => {
        try {
            const res = await apiFetch(`/api/reindex/progress/${jobId}`, { cache: 'no-store' });
            const data = await res.json();
            if (!data.success) return;
            const { progress, status: jobStatus } = data.data;
            if (jobStatus === 'done') {
                clearInterval(interval);
                status.textContent = '';
                btn.disabled = false;
                showToast('✅ Reindexación completada. Los documentos están listos.', 'success');
            } else if (jobStatus === 'failed') {
                clearInterval(interval);
                status.textContent = '';
                btn.disabled = false;
                showToast('❌ La reindexación falló. Revisa los logs del servidor.', 'error');
            } else {
                status.textContent = `⚙️ Reindexando... ${progress ?? 0}%`;
            }
        } catch (_) {}
    }, 2000);
}

function updateCalendarStatusInfo(enabled) {
    const info = document.getElementById('calendar-status-info');
    if (enabled) {
        info.innerHTML = '<span style="color:var(--color-success);font-size:0.8125rem;">✓ El módulo de calendario está activo. Los usuarios pueden agendar citas por WhatsApp.</span>';
    } else {
        info.innerHTML = '<span style="color:var(--color-warning);font-size:0.8125rem;">⚠ El módulo de calendario está desactivado. Los flujos de agendamiento activos serán reseteados.</span>';
    }
}

function updateClassicModeLink(mode) {
    const link = document.getElementById('classic-mode-link');
    if (link) link.classList.toggle('hidden', mode !== 'classic');
}

document.getElementById('calendar-enabled').addEventListener('change', function() {
    updateCalendarStatusInfo(this.checked);
});

document.querySelectorAll('input[name="bot-mode"]').forEach(radio => {
    radio.addEventListener('change', e => updateClassicModeLink(e.target.value));
});

loadSettings();
