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
    let dotClass = 'bg-gray-300';
    let textClass = 'text-gray-500';
    
    if (status === 'connected') { dotClass = 'bg-green-500'; textClass = 'text-green-600 dark:text-green-400'; }
    else if (status === 'error') { dotClass = 'bg-red-500'; textClass = 'text-red-600 dark:text-red-400'; }
    else if (status === 'not_configured') { dotClass = 'bg-yellow-500'; textClass = 'text-yellow-600 dark:text-yellow-400'; }
    
    el.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${dotClass === 'bg-green-500' ? '#16a34a' : dotClass === 'bg-red-500' ? '#dc2626' : dotClass === 'bg-yellow-500' ? '#d97706' : 'var(--text-muted)'};margin-right:0.25rem;"></span><span style="color:${textClass.includes('green') ? 'var(--color-success)' : textClass.includes('red') ? 'var(--color-error)' : textClass.includes('yellow') ? 'var(--color-warning)' : 'var(--text-muted)'}">${message}</span>`;
}

async function loadCredentials() {
    try {
        const response = await fetch(BASE_PATH + '/api/get-credentials.php', { cache: 'no-store' });
        const data = await response.json();
        if (!data.success) return;

        const waForm = document.getElementById('whatsapp-form');
        waForm.querySelector('[name="phone_number_id"]').value = data.whatsapp.phone_number_id || '';
        waForm.querySelector('[name="access_token"]').placeholder = data.whatsapp.access_token ? '•••••••• (guardado)' : 'Ingresa el Access Token';
        waForm.querySelector('[name="app_secret"]').placeholder = data.whatsapp.app_secret ? '•••••••• (guardado)' : 'Ingresa el App Secret';
        waForm.querySelector('[name="verify_token"]').value = data.whatsapp.verify_token || '';
        updateStatus('wa-status', data.whatsapp.has_credentials ? 'connected' : 'not_configured',
            data.whatsapp.has_credentials ? 'Configurado' : 'No configurado');

        const oaiForm = document.getElementById('openai-form');
        oaiForm.querySelector('[name="api_key"]').placeholder = data.openai.api_key ? '•••••••• (guardada)' : 'Ingresa la API Key';
        oaiForm.querySelector('[name="model"]').value = data.openai.model || 'gpt-3.5-turbo';
        updateStatus('oai-status', data.openai.has_credentials ? 'connected' : 'not_configured',
            data.openai.has_credentials ? 'Configurado' : 'No configurado');

        const gcForm = document.getElementById('google-form');
        gcForm.querySelector('[name="client_id"]').value = data.google.client_id || '';
        gcForm.querySelector('[name="client_secret"]').placeholder = data.google.client_secret ? '•••••••• (guardado)' : 'Ingresa el Client Secret';
        gcForm.querySelector('[name="calendar_id"]').value = data.google.calendar_id || '';
        gcForm.querySelector('[name="access_token"]').placeholder = data.google.access_token ? '•••••••• (guardado)' : 'Ingresa el Access Token';
        gcForm.querySelector('[name="refresh_token"]').placeholder = data.google.refresh_token ? '•••••••• (guardado)' : 'Ingresa el Refresh Token';
        updateStatus('gc-status', data.google.has_credentials ? 'connected' : 'not_configured',
            data.google.has_credentials ? 'Configurado' : 'No configurado');
    } catch (e) {
        console.error('Error loading credentials:', e);
    }
}

async function saveCredentials(service, formData) {
    try {
        const payload = { service, ...formData };
        const res = await fetch(BASE_PATH + '/api/save-credentials.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message || 'Guardado exitosamente');
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
        const response = await fetch(BASE_PATH + '/api/test-connection.php?service=' + service, { cache: 'no-store' });
        const data = await response.json();
        
        updateStatus(statusMap[service], data.status || (data.success ? 'connected' : 'error'), 
            data.success ? data.message : (data.message || 'Error'));
        showToast(data.message, data.success ? 'success' : 'error');
    } catch (e) {
        updateStatus(statusMap[service], 'error', 'Error de conexión');
        showToast('Error al probar conexión', 'error');
    }
}

document.getElementById('whatsapp-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const fd = new FormData(this);
    const data = {};
    fd.forEach((v, k) => { if (v) data[k] = v; });
    saveCredentials('whatsapp', data);
});

document.getElementById('openai-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const fd = new FormData(this);
    const data = {};
    fd.forEach((v, k) => { if (v) data[k] = v; });
    saveCredentials('openai', data);
});

document.getElementById('google-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const fd = new FormData(this);
    const data = {};
    fd.forEach((v, k) => { if (v) data[k] = v; });
    saveCredentials('google', data);
});

loadCredentials();
