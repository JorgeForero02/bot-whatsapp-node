<?php
$pageTitle = 'Configuración Inicial - WhatsApp Bot';
$currentPage = 'onboarding';

ob_start();
?>

<div class="max-w-3xl mx-auto">

    <!-- Progress bar -->
    <div class="mb-8">
        <div class="flex items-center justify-between mb-2">
            <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Configuración Inicial</h1>
            <span id="progress-label" class="text-sm font-medium text-gray-500 dark:text-gray-400">Paso 1 de 7</span>
        </div>
        <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
            <div id="progress-bar" class="bg-primary h-2.5 rounded-full transition-all duration-500" style="width:0%"></div>
        </div>
        <div id="step-indicators" class="flex justify-between mt-2">
            <!-- filled by JS -->
        </div>
    </div>

    <!-- Step panels -->
    <div id="wizard-container">
        <div class="text-center py-16">
            <div class="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
            <p class="mt-4 text-gray-500 dark:text-gray-400">Cargando configuración...</p>
        </div>
    </div>

</div>

<?php
$content = ob_get_clean();

$scripts = '';
$extraScripts = '<script src="' . (defined('BASE_PATH') ? BASE_PATH : '') . '/assets/js/onboarding.js"></script>';

require __DIR__ . '/layout.php';
?>
