function togglePassword(btn) {
    const input = btn.previousElementSibling || btn.parentElement.querySelector('input[type="password"], input[type="text"]');
    if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = 'Ocultar';
    } else {
        input.type = 'password';
        btn.textContent = 'Mostrar';
    }
}

function updateStatus(elementId, status, message) {
    const el = document.getElementById(elementId);
    let dotColor  = 'var(--text-muted)';
    let textColor = 'var(--text-muted)';

    if (status === 'connected')      { dotColor = 'var(--color-success)'; textColor = 'var(--color-success)'; }
    else if (status === 'error')     { dotColor = 'var(--color-error)';   textColor = 'var(--color-error)'; }
    else if (status === 'not_configured') { dotColor = 'var(--color-warning)'; textColor = 'var(--color-warning)'; }

    el.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${dotColor};margin-right:0.25rem;"></span><span style="color:${textColor};">${message}</span>`;
}

async function loadCredentials() {
    try {
        const [credRes, settingsRes] = await Promise.all([
            fetch('/api/credentials', { cache: 'no-store' }),
            fetch('/api/settings', { cache: 'no-store' }),
        ]);
        const credData = await credRes.json();
        if (credData.success) {
            const d = credData.data;
            updateStatus('wa-status', d.whatsapp.configured ? 'connected' : 'not_configured',
                d.whatsapp.configured ? 'Configurado' : 'No configurado');
            updateStatus('oai-status', d.openai.configured ? 'connected' : 'not_configured',
                d.openai.configured ? 'Configurado' : 'No configurado');
            updateStatus('gc-status', d.google.configured ? 'connected' : 'not_configured',
                d.google.configured ? 'Configurado' : 'No configurado');
        }
        if (settingsRes.ok) {
            const settingsData = await settingsRes.json();
            if (settingsData.success && settingsData.data) {
                const modelSel = document.querySelector('#openai-form select[name="model"]');
                if (modelSel && settingsData.data.openai_model) {
                    modelSel.value = settingsData.data.openai_model;
                }
            }
        }
    } catch (e) {
        console.error('Error loading credentials:', e);
    }
}

async function saveCredentials(service, formData) {
    try {
        const res = await fetch('/api/credentials/' + service, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        const data = await res.json();
        if (data.success) {
            showToast('Guardado exitosamente');
            loadCredentials();
        } else {
            showToast(data.error || 'Error al guardar', 'error');
        }
    } catch (e) {
        showToast('Error de conexión', 'error');
    }
}

async function testConnection(service) {
    const statusMap = { whatsapp: 'wa-status', openai: 'oai-status', google: 'gc-status' };
    updateStatus(statusMap[service], '', 'Probando...');

    try {
        const response = await fetch('/api/test-connection?service=' + service, { cache: 'no-store' });
        const data = await response.json();

        if (data.success) {
            updateStatus(statusMap[service], 'connected', data.message || 'Configurado correctamente');
            showToast(data.message || 'Conexión exitosa', 'success');
        } else {
            updateStatus(statusMap[service], 'error', data.error || 'No configurado');
            showToast(data.error || 'Error al probar conexión', 'error');
        }
    } catch (e) {
        updateStatus(statusMap[service], 'error', 'Error de conexión');
        showToast('Error al probar conexión', 'error');
    }
}

document.getElementById('whatsapp-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const fd = new FormData(this);
    const data = {};
    if (fd.get('phone_number_id')) data.phoneNumberId = fd.get('phone_number_id');
    if (fd.get('access_token'))    data.accessToken   = fd.get('access_token');
    if (fd.get('app_secret'))      data.appSecret     = fd.get('app_secret');
    if (fd.get('verify_token'))    data.verifyToken   = fd.get('verify_token');
    saveCredentials('whatsapp', data);
});

document.getElementById('openai-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const fd = new FormData(this);
    const credData = {};
    if (fd.get('api_key')) credData.apiKey = fd.get('api_key');
    if (credData.apiKey) saveCredentials('openai', credData);
    if (fd.get('model')) {
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({openai_model: fd.get('model')}),
            });
            if (!credData.apiKey) {
                showToast('Modelo guardado', 'success');
                loadCredentials();
            }
        } catch { /* ignore */ }
    }
});

document.getElementById('google-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const fd = new FormData(this);
    const data = {};
    if (fd.get('client_id'))      data.clientId     = fd.get('client_id');
    if (fd.get('client_secret'))  data.clientSecret  = fd.get('client_secret');
    if (fd.get('calendar_id'))    data.calendarId    = fd.get('calendar_id');
    if (fd.get('access_token'))   data.accessToken   = fd.get('access_token');
    if (fd.get('refresh_token'))  data.refreshToken  = fd.get('refresh_token');
    saveCredentials('google', data);
});

loadCredentials();
