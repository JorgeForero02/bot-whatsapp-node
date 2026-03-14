const STEPS = [
    { name: 'whatsapp_credentials', label: 'WhatsApp',    icon: '' },
    { name: 'openai_credentials',   label: 'OpenAI',      icon: '' },
    { name: 'bot_personality',      label: 'Personalidad',icon: '' },
    { name: 'calendar_setup',       label: 'Calendario',  icon: '' },
    { name: 'flow_builder',         label: 'Flujos',      icon: '' },
    { name: 'test_connection',      label: 'Pruebas',     icon: '' },
    { name: 'go_live',              label: 'Activar',     icon: '' },
];

const INDUSTRY_PROMPTS = {
    clinica: `Eres un asistente virtual de una clínica médica. Tu función es orientar a los pacientes, informar sobre servicios, horarios de atención y ayudar a agendar citas médicas. Responde siempre con empatía y profesionalismo. Si hay una urgencia médica, indica al usuario que llame al servicio de emergencias.`,
    restaurante: `Eres el asistente virtual de un restaurante. Puedes informar sobre el menú, horarios, reservaciones y promociones. Responde de forma amigable y apetitosa. Ayuda a los clientes a realizar pedidos o reservar mesas cuando sea posible.`,
    tienda: `Eres el asistente virtual de una tienda. Ayuda a los clientes con información sobre productos, precios, disponibilidad, envíos y devoluciones. Sé amable, directo y siempre ofrece alternativas si un producto no está disponible.`,
    soporte: `Eres un agente de soporte técnico. Tu misión es ayudar a resolver problemas técnicos paso a paso, con paciencia y claridad. Si no puedes resolver el problema, ofrece escalar a un técnico humano. Siempre confirma que el problema fue resuelto antes de cerrar la conversación.`,
};

let progressData = null;
let currentStepName = null;

function showOnboardingError(title, detail) {
    var c = document.getElementById('wizard-container');
    if (!c) return;
    var safe = String(detail).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').substring(0, 3000);
    c.innerHTML = '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:0.5rem;padding:1.25rem;">'
        + '<p style="font-weight:600;color:#b91c1c;margin:0 0 0.5rem;">' + title + '</p>'
        + '<pre style="font-size:0.7rem;color:#dc2626;overflow:auto;max-height:12rem;white-space:pre-wrap;margin:0 0 0.75rem;background:#fff;padding:0.5rem;border-radius:0.25rem;border:1px solid #fca5a5;">' + safe + '</pre>'
        + '<button onclick="loadProgress()" style="padding:0.375rem 0.875rem;background:#075E54;color:white;border:none;border-radius:0.375rem;font-size:0.875rem;cursor:pointer;">Reintentar</button>'
        + '</div>';
}

async function loadProgress() {
    try {
        const res  = await apiFetch('/api/onboarding-progress', { cache: 'no-store' });
        const rawText = await res.text();
        let data;
        try {
            data = JSON.parse(rawText);
        } catch (parseErr) {
            showOnboardingError('Error del servidor (respuesta no JSON):', rawText);
            return;
        }
        if (!data.success) throw new Error(data.error);
        const progress  = data.data || {};
        progressData    = progress.steps || [];
        currentStepName = progress.currentStep ? progress.currentStep.name : (progress.completedCount >= progress.totalCount ? 'complete' : null);
        renderWizard();
    } catch (e) {
        showOnboardingError('Error al cargar configuración:', e.message);
    }
}

function renderWizard() {
    const completed = progressData.filter(s => s.isCompleted || s.isSkipped).length;
    const pct       = Math.round((completed / STEPS.length) * 100);

    document.getElementById('progress-bar').style.width = pct + '%';
    document.getElementById('progress-label').textContent = `Paso ${completed + 1} de ${STEPS.length}`;

    // Step indicators
    document.getElementById('step-indicators').innerHTML = STEPS.map((s, i) => {
        const stepData = progressData.find(p => p.name === s.name);
        const done     = stepData && (stepData.isCompleted || stepData.isSkipped);
        const active   = s.name === currentStepName;
        const dotBg    = done ? 'var(--color-accent)' : active ? 'var(--color-primary)' : 'var(--bg-elevated)';
        const dotColor = (done || active) ? '#fff' : 'var(--text-muted)';
        const dotShadow= active ? '0 0 0 4px rgba(7,94,84,0.2)' : 'none';
        const labelColor = active ? 'var(--color-primary)' : 'var(--text-muted)';
        const labelWeight = active ? '600' : '400';
        return `<div style="display:flex;flex-direction:column;align-items:center;gap:0.25rem;" title="${s.label}">
            <div style="width:2rem;height:2rem;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;background:${dotBg};color:${dotColor};box-shadow:${dotShadow};transition:all 0.2s;flex-shrink:0;">${i + 1}</div>
            <span style="font-size:0.6875rem;color:${labelColor};font-weight:${labelWeight};white-space:nowrap;">${s.label}</span>
        </div>`;
    }).join('');

    // If all done, show completion screen
    if (currentStepName === 'complete') {
        renderCompletionScreen();
        return;
    }

    const stepObj = STEPS.find(s => s.name === currentStepName);
    if (!stepObj) return;

    renderStep(stepObj);
}

function renderStep(stepObj) {
    const container = document.getElementById('wizard-container');
    let html = '';

    switch (stepObj.name) {
        case 'whatsapp_credentials': html = renderStepWhatsApp(); break;
        case 'openai_credentials':   html = renderStepOpenAI();   break;
        case 'bot_personality':      html = renderStepPersonality(); break;
        case 'calendar_setup':       html = renderStepCalendar(); break;
        case 'flow_builder':         html = renderStepFlowBuilder(); break;
        case 'test_connection':      html = renderStepTest();     break;
        case 'go_live':              html = renderStepGoLive();   break;
    }

    container.innerHTML = html;
    bindStepEvents(stepObj.name);
}

function stepCard(icon, title, subtitle, bodyHtml, footerHtml) {
    return `
    <div class="card">
        <div style="background:linear-gradient(135deg,var(--color-primary),var(--color-secondary));padding:1.5rem;">
            <h2 style="font-size:1.375rem;font-weight:700;color:#fff;margin:0 0 0.25rem;">${title}</h2>
            <p style="font-size:0.875rem;color:rgba(255,255,255,0.8);margin:0;">${subtitle}</p>
        </div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:1.25rem;">${bodyHtml}</div>
        <div class="card-footer" style="display:flex;justify-content:flex-end;gap:0.75rem;">${footerHtml}</div>
    </div>`;
}

function renderStepWhatsApp() {
    const webhookUrl = (typeof BASE_PATH !== 'undefined' ? window.location.origin + BASE_PATH : window.location.origin) + '/webhook';
    return stepCard('WhatsApp', 'Credenciales de WhatsApp', 'Conecta tu número de WhatsApp Business para que el bot pueda enviar y recibir mensajes.',
    `<div style="display:flex;flex-direction:column;gap:1rem;">
        <div class="alert alert-info">
            <div style="font-size:0.75rem;font-weight:600;margin-bottom:0.375rem;">URL del Webhook (cópiala en Meta Developer Console)</div>
            <div style="display:flex;align-items:center;gap:0.5rem;">
                <code id="webhook-url-display" style="flex:1;font-size:0.75rem;background:var(--bg-surface);border:1px solid var(--color-info-border);border-radius:var(--radius-sm);padding:0.375rem 0.5rem;word-break:break-all;color:var(--color-info);">${webhookUrl}</code>
                <button onclick="navigator.clipboard.writeText('${webhookUrl}').then(()=>{ this.textContent='\u2713'; setTimeout(()=>this.textContent='Copiar',1500); })" class="btn btn-primary btn-sm" style="flex-shrink:0;">Copiar</button>
            </div>
            <p class="form-hint" style="margin-top:0.375rem;">En Meta for Developers &rarr; tu App &rarr; WhatsApp &rarr; Configuración &rarr; Webhook.</p>
        </div>
        <div class="form-group"><label class="form-label">Phone Number ID</label><input id="wa-phone-id" type="text" placeholder="123456789012345" class="form-input"></div>
        <div class="form-group"><label class="form-label">Access Token</label><input id="wa-token" type="password" placeholder="EAAxxxxxxx..." class="form-input"></div>
        <div class="form-group"><label class="form-label">App Secret</label><input id="wa-secret" type="password" placeholder="abc123def456..." class="form-input"></div>
        <div class="form-group"><label class="form-label">Verify Token</label><input id="wa-verify" type="text" placeholder="mi_token_secreto" class="form-input"><p class="form-hint">Token personalizado para verificar el webhook en Meta Developer Console.</p></div>
        <div id="wa-save-result"></div>
        <div id="wa-test-result"></div>
    </div>`,
    `<button onclick="saveWhatsApp()" id="btn-wa-save" class="btn btn-secondary btn-md">Guardar</button>
     <button onclick="testWhatsApp()" id="btn-wa-test" class="btn btn-secondary btn-md" disabled>Probar conexión</button>
     <button onclick="advanceStep('whatsapp_credentials')" id="btn-wa-continue" class="btn btn-primary btn-md" disabled>Continuar</button>`);
}

function renderStepOpenAI() {
    return stepCard('OpenAI', 'OpenAI y Modo de Operación', 'Configura tu API Key de OpenAI o elige el modo Bot Clásico sin IA.',
    `<div style="display:flex;flex-direction:column;gap:1.25rem;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
            <label style="cursor:pointer;">
                <input type="radio" name="bot-mode-radio" value="ai" class="bot-mode-radio" style="display:none;" checked>
                <div class="bot-mode-card-ob active" style="border:2px solid var(--color-primary);background:rgba(7,94,84,0.05);border-radius:var(--radius-xl);padding:1rem;transition:all 0.15s;">
                    <p style="font-weight:700;color:var(--text-primary);margin:0 0 0.25rem;">Modo IA</p>
                    <p class="form-hint" style="margin:0;">Usa OpenAI para respuestas inteligentes y comprensión del lenguaje natural.</p>
                </div>
            </label>
            <label style="cursor:pointer;">
                <input type="radio" name="bot-mode-radio" value="classic" class="bot-mode-radio" style="display:none;">
                <div class="bot-mode-card-ob" style="border:2px solid var(--border-color);background:transparent;border-radius:var(--radius-xl);padding:1rem;transition:all 0.15s;">
                    <p style="font-weight:700;color:var(--text-primary);margin:0 0 0.25rem;">Modo Clásico</p>
                    <p class="form-hint" style="margin:0;">Flujos predefinidos por palabras clave. No requiere OpenAI.</p>
                </div>
            </label>
        </div>
        <div id="openai-fields" style="display:flex;flex-direction:column;gap:1rem;">
            <div class="form-group"><label class="form-label">API Key</label><input id="oai-key" type="password" placeholder="sk-..." class="form-input"></div>
            <div class="form-group"><label class="form-label">Modelo</label>
            <select id="oai-model" class="form-select">
                <option value="gpt-3.5-turbo" selected>GPT-3.5 Turbo (default)</option>
                <option value="gpt-4o-mini">GPT-4o Mini (económico)</option>
                <option value="gpt-4o">GPT-4o (más capaz)</option>
            </select></div>
            <div class="form-group"><label class="form-label">Modelo de Embeddings</label><input id="oai-embedding" type="text" value="text-embedding-ada-002" placeholder="text-embedding-ada-002" class="form-input"></div>
            <div id="oai-test-result"></div>
        </div>
        <div id="classic-notice" class="hidden alert alert-warning">
            Has elegido el modo Clásico. OpenAI no será utilizado. Podrás configurar los flujos conversacionales en el paso 5.
        </div>
    </div>`,
    `<button onclick="testOpenAI()" id="btn-test-oai" class="btn btn-secondary btn-md">Probar API Key</button>
     <button onclick="saveAndAdvanceOpenAI()" class="btn btn-primary btn-md">Continuar</button>`);
}

function renderStepPersonality() {
    return stepCard('', 'Personalidad del Bot', 'Define cómo se llamará tu bot, su saludo y sus instrucciones de comportamiento.',
    `<div style="display:flex;flex-direction:column;gap:1rem;">
        <div class="form-group"><label class="form-label">Nombre del Bot</label><input id="bot-name-input" type="text" placeholder="Ej: Asistente Virtual, Luna, Max..." class="form-input"></div>
        <div class="form-group"><label class="form-label">Mensaje de Bienvenida</label><textarea id="bot-greeting-input" rows="3" placeholder="Hola! Soy tu asistente virtual. ¿En qué puedo ayudarte hoy?" class="form-textarea" style="resize:none;"></textarea></div>
        <div class="form-group">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.375rem;">
                <label class="form-label" style="margin:0;">Prompt del Sistema</label>
                <span class="form-hint" style="margin:0;">o usa una plantilla:</span>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.5rem;">
                ${Object.keys(INDUSTRY_PROMPTS).map(k => `<button type="button" onclick="applyTemplate('${k}')" class="btn btn-secondary btn-sm" style="border-radius:9999px;text-transform:capitalize;">${k}</button>`).join('')}
            </div>
            <textarea id="system-prompt-input" rows="6" placeholder="Eres un asistente virtual..." class="form-textarea" style="resize:vertical;font-family:monospace;font-size:0.8125rem;"></textarea>
        </div>
    </div>`,
    `<button onclick="saveAndAdvancePersonality()" class="btn btn-primary btn-md">Continuar &rarr;</button>`);
}

function renderStepCalendar() {
    return stepCard('Calendario', 'Google Calendar', 'Conecta tu calendario para que los usuarios puedan agendar citas desde WhatsApp.',
    `<div style="display:flex;flex-direction:column;gap:1rem;">
        <div class="form-group"><label class="form-label">Client ID</label><input id="gc-client-id" type="text" placeholder="xxxxxxxx.apps.googleusercontent.com" class="form-input"></div>
        <div class="form-group"><label class="form-label">Client Secret</label><input id="gc-client-secret" type="password" placeholder="GOCSPX-..." class="form-input"></div>
        <div class="form-group"><label class="form-label">Access Token</label><input id="gc-access-token" type="password" placeholder="ya29..." class="form-input"></div>
        <div class="form-group"><label class="form-label">Refresh Token</label><input id="gc-refresh-token" type="password" placeholder="1//0g..." class="form-input"></div>
        <div class="form-group"><label class="form-label">Calendar ID</label><input id="gc-calendar-id" type="text" value="primary" placeholder="primary" class="form-input"></div>
        <div id="calendar-check-result" class="hidden"></div>
    </div>`,
    `<button onclick="skipOnboardingStep('calendar_setup')" class="btn btn-secondary btn-md">Saltar este paso</button>
     <button onclick="saveAndAdvanceCalendar()" class="btn btn-primary btn-md">Guardar y Continuar</button>`);
}

function renderStepFlowBuilder() {
    const stepData = progressData.find(p => p.name === 'openai_credentials');
    const isClassic = stepData && stepData.isSkipped;

    if (!isClassic) {
        return stepCard('', 'Constructor de Flujos', 'Este paso solo aplica al modo Bot Clásico.',
        `<div style="text-align:center;padding:2rem 1rem;color:var(--text-muted);">
            <p>Estás usando el modo IA. No necesitas configurar flujos predefinidos.</p>
        </div>`,
        `<button onclick="skipOnboardingStep('flow_builder')" class="btn btn-primary btn-md">Continuar &rarr;</button>`);
    }

    return stepCard('', 'Constructor de Flujos', 'Crea al menos un nodo raíz para que el bot sepa cómo responder.',
    `<div style="display:flex;flex-direction:column;gap:1rem;">
        <div class="alert alert-warning">Necesitas al menos un <strong>nodo raíz</strong> activo para que el bot funcione en modo clásico.</div>
        <div id="flow-check-result"></div>
        <a href="${typeof BASE_PATH !== 'undefined' ? BASE_PATH : ''}/flow-builder" target="_blank" class="btn btn-secondary btn-md" style="justify-content:center;">
            Abrir Constructor de Flujos &rarr;
        </a>
    </div>`,
    `<button onclick="checkAndAdvanceFlowBuilder()" class="btn btn-primary btn-md">Ya creé mis flujos &rarr;</button>`);
}

function renderStepTest() {
    return stepCard('', 'Verificar Conexiones', 'Comprueba que todos los servicios configurados funcionan correctamente.',
    `<div style="display:flex;flex-direction:column;gap:0.625rem;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0.875rem 1rem;background:var(--bg-elevated);border-radius:var(--radius-lg);border:1px solid var(--border-color);">
            <span style="font-size:0.875rem;font-weight:500;color:var(--text-primary);">WhatsApp Business API</span>
            <div style="display:flex;align-items:center;gap:0.625rem;"><span id="test-wa-status" style="font-size:0.8125rem;color:var(--text-muted);">Sin probar</span>
            <button onclick="runTest('whatsapp','test-wa-status')" class="btn btn-primary btn-sm">Probar</button></div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0.875rem 1rem;background:var(--bg-elevated);border-radius:var(--radius-lg);border:1px solid var(--border-color);">
            <span style="font-size:0.875rem;font-weight:500;color:var(--text-primary);">OpenAI</span>
            <div style="display:flex;align-items:center;gap:0.625rem;"><span id="test-oai-status" style="font-size:0.8125rem;color:var(--text-muted);">Sin probar</span>
            <button onclick="runTest('openai','test-oai-status')" class="btn btn-primary btn-sm">Probar</button></div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0.875rem 1rem;background:var(--bg-elevated);border-radius:var(--radius-lg);border:1px solid var(--border-color);">
            <span style="font-size:0.875rem;font-weight:500;color:var(--text-primary);">Google Calendar</span>
            <div style="display:flex;align-items:center;gap:0.625rem;"><span id="test-cal-status" style="font-size:0.8125rem;color:var(--text-muted);">Sin probar</span>
            <button onclick="runTest('google','test-cal-status')" class="btn btn-primary btn-sm">Probar</button></div>
        </div>
    </div>`,
    `<button onclick="advanceStep('test_connection')" class="btn btn-primary btn-md">Continuar &rarr;</button>`);
}

function renderStepGoLive() {
    const completedSteps = progressData.filter(s => s.isCompleted || s.isSkipped);
    const rows = STEPS.map(s => {
        const sd = progressData.find(p => p.name === s.name);
        const ok = sd && (sd.isCompleted || sd.isSkipped);
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid var(--border-subtle);">
            <span style="font-size:0.875rem;color:var(--text-secondary);">${s.label}</span>
            <span class="badge ${ok ? (sd && sd.isSkipped ? 'badge-neutral' : 'badge-success') : 'badge-warning'}">${ok ? (sd && sd.isSkipped ? 'Omitido' : 'Completado') : 'Pendiente'}</span>
        </div>`;
    }).join('');

    return stepCard('', 'Todo listo', 'Revisa el resumen y activa tu bot de WhatsApp.',
    `<div style="display:flex;flex-direction:column;gap:1rem;">
        <div style="background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:var(--radius-xl);padding:1rem;">${rows}</div>
        <div class="alert alert-success">
            <div><p style="font-weight:600;margin:0 0 0.25rem;">Tu bot está listo para recibir mensajes.</p>
            <p style="font-size:0.75rem;margin:0;">Una vez activado, el bot responderá automáticamente a los mensajes entrantes según la configuración.</p></div>
        </div>
    </div>`,
    `<button onclick="activateBot()" class="btn btn-primary btn-lg" style="background:var(--color-accent);font-weight:700;">Activar Bot</button>`);
}

function renderCompletionScreen() {
    document.getElementById('wizard-container').innerHTML = `
    <div class="card" style="text-align:center;padding:2.5rem;">
        <div style="width:4rem;height:4rem;background:var(--color-success-bg);border:2px solid var(--color-success-border);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 1.25rem;">
            <svg width="28" height="28" fill="none" stroke="var(--color-success)" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
        </div>
        <h2 style="font-size:1.375rem;font-weight:700;color:var(--text-primary);margin:0 0 0.5rem;">Configuración Completa</h2>
        <p style="color:var(--text-muted);margin:0 0 2rem;">Tu bot de WhatsApp está activo y listo para responder mensajes.</p>
        <div style="display:flex;justify-content:center;gap:0.75rem;flex-wrap:wrap;">
            <a href="${typeof BASE_PATH !== 'undefined' ? BASE_PATH : ''}/" class="btn btn-primary btn-md">Ir al Dashboard</a>
            <button onclick="resetOnboarding()" class="btn btn-secondary btn-md">Reconfigurar desde cero</button>
        </div>
    </div>`;
}

function bindStepEvents(stepName) {
    if (stepName === 'openai_credentials') {
        document.querySelectorAll('input[name="bot-mode-radio"]').forEach(radio => {
            radio.addEventListener('change', function() {
                const isClassic = this.value === 'classic';
                const fields = document.getElementById('openai-fields');
                const notice = document.getElementById('classic-notice');
                const testBtn = document.getElementById('btn-test-oai');
                if (fields) fields.style.display = isClassic ? 'none' : 'flex';
                if (notice) { notice.style.display = isClassic ? '' : 'none'; notice.classList.toggle('hidden', !isClassic); }
                if (testBtn) testBtn.style.display = isClassic ? 'none' : '';
                document.querySelectorAll('.bot-mode-card-ob').forEach(function(card) {
                    const parentRadio = card.parentElement.querySelector('input[type="radio"]');
                    const selected = parentRadio && parentRadio.checked;
                    card.style.border = selected ? '2px solid var(--color-primary)' : '2px solid var(--border-color)';
                    card.style.background = selected ? 'rgba(7,94,84,0.05)' : 'transparent';
                });
            });
        });
        document.querySelectorAll('label[style*="cursor:pointer"]').forEach(function(lbl) {
            lbl.addEventListener('click', function() {
                var radio = this.querySelector('input[type="radio"]');
                if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change', {bubbles: true})); }
            });
        });
    }
}

function applyTemplate(industry) {
    document.getElementById('system-prompt-input').value = INDUSTRY_PROMPTS[industry] || '';
}

async function saveWhatsApp() {
    const payload = {
        phone_number_id: document.getElementById('wa-phone-id').value.trim(),
        access_token:    document.getElementById('wa-token').value.trim(),
        app_secret:      document.getElementById('wa-secret').value.trim(),
        verify_token:    document.getElementById('wa-verify').value.trim(),
    };
    const el = document.getElementById('wa-save-result');
    if (!payload.phone_number_id || !payload.access_token) {
        el.innerHTML = '<span style="font-size:0.875rem;color:var(--color-error);">Phone Number ID y Access Token son obligatorios.</span>';
        return;
    }
    el.innerHTML = '<span style="font-size:0.875rem;color:var(--text-muted);">Guardando...</span>';
    const res  = await apiFetch('/api/credentials/whatsapp', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            phoneNumberId: payload.phone_number_id,
            accessToken: payload.access_token,
            appSecret: payload.app_secret,
            verifyToken: payload.verify_token
        })
    });
    const data = await res.json();
    if (data.success !== false) {
        el.innerHTML = '<span style="font-size:0.875rem;color:var(--color-success);">✓ Credenciales guardadas. Ahora prueba la conexión.</span>';
        document.getElementById('btn-wa-test').disabled = false;
        document.getElementById('btn-wa-continue').disabled = false;
    } else {
        el.innerHTML = `<span style="font-size:0.875rem;color:var(--color-error);">Error al guardar: ${data.error || 'desconocido'}</span>`;
    }
}

async function testWhatsApp() {
    const el = document.getElementById('wa-test-result');
    el.innerHTML = '<span style="font-size:0.875rem;color:var(--text-muted);">Probando...</span>';
    const res  = await apiFetch('/api/test-connection?service=whatsapp');
    const data = await res.json();
    el.innerHTML = `<span style="font-size:0.875rem;color:${data.success ? 'var(--color-success)' : 'var(--color-error)'}">${data.message}</span>`;
}

async function testOpenAI() {
    const el = document.getElementById('oai-test-result');
    el.innerHTML = '<span style="font-size:0.875rem;color:var(--text-muted);">Probando...</span>';
    const res  = await apiFetch('/api/test-connection?service=openai');
    const data = await res.json();
    el.innerHTML = `<span style="font-size:0.875rem;color:${data.success ? 'var(--color-success)' : 'var(--color-error)'}">${data.message}</span>`;
}

async function runTest(service, statusId) {
    const el = document.getElementById(statusId);
    el.textContent = 'Probando...';
    el.style.color = 'var(--text-muted)';
    const res  = await apiFetch('/api/test-connection?service=' + service);
    const data = await res.json();
    el.textContent = data.success ? '✓ OK' : '✗ Error';
    el.style.color = data.success ? 'var(--color-success)' : 'var(--color-error)';
    el.title       = data.message;
}


async function saveAndAdvanceOpenAI() {
    const modeRadio = document.querySelector('input[name="bot-mode-radio"]:checked');
    const mode = modeRadio ? modeRadio.value : 'ai';

    // Save bot_mode
    await apiFetch('/api/settings', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({bot_mode: mode})
    });

    if (mode === 'classic') {
        await skipOnboardingStep('openai_credentials');
        return;
    }

    const apiKey = document.getElementById('oai-key').value.trim();
    if (!apiKey) { alert('La API Key es obligatoria para el modo IA.'); return; }

    await apiFetch('/api/credentials/openai', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({apiKey: apiKey})
    });
    await apiFetch('/api/settings', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({openai_model: document.getElementById('oai-model').value, openai_embedding_model: (document.getElementById('oai-embedding').value.trim() || 'text-embedding-ada-002')})
    });

    await advanceStep('openai_credentials');
}

async function saveAndAdvancePersonality() {
    const name    = document.getElementById('bot-name-input').value.trim();
    const greeting= document.getElementById('bot-greeting-input').value.trim();
    const prompt  = document.getElementById('system-prompt-input').value.trim();

    await apiFetch('/api/settings', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            ...(name     && {bot_name: name}),
            ...(greeting && {welcome_message: greeting}),
            ...(prompt   && {system_prompt: prompt}),
        })
    });
    await advanceStep('bot_personality');
}

async function saveAndAdvanceCalendar() {
    const clientId     = document.getElementById('gc-client-id').value.trim();
    const clientSecret = document.getElementById('gc-client-secret').value.trim();
    const accessToken  = document.getElementById('gc-access-token').value.trim();
    const refreshToken = document.getElementById('gc-refresh-token').value.trim();
    const calendarId   = document.getElementById('gc-calendar-id').value.trim() || 'primary';
    const el           = document.getElementById('calendar-check-result');
    el.style.display = 'block';
    if (!clientId || !clientSecret || !accessToken) {
        el.innerHTML = '<span style="font-size:0.875rem;color:var(--color-error);">Client ID, Client Secret y Access Token son obligatorios.</span>';
        return;
    }
    await apiFetch('/api/credentials/google', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({clientId: clientId, clientSecret: clientSecret, accessToken: accessToken, refreshToken: refreshToken, calendarId: calendarId})
    });
    await apiFetch('/api/settings', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({calendar_enabled: 'true'})
    });
    el.innerHTML = '<span style="font-size:0.875rem;color:var(--color-success);">✓ Credenciales guardadas correctamente.</span>';
    await advanceStep('calendar_setup');
}

async function checkAndAdvanceFlowBuilder() {
    const res  = await apiFetch('/api/flows');
    const data = await res.json();
    const el   = document.getElementById('flow-check-result');
    const nodes = data.data || [];
    const rootNodes = nodes.filter(n => n.isRoot && n.isActive);
    if (rootNodes.length > 0) {
        el.innerHTML = `<span style="font-size:0.875rem;color:var(--color-success);">✓ Se encontraron ${rootNodes.length} nodo(s) raíz activo(s).</span>`;
        await advanceStep('flow_builder');
    } else {
        el.innerHTML = '<span style="font-size:0.875rem;color:var(--color-error);">No hay nodos raíz activos. Crea al menos uno en el constructor.</span>';
    }
}

async function skipOnboardingStep(step) {
    try {
        const res  = await apiFetch('/api/onboarding-progress', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({action: 'skip', step: step})
        });
        const rawText = await res.text();
        let data;
        try {
            data = JSON.parse(rawText);
        } catch (parseErr) {
            showOnboardingError('Error del servidor al saltar paso "' + step + '":', rawText);
            return;
        }
        if (data.success) {
            await loadProgress();
        } else {
            showOnboardingError('No se pudo saltar el paso:', data.error || 'Error desconocido');
        }
    } catch (e) {
        showOnboardingError('Error de red al saltar paso:', e.message);
    }
}


async function advanceStep(step) {
    try {
        const res  = await apiFetch('/api/onboarding-progress', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({action: 'complete', step: step})
        });
        const rawText = await res.text();
        let data;
        try {
            data = JSON.parse(rawText);
        } catch (parseErr) {
            showOnboardingError('Error del servidor al completar paso "' + step + '":', rawText);
            return;
        }
        if (data.success) {
            await loadProgress();
        } else {
            showOnboardingError('No se pudo completar el paso:', data.error || 'Error desconocido');
        }
    } catch (e) {
        showOnboardingError('Error de red al completar paso:', e.message);
    }
}

async function activateBot() {
    await advanceStep('go_live');
}

async function resetOnboarding() {
    if (!confirm('¿Reiniciar el proceso de configuración desde el principio?')) return;
    await apiFetch('/api/onboarding-reset', {method: 'POST'});
    await loadProgress();
}

loadProgress();
