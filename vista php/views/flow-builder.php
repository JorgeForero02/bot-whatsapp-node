<?php
$pageTitle = 'Constructor de Flujos - WhatsApp Bot';
$currentPage = 'flow-builder';

$calendarEnabled = false;
try {
    $calRow = $db->fetchOne("SELECT setting_value FROM settings WHERE setting_key = 'calendar_enabled'", []);
    $calendarEnabled = !empty($calRow) && $calRow['setting_value'] === 'true';
} catch (\Throwable $e) {}

ob_start();
?>

<div class="mb-5 flex items-start justify-between gap-4 flex-wrap">
    <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Constructor de Flujos</h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Define los flujos conversacionales del modo Bot Clásico</p>
    </div>
    <div class="flex items-center gap-2 flex-wrap">
        <button onclick="exportFlow()" class="px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-all flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            Exportar
        </button>
        <label class="px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-all flex items-center gap-2 cursor-pointer">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12"/></svg>
            Importar
            <input type="file" accept=".json" class="hidden" onchange="importFlow(event)">
        </label>
        <button onclick="openNodeModal()" class="px-3 py-2 bg-primary hover:bg-secondary text-white rounded-lg text-sm font-medium transition-all flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Nuevo Nodo
        </button>
    </div>
</div>

<div class="grid grid-cols-1 lg:grid-cols-3 gap-5">

    <div class="lg:col-span-2">

        <!-- Toolbar -->
        <div class="fb-toolbar">
            <div class="fb-search-wrap">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/></svg>
                <input id="fb-search" type="text" class="fb-search-input" placeholder="Buscar por nombre o keyword..." oninput="applyFilters()">
            </div>
            <div class="fb-filter-pills">
                <button class="fb-filter-pill active" data-filter="all"    onclick="setFilter('all',this)">Todos</button>
                <button class="fb-filter-pill"        data-filter="root"   onclick="setFilter('root',this)">Raíz</button>
                <button class="fb-filter-pill"        data-filter="calendar" onclick="setFilter('calendar',this)">Calendario</button>
                <button class="fb-filter-pill"        data-filter="terminal" onclick="setFilter('terminal',this)">Terminales</button>
            </div>
            <div class="fb-view-toggle">
                <button class="fb-view-btn active" id="btn-view-list" onclick="setView('list')" title="Vista lista">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
                </button>
                <button class="fb-view-btn" id="btn-view-tree" onclick="setView('tree')" title="Vista árbol">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7h4m0 0v10m0-10h8m0 0v4m0-4h4M7 17h4"/></svg>
                </button>
            </div>
        </div>

        <!-- Meta bar -->
        <div class="fb-meta-bar">
            <span class="fb-node-count" id="fb-node-count">0 nodos</span>
            <span id="fb-filter-label"></span>
        </div>

        <!-- Nodes container -->
        <div id="nodes-container">
            <div class="text-center py-12 text-gray-400">
                <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
                <p>Cargando flujos...</p>
            </div>
        </div>
    </div>

    <!-- Simulator panel -->
    <div class="lg:col-span-1">
        <div class="fb-sim-panel sticky top-6">
            <div class="fb-sim-header">
                <span class="fb-sim-title">
                    <svg class="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                    Simulador
                </span>
            </div>
            <div class="fb-sim-chat" id="sim-chat">
                <div class="fb-sim-empty">Escribe un mensaje para simular la conversación</div>
            </div>
            <div class="fb-sim-footer">
                <div class="fb-sim-input-row">
                    <input id="sim-input" type="text" class="fb-sim-input" placeholder="Escribe un mensaje..." onkeydown="if(event.key==='Enter') sendSimMessage()">
                    <button class="fb-sim-send" onclick="sendSimMessage()">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                    </button>
                </div>
                <button class="fb-sim-reset" onclick="resetSimulator()">↺ Reiniciar sesión</button>
            </div>
        </div>
    </div>
</div>

<!-- Node Modal -->
<div id="node-modal" class="fixed inset-0 bg-black bg-opacity-50 z-50 hidden items-center justify-center p-4">
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <h2 id="modal-title" class="text-lg font-bold text-gray-900 dark:text-gray-100">Nuevo Nodo</h2>
            <button onclick="closeNodeModal()" class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>

        <div class="overflow-y-auto flex-1 p-5 space-y-4">
            <input type="hidden" id="node-id">

            <!-- Section 1: Identity -->
            <div class="fb-form-section">
                <div class="fb-form-section-header" onclick="toggleFormSection(this)">
                    <span class="fb-form-section-title">1. Identidad</span>
                    <svg class="fb-form-section-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                </div>
                <div class="fb-form-section-body">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre del nodo <span class="text-red-400">*</span></label>
                        <input type="text" id="node-name" placeholder="Ej: Bienvenida, Menú Principal..." class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-primary focus:border-transparent">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                            <div>
                                <div class="fb-tooltip-wrap">
                                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100">Nodo raíz</p>
                                    <span class="fb-tooltip">Los nodos raíz se activan cuando el usuario escribe por primera vez o sin sesión activa</span>
                                </div>
                                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Sin contexto previo</p>
                            </div>
                            <label class="relative inline-flex items-center cursor-pointer ml-2">
                                <input type="checkbox" id="node-is-root" class="sr-only peer" onchange="onIsRootChange()">
                                <div class="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary dark:bg-gray-700"></div>
                            </label>
                        </div>
                        <div class="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                            <div>
                                <div class="fb-tooltip-wrap">
                                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100">Despedida</p>
                                    <span class="fb-tooltip">Al llegar a este nodo, la sesión termina y el bot no espera más mensajes</span>
                                </div>
                                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Cierra la conversación</p>
                            </div>
                            <label class="relative inline-flex items-center cursor-pointer ml-2">
                                <input type="checkbox" id="node-is-farewell" class="sr-only peer">
                                <div class="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600 dark:bg-gray-700"></div>
                            </label>
                        </div>
                        <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                            <div>
                                <p class="text-sm font-medium text-gray-900 dark:text-gray-100">Activo</p>
                                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Visible en el flujo</p>
                            </div>
                            <label class="relative inline-flex items-center cursor-pointer ml-2">
                                <input type="checkbox" id="node-is-active" checked class="sr-only peer">
                                <div class="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent dark:bg-gray-700"></div>
                            </label>
                        </div>
                    </div>
                    <div id="match-any-input-row" class="hidden">
                        <div class="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                            <div>
                                <div class="fb-tooltip-wrap">
                                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100">Cualquier mensaje</p>
                                    <span class="fb-tooltip">Este nodo se activa con cualquier mensaje cuando no hay sesión activa</span>
                                </div>
                                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Se dispara sin keywords específicas</p>
                            </div>
                            <label class="relative inline-flex items-center cursor-pointer ml-2">
                                <input type="checkbox" id="node-match-any-input" class="sr-only peer" onchange="onMatchAnyInputChange()">
                                <div class="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500 dark:bg-gray-700"></div>
                            </label>
                        </div>
                        <div id="match-any-notice" class="hidden mt-2 px-3 py-2 bg-orange-50 dark:bg-orange-900/30 rounded-lg text-xs text-orange-700 dark:text-orange-300">
                            Las palabras clave son ignoradas cuando este modo está activo.
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Orden de posición</label>
                        <input type="number" id="node-order" value="0" min="0" class="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-primary focus:border-transparent">
                    </div>
                </div>
            </div>

            <!-- Section 2: Activation -->
            <div class="fb-form-section">
                <div class="fb-form-section-header" onclick="toggleFormSection(this)">
                    <span class="fb-form-section-title">2. Activación — Keywords</span>
                    <svg class="fb-form-section-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                </div>
                <div class="fb-form-section-body">
                    <div>
                        <div id="keywords-tags" class="flex flex-wrap gap-1.5 p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 min-h-[40px] mb-1.5"></div>
                        <input type="text" id="keywords-input" placeholder="Escribe una keyword y presiona Enter o coma..." class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-primary focus:border-transparent" onkeydown="handleKeywordInput(event)">
                        <p class="text-xs text-gray-400 mt-1">Presiona Enter o coma para agregar cada keyword</p>
                    </div>
                </div>
            </div>

            <!-- Section 3: Response -->
            <div class="fb-form-section">
                <div class="fb-form-section-header" onclick="toggleFormSection(this)">
                    <span class="fb-form-section-title">3. Respuesta</span>
                    <svg class="fb-form-section-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                </div>
                <div class="fb-form-section-body">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mensaje de respuesta <span class="text-red-400">*</span></label>
                        <textarea id="node-message" rows="4" placeholder="Escribe el mensaje que el bot enviará..." class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-primary focus:border-transparent resize-none"></textarea>
                        <div class="fb-char-counter" id="msg-char-counter">0 caracteres</div>
                    </div>
                    <div class="flex items-center justify-between p-3 <?php echo $calendarEnabled ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 opacity-60'; ?> rounded-lg border">
                            <div>
                                <div class="fb-tooltip-wrap">
                                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100">Activa calendario</p>
                                    <span class="fb-tooltip"><?php echo $calendarEnabled ? 'Este nodo activará el flujo de agendamiento de citas' : 'El sistema de calendario está desactivado. Actívalo en Configuración.'; ?></span>
                                </div>
                                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5"><?php echo $calendarEnabled ? 'Delega al asistente de citas' : 'Calendario no disponible'; ?></p>
                            </div>
                            <label class="relative inline-flex items-center <?php echo $calendarEnabled ? 'cursor-pointer' : 'cursor-not-allowed'; ?> ml-2">
                                <input type="checkbox" id="node-requires-calendar" class="sr-only peer" onchange="onCalendarToggle()" <?php echo $calendarEnabled ? '' : 'disabled'; ?>>
                                <div class="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 dark:bg-gray-700"></div>
                            </label>
                        </div>
                    <div id="calendar-notice" class="hidden px-3 py-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-xs text-blue-700 dark:text-blue-300">
                        Este nodo activará el flujo de agendamiento de citas cuando sea alcanzado.
                    </div>
                    <div id="message-preview" class="hidden">
                        <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">Vista previa:</p>
                        <div class="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap"></div>
                    </div>
                </div>
            </div>

            <!-- Section 4: Options -->
            <div class="fb-form-section">
                <div class="fb-form-section-header" onclick="toggleFormSection(this)">
                    <span class="fb-form-section-title">4. Opciones del menú</span>
                    <div class="flex items-center gap-2 ml-auto mr-2">
                        <button onclick="event.stopPropagation(); addOption()" type="button" class="text-xs px-2.5 py-1 bg-primary text-white rounded-md hover:bg-secondary transition-all">+ Agregar</button>
                    </div>
                    <svg class="fb-form-section-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                </div>
                <div class="fb-form-section-body">
                    <div id="options-container" class="space-y-2"></div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nodo siguiente (automático)</label>
                        <select id="node-next" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-primary focus:border-transparent">
                            <option value="">— Ninguno —</option>
                        </select>
                        <p class="text-xs text-gray-400 mt-1">Si ninguna opción coincide, el bot irá aquí</p>
                    </div>
                </div>
            </div>
        </div>

        <div class="flex justify-end gap-3 px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
            <button onclick="closeNodeModal()" class="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">Cancelar</button>
            <button onclick="saveNode()" class="px-4 py-2 bg-primary hover:bg-secondary text-white rounded-lg text-sm font-medium transition-all">Guardar Nodo</button>
        </div>
    </div>
</div>

<?php
$content = ob_get_clean();

$scripts = 'const CALENDAR_ENABLED = ' . ($calendarEnabled ? 'true' : 'false') . ';';
$extraScripts = '<script src="' . (defined('BASE_PATH') ? BASE_PATH : '') . '/assets/js/flow-builder.js"></script>';

require __DIR__ . '/layout.php';
?>
