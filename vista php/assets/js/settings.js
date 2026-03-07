async function loadSettings() {
    try {
        const response = await fetch(BASE_PATH + '/api/get-settings.php', { cache: 'no-store' });
        const data = await response.json();
        
        if (data.success && data.settings) {
            const s = data.settings;
            
            if (s.systemPrompt) document.getElementById('system-prompt').value = s.systemPrompt;
            if (s.welcomeMessage) document.getElementById('welcome-message').value = s.welcomeMessage;
            if (s.errorMessage) document.getElementById('error-message').value = s.errorMessage;
            if (s.contextMessagesCount !== undefined) document.getElementById('context-messages-count').value = s.contextMessagesCount;
            if (s.calendarEnabled !== undefined) {
                document.getElementById('calendar-enabled').checked = s.calendarEnabled;
                updateCalendarStatusInfo(s.calendarEnabled);
            }
            if (s.botMode) {
                const radio = document.querySelector(`input[name="bot-mode"][value="${s.botMode}"]`);
                if (radio) radio.checked = true;
                updateClassicModeLink(s.botMode);
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
        const saveRes = await fetch(BASE_PATH + '/api/save-settings.php', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(settings)
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
        info.innerHTML = '<span class="text-green-600 dark:text-green-400">\u2705 El m\u00f3dulo de calendario est\u00e1 activo. Los usuarios pueden agendar citas por WhatsApp.</span>';
    } else {
        info.innerHTML = '<span class="text-yellow-600 dark:text-yellow-400">\u26a0\ufe0f El m\u00f3dulo de calendario est\u00e1 desactivado. Los flujos de agendamiento activos ser\u00e1n reseteados.</span>';
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
