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
        const res  = await fetch(BASE_PATH + '/api/onboarding-progress.php', { cache: 'no-store' });
        const rawText = await res.text();
        let data;
        try {
            data = JSON.parse(rawText);
        } catch (parseErr) {
            showOnboardingError('Error del servidor (respuesta no JSON):', rawText);
            return;
        }
        if (!data.success) throw new Error(data.error);
        progressData    = data.steps;
        currentStepName = data.current;
        renderWizard();
    } catch (e) {
        showOnboardingError('Error al cargar configuración:', e.message);
    }
}

function renderWizard() {
    const completed = progressData.filter(s => s.is_completed || s.is_skipped).length;
    const pct       = Math.round((completed / STEPS.length) * 100);

    document.getElementById('progress-bar').style.width = pct + '%';
    document.getElementById('progress-label').textContent = `Paso ${completed + 1} de ${STEPS.length}`;

    // Step indicators
    document.getElementById('step-indicators').innerHTML = STEPS.map((s, i) => {
        const stepData = progressData.find(p => p.step_name === s.name);
        const done     = stepData && (stepData.is_completed || stepData.is_skipped);
        const active   = s.name === currentStepName;
        return `<div class="flex flex-col items-center" title="${s.label}">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all
                ${done   ? 'bg-accent text-white' :
                  active ? 'bg-primary text-white ring-4 ring-primary/30' :
                           'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}">
                ${done ? (i + 1) : (i + 1)}
            </div>
            <span class="text-xs mt-1 hidden sm:block ${active ? 'text-primary font-semibold' : 'text-gray-400'}">${s.label}</span>
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
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div class="bg-gradient-to-r from-primary to-secondary p-6 text-white">
            <h2 class="text-2xl font-bold">${title}</h2>
            <p class="text-green-100 mt-1 text-sm">${subtitle}</p>
        </div>
        <div class="p-6 space-y-5">${bodyHtml}</div>
        <div class="px-6 pb-6 flex justify-end space-x-3">${footerHtml}</div>
    </div>`;
}

function renderStepWhatsApp() {
    const webhookUrl = (typeof BASE_PATH !== 'undefined' ? window.location.origin + BASE_PATH : window.location.origin) + '/webhook';
    return stepCard('WhatsApp', 'Credenciales de WhatsApp', 'Conecta tu número de WhatsApp Business para que el bot pueda enviar y recibir mensajes.',
    `<div class="space-y-4">
        <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p class="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">URL del Webhook (cópiala en Meta Developer Console)</p>
            <div class="flex items-center gap-2">
                <code id="webhook-url-display" class="flex-1 text-xs bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700 rounded px-2 py-1.5 text-blue-800 dark:text-blue-200 break-all">${webhookUrl}</code>
                <button onclick="navigator.clipboard.writeText('${webhookUrl}').then(()=>{ this.textContent='\u2713'; setTimeout(()=>this.textContent='Copiar',1500); })" class="flex-shrink-0 px-2 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-all">Copiar</button>
            </div>
            <p class="text-xs text-blue-600 dark:text-blue-400 mt-1">En Meta for Developers &rarr; tu App &rarr; WhatsApp &rarr; Configuración &rarr; Webhook.</p>
        </div>
        <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone Number ID</label>
        <input id="wa-phone-id" type="text" placeholder="123456789012345" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary focus:border-transparent"></div>
        <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Access Token</label>
        <input id="wa-token" type="password" placeholder="EAAxxxxxxx..." class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary focus:border-transparent"></div>
        <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">App Secret</label>
        <input id="wa-secret" type="password" placeholder="abc123def456..." class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary focus:border-transparent"></div>
        <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Verify Token</label>
        <input id="wa-verify" type="text" placeholder="mi_token_secreto" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary focus:border-transparent">
        <p class="text-xs text-gray-400 mt-1">Token personalizado para verificar el webhook en Meta Developer Console.</p></div>
        <div id="wa-save-result"></div>
        <div id="wa-test-result"></div>
    </div>`,
    `<button onclick="saveWhatsApp()" id="btn-wa-save" class="px-4 py-2 border border-primary text-primary rounded-lg hover:bg-primary hover:text-white transition-all">Guardar</button>
     <button onclick="testWhatsApp()" id="btn-wa-test" class="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 rounded-lg cursor-not-allowed opacity-50" disabled>Probar conexión</button>
     <button onclick="advanceStep('whatsapp_credentials')" id="btn-wa-continue" class="px-6 py-2 bg-primary hover:bg-secondary text-white rounded-lg font-medium cursor-not-allowed opacity-50 transition-all" disabled>Continuar</button>`);
}

function renderStepOpenAI() {
    return stepCard('OpenAI', 'OpenAI y Modo de Operación', 'Configura tu API Key de OpenAI o elige el modo Bot Clásico sin IA.',
    `<div class="space-y-5">
        <div class="grid grid-cols-2 gap-4">
            <label class="cursor-pointer">
                <input type="radio" name="bot-mode-radio" value="ai" class="sr-only peer" checked>
                <div class="border-2 peer-checked:border-primary peer-checked:bg-primary/5 dark:peer-checked:bg-primary/10 border-gray-200 dark:border-gray-700 rounded-xl p-4 transition-all hover:border-primary/50">
                    <p class="font-bold text-gray-900 dark:text-gray-100">Modo IA</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Usa OpenAI para respuestas inteligentes y comprensión del lenguaje natural.</p>
                </div>
            </label>
            <label class="cursor-pointer">
                <input type="radio" name="bot-mode-radio" value="classic" class="sr-only peer">
                <div class="border-2 peer-checked:border-secondary peer-checked:bg-secondary/5 dark:peer-checked:bg-secondary/10 border-gray-200 dark:border-gray-700 rounded-xl p-4 transition-all hover:border-secondary/50">
                    <p class="font-bold text-gray-900 dark:text-gray-100">Modo Clásico</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Flujos predefinidos por palabras clave. No requiere OpenAI.</p>
                </div>
            </label>
        </div>
        <div id="openai-fields" class="space-y-4">
            <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API Key</label>
            <input id="oai-key" type="password" placeholder="sk-..." class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary focus:border-transparent"></div>
            <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Modelo</label>
            <select id="oai-model" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary focus:border-transparent">
                <option value="gpt-3.5-turbo" selected>GPT-3.5 Turbo (default)</option>
                <option value="gpt-4o-mini">GPT-4o Mini (económico)</option>
                <option value="gpt-4o">GPT-4o (más capaz)</option>
            </select></div>
            <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Modelo de Embeddings</label>
            <input id="oai-embedding" type="text" value="text-embedding-ada-002" placeholder="text-embedding-ada-002" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary focus:border-transparent"></div>
            <div id="oai-test-result"></div>
        </div>
        <div id="classic-notice" class="hidden bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-sm text-yellow-700 dark:text-yellow-300">
            Has elegido el modo Clásico. OpenAI no será utilizado. Podrás configurar los flujos conversacionales en el paso 5.
        </div>
    </div>`,
    `<button onclick="testOpenAI()" id="btn-test-oai" class="px-4 py-2 border border-primary text-primary rounded-lg hover:bg-primary hover:text-white transition-all">Probar API Key</button>
     <button onclick="saveAndAdvanceOpenAI()" class="px-6 py-2 bg-primary hover:bg-secondary text-white rounded-lg font-medium transition-all">Continuar</button>`);
}

function renderStepPersonality() {
    return stepCard('', 'Personalidad del Bot', 'Define cómo se llamará tu bot, su saludo y sus instrucciones de comportamiento.',
    `<div class="space-y-4">
        <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre del Bot</label>
        <input id="bot-name-input" type="text" placeholder="Ej: Asistente Virtual, Luna, Max..." class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary focus:border-transparent"></div>
        <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mensaje de Bienvenida</label>
        <textarea id="bot-greeting-input" rows="3" placeholder="Hola! Soy tu asistente virtual. ¿En qué puedo ayudarte hoy?" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary focus:border-transparent resize-none"></textarea></div>
        <div>
            <div class="flex items-center justify-between mb-1">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Prompt del Sistema</label>
                <span class="text-xs text-gray-400">o usa una plantilla:</span>
            </div>
            <div class="flex flex-wrap gap-2 mb-2">
                ${Object.keys(INDUSTRY_PROMPTS).map(k => `<button type="button" onclick="applyTemplate('${k}')" class="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-full hover:border-primary hover:text-primary transition-all capitalize">${k}</button>`).join('')}
            </div>
            <textarea id="system-prompt-input" rows="6" placeholder="Eres un asistente virtual..." class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary focus:border-transparent resize-none font-mono text-sm"></textarea>
        </div>
    </div>`,
    `<button onclick="saveAndAdvancePersonality()" class="px-6 py-2 bg-primary hover:bg-secondary text-white rounded-lg font-medium transition-all">Continuar →</button>`);
}

function renderStepCalendar() {
    return stepCard('Calendario', 'Google Calendar', 'Conecta tu calendario para que los usuarios puedan agendar citas desde WhatsApp.',
    `<div class="space-y-4">
        <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client ID</label>
        <input id="gc-client-id" type="text" placeholder="xxxxxxxx.apps.googleusercontent.com" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary focus:border-transparent"></div>
        <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client Secret</label>
        <input id="gc-client-secret" type="password" placeholder="GOCSPX-..." class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary focus:border-transparent"></div>
        <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Access Token</label>
        <input id="gc-access-token" type="password" placeholder="ya29..." class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary focus:border-transparent"></div>
        <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Refresh Token</label>
        <input id="gc-refresh-token" type="password" placeholder="1//0g..." class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary focus:border-transparent"></div>
        <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Calendar ID</label>
        <input id="gc-calendar-id" type="text" value="primary" placeholder="primary" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary focus:border-transparent"></div>
        <div id="calendar-check-result" class="hidden"></div>
    </div>`,
    `<button onclick="skipOnboardingStep('calendar_setup')" class="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">Saltar este paso</button>
     <button onclick="saveAndAdvanceCalendar()" class="px-6 py-2 bg-primary hover:bg-secondary text-white rounded-lg font-medium transition-all">Guardar y Continuar</button>`);
}

function renderStepFlowBuilder() {
    const stepData = progressData.find(p => p.step_name === 'openai_credentials');
    const isClassic = stepData && stepData.is_skipped;

    if (!isClassic) {
        return stepCard('', 'Constructor de Flujos', 'Este paso solo aplica al modo Bot Clásico.',
        `<div class="text-center py-8 text-gray-400">
            <p>Estás usando el modo IA. No necesitas configurar flujos predefinidos.</p>
        </div>`,
        `<button onclick="skipOnboardingStep('flow_builder')" class="px-6 py-2 bg-primary hover:bg-secondary text-white rounded-lg font-medium transition-all">Continuar →</button>`);
    }

    return stepCard('', 'Constructor de Flujos', 'Crea al menos un nodo raíz para que el bot sepa cómo responder.',
    `<div class="space-y-4">
        <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-sm text-yellow-700 dark:text-yellow-300">
            Necesitas al menos un <strong>nodo raíz</strong> activo para que el bot funcione en modo clásico.
        </div>
        <div id="flow-check-result"></div>
        <a href="${typeof BASE_PATH !== 'undefined' ? BASE_PATH : ''}/flow-builder" target="_blank" class="block w-full text-center px-4 py-3 bg-secondary hover:bg-primary text-white rounded-lg font-medium transition-all">
            Abrir Constructor de Flujos →
        </a>
    </div>`,
    `<button onclick="checkAndAdvanceFlowBuilder()" class="px-6 py-2 bg-primary hover:bg-secondary text-white rounded-lg font-medium transition-all">Ya creé mis flujos →</button>`);
}

function renderStepTest() {
    return stepCard('', 'Verificar Conexiones', 'Comprueba que todos los servicios configurados funcionan correctamente.',
    `<div class="space-y-3">
        <div id="test-wa"  class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <span class="font-medium text-gray-800 dark:text-gray-200">WhatsApp Business API</span>
            <div class="flex items-center space-x-2"><span id="test-wa-status" class="text-sm text-gray-400">Sin probar</span>
            <button onclick="runTest('whatsapp','test-wa-status')" class="px-3 py-1 text-xs bg-primary hover:bg-secondary text-white rounded-lg transition-all">Probar</button></div>
        </div>
        <div id="test-oai" class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <span class="font-medium text-gray-800 dark:text-gray-200">OpenAI</span>
            <div class="flex items-center space-x-2"><span id="test-oai-status" class="text-sm text-gray-400">Sin probar</span>
            <button onclick="runTest('openai','test-oai-status')" class="px-3 py-1 text-xs bg-primary hover:bg-secondary text-white rounded-lg transition-all">Probar</button></div>
        </div>
        <div id="test-cal" class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <span class="font-medium text-gray-800 dark:text-gray-200">Google Calendar</span>
            <div class="flex items-center space-x-2"><span id="test-cal-status" class="text-sm text-gray-400">Sin probar</span>
            <button onclick="runTest('google','test-cal-status')" class="px-3 py-1 text-xs bg-primary hover:bg-secondary text-white rounded-lg transition-all">Probar</button></div>
        </div>
    </div>`,
    `<button onclick="advanceStep('test_connection')" class="px-6 py-2 bg-primary hover:bg-secondary text-white rounded-lg font-medium transition-all">Continuar →</button>`);
}

function renderStepGoLive() {
    const completedSteps = progressData.filter(s => s.is_completed || s.is_skipped);
    const rows = STEPS.map(s => {
        const sd = progressData.find(p => p.step_name === s.name);
        const ok = sd && (sd.is_completed || sd.is_skipped);
        return `<div class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
            <span class="text-gray-700 dark:text-gray-300">${s.icon} ${s.label}</span>
            <span class="${ok ? 'text-accent' : 'text-orange-500'} font-medium text-sm">${ok ? (sd.is_skipped ? 'Omitido' : 'Completado') : 'Pendiente'}</span>
        </div>`;
    }).join('');

    return stepCard('', 'Todo listo', 'Revisa el resumen y activa tu bot de WhatsApp.',
    `<div class="space-y-4">
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">${rows}</div>
        <div class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-sm text-green-700 dark:text-green-300">
            <p class="font-semibold">Tu bot está listo para recibir mensajes.</p>
            <p class="mt-1 text-xs">Una vez activado, el bot responderá automáticamente a los mensajes entrantes según la configuración.</p>
        </div>
    </div>`,
    `<button onclick="activateBot()" class="px-8 py-3 bg-accent hover:bg-green-600 text-white rounded-xl font-bold text-lg transition-all shadow-lg hover:shadow-xl">Activar Bot</button>`);
}

function renderCompletionScreen() {
    document.getElementById('wizard-container').innerHTML = `
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-10 text-center">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Configuración Completa</h2>
        <p class="text-gray-500 dark:text-gray-400 mb-8">Tu bot de WhatsApp está activo y listo para responder mensajes.</p>
        <div class="flex flex-col sm:flex-row justify-center gap-4">
            <a href="${typeof BASE_PATH !== 'undefined' ? BASE_PATH : ''}/" class="px-6 py-3 bg-primary hover:bg-secondary text-white rounded-xl font-medium transition-all">Ir al Dashboard</a>
            <button onclick="resetOnboarding()" class="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">Reconfigurar desde cero</button>
        </div>
    </div>`;
}

function bindStepEvents(stepName) {
    if (stepName === 'openai_credentials') {
        document.querySelectorAll('input[name="bot-mode-radio"]').forEach(radio => {
            radio.addEventListener('change', e => {
                const isClassic = e.target.value === 'classic';
                document.getElementById('openai-fields').classList.toggle('hidden', isClassic);
                document.getElementById('classic-notice').classList.toggle('hidden', !isClassic);
                document.getElementById('btn-test-oai').classList.toggle('hidden', isClassic);
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
        el.innerHTML = '<span class="text-sm text-red-500">Phone Number ID y Access Token son obligatorios.</span>';
        return;
    }
    el.innerHTML = '<span class="text-gray-400 text-sm">Guardando...</span>';
    const res  = await fetch(BASE_PATH + '/api/save-credentials.php', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({service: 'whatsapp', ...payload})
    });
    const data = await res.json();
    if (data.success !== false) {
        el.innerHTML = '<span class="text-sm text-accent">✓ Credenciales guardadas. Ahora prueba la conexión.</span>';
        document.getElementById('btn-wa-test').disabled = false;
        document.getElementById('btn-wa-test').classList.remove('cursor-not-allowed', 'opacity-50');
        document.getElementById('btn-wa-continue').disabled = false;
        document.getElementById('btn-wa-continue').classList.remove('cursor-not-allowed', 'opacity-50');
    } else {
        el.innerHTML = `<span class="text-sm text-red-500">Error al guardar: ${data.error || 'desconocido'}</span>`;
    }
}

async function testWhatsApp() {
    const el = document.getElementById('wa-test-result');
    el.innerHTML = '<span class="text-gray-400 text-sm">Probando...</span>';
    const res  = await fetch(BASE_PATH + '/api/test-connection.php?service=whatsapp');
    const data = await res.json();
    el.innerHTML = `<span class="text-sm ${data.success ? 'text-accent' : 'text-red-500'}">${data.message}</span>`;
}

async function testOpenAI() {
    const el = document.getElementById('oai-test-result');
    el.innerHTML = '<span class="text-gray-400 text-sm">Probando...</span>';
    const res  = await fetch(BASE_PATH + '/api/test-connection.php?service=openai');
    const data = await res.json();
    el.innerHTML = `<span class="text-sm ${data.success ? 'text-accent' : 'text-red-500'}">${data.message}</span>`;
}

async function runTest(service, statusId) {
    const el = document.getElementById(statusId);
    el.textContent = 'Probando...';
    el.className   = 'text-sm text-gray-400';
    const res  = await fetch(BASE_PATH + '/api/test-connection.php?service=' + service);
    const data = await res.json();
    el.textContent = data.success ? 'OK' : 'Error';
    el.className   = 'text-sm ' + (data.success ? 'text-accent' : 'text-red-500');
    el.title       = data.message;
}


async function saveAndAdvanceOpenAI() {
    const modeRadio = document.querySelector('input[name="bot-mode-radio"]:checked');
    const mode = modeRadio ? modeRadio.value : 'ai';

    // Save bot_mode
    await fetch(BASE_PATH + '/api/save-settings.php', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({botMode: mode})
    });

    if (mode === 'classic') {
        await skipOnboardingStep('openai_credentials');
        return;
    }

    const apiKey = document.getElementById('oai-key').value.trim();
    if (!apiKey) { alert('La API Key es obligatoria para el modo IA.'); return; }

    await fetch(BASE_PATH + '/api/save-credentials.php', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({service: 'openai', api_key: apiKey, model: document.getElementById('oai-model').value, embedding_model: (document.getElementById('oai-embedding').value.trim() || 'text-embedding-ada-002')})
    });

    await advanceStep('openai_credentials');
}

async function saveAndAdvancePersonality() {
    const name    = document.getElementById('bot-name-input').value.trim();
    const greeting= document.getElementById('bot-greeting-input').value.trim();
    const prompt  = document.getElementById('system-prompt-input').value.trim();

    await fetch(BASE_PATH + '/api/save-settings.php', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            ...(name     && {botName: name}),
            ...(greeting && {welcomeMessage: greeting}),
            ...(prompt   && {systemPrompt: prompt}),
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
    el.classList.remove('hidden');
    if (!clientId || !clientSecret || !accessToken) {
        el.innerHTML = '<span class="text-sm text-red-500">Client ID, Client Secret y Access Token son obligatorios.</span>';
        return;
    }
    await fetch(BASE_PATH + '/api/save-credentials.php', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({service: 'google', client_id: clientId, client_secret: clientSecret, access_token: accessToken, refresh_token: refreshToken, calendar_id: calendarId})
    });
    await fetch(BASE_PATH + '/api/save-settings.php', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({calendarEnabled: true})
    });
    el.innerHTML = '<span class="text-sm text-accent">Credenciales guardadas correctamente.</span>';
    await advanceStep('calendar_setup');
}

async function checkAndAdvanceFlowBuilder() {
    const res  = await fetch(BASE_PATH + '/api/get-flows.php');
    const data = await res.json();
    const el   = document.getElementById('flow-check-result');
    const rootNodes = (data.nodes || []).filter(n => n.is_root && n.is_active);
    if (rootNodes.length > 0) {
        el.innerHTML = `<span class="text-sm text-accent">Se encontraron ${rootNodes.length} nodo(s) raíz activo(s).</span>`;
        await advanceStep('flow_builder');
    } else {
        el.innerHTML = '<span class="text-sm text-red-500">No hay nodos raíz activos. Crea al menos uno en el constructor.</span>';
    }
}

async function skipOnboardingStep(step) {
    try {
        const res  = await fetch(BASE_PATH + '/api/onboarding-progress.php', {
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
            progressData    = data.steps;
            currentStepName = data.current;
            renderWizard();
        } else {
            showOnboardingError('No se pudo saltar el paso:', data.error || 'Error desconocido');
        }
    } catch (e) {
        showOnboardingError('Error de red al saltar paso:', e.message);
    }
}


async function advanceStep(step) {
    try {
        const res  = await fetch(BASE_PATH + '/api/onboarding-progress.php', {
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
            progressData    = data.steps;
            currentStepName = data.current;
            renderWizard();
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
    await fetch(BASE_PATH + '/api/onboarding-reset.php', {method: 'POST'});
    await loadProgress();
}

loadProgress();
