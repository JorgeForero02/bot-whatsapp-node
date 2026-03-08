async function loadSettings() {
    try {
        const response = await fetch('/api/settings', { cache: 'no-store' });
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
        botMode: document.querySelector('input[name="bot-mode"]:checked')?.value || 'ai'
    };
    
    try {
        const saveRes = await fetch('/api/settings', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                system_prompt: settings.systemPrompt,
                welcome_message: settings.welcomeMessage,
                error_message: settings.errorMessage,
                context_messages_count: String(settings.contextMessagesCount),
                calendar_enabled: String(settings.calendarEnabled),
                bot_mode: settings.botMode
            })
        });
        
        const data = await saveRes.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Error al guardar');
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        showToast('Error al guardar la configuración: ' + error.message, 'error');
        return;
    }
    
    showToast('Configuración guardada correctamente', 'success');
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
