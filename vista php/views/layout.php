<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo $pageTitle ?? 'WhatsApp Bot'; ?></title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>💬</text></svg>">

    <!-- ── Anti-FOUC: apply dark class BEFORE any CSS renders ── -->
    <script>
        (function() {
            var theme = localStorage.getItem('theme');
            var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (theme === 'dark' || (!theme && prefersDark)) {
                document.documentElement.classList.add('dark');
            }
        })();
    </script>

    <!-- BASE_PATH for JS -->
    <script>const BASE_PATH = '<?php echo defined('BASE_PATH') ? BASE_PATH : ''; ?>';</script>

    <!-- Tailwind CSS (local runtime if available, CDN fallback) -->
    <script>
        window.tailwind = window.tailwind || {};
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        primary:       '#075E54',
                        secondary:     '#128C7E',
                        accent:        '#1eb854',
                        'whatsapp-bg': '#ECE5DD',
                    }
                }
            }
        };
    </script>
<?php
$twLocal = __DIR__ . '/../assets/js/vendor/tailwind.cdn.js';
$twSrc   = file_exists($twLocal)
    ? (defined('BASE_PATH') ? BASE_PATH : '') . '/assets/js/vendor/tailwind.cdn.js'
    : 'https://cdn.tailwindcss.com';
?>
    <script src="<?php echo htmlspecialchars($twSrc, ENT_QUOTES); ?>"></script>

    <!-- Design System CSS -->
    <link rel="stylesheet" href="<?php echo defined('BASE_PATH') ? BASE_PATH : ''; ?>/assets/css/app.css">

    <?php if (!empty($extraHead)) echo $extraHead; ?>

    <style>
        /* Chat background patterns (kept from original) */
        .chat-container {
            background-image: url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxkZWZzPjxwYXR0ZXJuIGlkPSJhIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIiB3aWR0aD0iNDAiIGhlaWdodD0iNDAiPjxwYXRoIGQ9Ik0wIDBoNDB2NDBIMHoiIGZpbGw9IiNmOWZhZmIiLz48cGF0aCBkPSJNMCAyMGg0MHYxSDB6TTIwIDBoMXY0MGgtMXoiIGZpbGw9IiNlNWU3ZWIiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjYSkiLz48L3N2Zz4=');
        }
        .dark .chat-container {
            background-image: url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxkZWZzPjxwYXR0ZXJuIGlkPSJhIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIiB3aWR0aD0iNDAiIGhlaWdodD0iNDAiPjxwYXRoIGQ9Ik0wIDBoNDB2NDBIMHoiIGZpbGw9IiMxMTExMjciLz48cGF0aCBkPSJNMCAyMGg0MHYxSDB6TTIwIDBoMXY0MGgtMXoiIGZpbGw9IiMxZjFmMmUiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjYSkiLz48L3N2Zz4=');
        }
        .message-bubble { animation: fadeInUp 0.25s ease; }
    </style>
</head>
<body>

<?php
$bp = defined('BASE_PATH') ? BASE_PATH : '';

$navItems = [
    ['href' => $bp . '/',                  'page' => 'dashboard',        'label' => 'Dashboard',
     'icon' => '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z"/><path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z"/></svg>'],
    ['href' => $bp . '/conversations',     'page' => 'conversations',    'label' => 'Conversaciones',
     'icon' => '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clip-rule="evenodd"/></svg>'],
    ['href' => $bp . '/documents',         'page' => 'documents',        'label' => 'Documentos',
     'icon' => '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clip-rule="evenodd"/></svg>'],
    ['href' => $bp . '/flow-builder',      'page' => 'flow-builder',     'label' => 'Constructor de Flujos', 'id' => 'nav-flow-builder',
     'icon' => '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM14 11a1 1 0 011 1v1h1a1 1 0 110 2h-1v1a1 1 0 11-2 0v-1h-1a1 1 0 110-2h1v-1a1 1 0 011-1z"/></svg>'],
    ['href' => $bp . '/settings',          'page' => 'settings',         'label' => 'Configuración',
     'icon' => '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/></svg>'],
    ['href' => $bp . '/calendar-settings', 'page' => 'calendar-settings','label' => 'Horarios Calendar',
     'icon' => '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"/></svg>'],
    ['href' => $bp . '/credentials',       'page' => 'credentials',      'label' => 'Credenciales',
     'icon' => '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clip-rule="evenodd"/></svg>'],
];

$currentPage = $currentPage ?? 'dashboard';
$breadcrumbs = [
    'dashboard'        => ['Dashboard'],
    'conversations'    => ['Conversaciones'],
    'documents'        => ['Documentos'],
    'flow-builder'     => ['Constructor de Flujos'],
    'settings'         => ['Configuración'],
    'calendar-settings'=> ['Configuración', 'Horarios Calendar'],
    'credentials'      => ['Configuración', 'Credenciales'],
];
$crumbs = $breadcrumbs[$currentPage] ?? [$pageTitle ?? 'Panel'];
?>

<!-- ══════════════════════════════════════════════
     APP SHELL
     ══════════════════════════════════════════════ -->
<div class="app-shell">

  <!-- ── Sidebar Overlay (mobile) ── -->
  <div id="sidebar-overlay" class="sidebar-overlay"></div>

  <!-- ════════════════════════════
       SIDEBAR
       ════════════════════════════ -->
  <aside id="app-sidebar" class="app-sidebar">

    <!-- Logo / Brand -->
    <div style="padding:1.25rem 1rem 1rem;border-bottom:1px solid var(--border-color);flex-shrink:0;">
      <a href="<?php echo $bp; ?>/" style="display:flex;align-items:center;gap:0.625rem;text-decoration:none;">
        <div style="width:2rem;height:2rem;background:var(--color-primary);border-radius:0.5rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="white">
            <path fill-rule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clip-rule="evenodd"/>
          </svg>
        </div>
        <div>
          <div style="font-size:0.9375rem;font-weight:700;color:var(--text-primary);line-height:1.2;">WhatsApp Bot</div>
          <div style="font-size:0.6875rem;color:var(--text-muted);line-height:1;">Panel Admin</div>
        </div>
      </a>
    </div>

    <!-- Bot status indicator -->
    <div id="sidebar-bot-status" style="padding:0.625rem 1rem;border-bottom:1px solid var(--border-color);display:flex;align-items:center;gap:0.5rem;flex-shrink:0;">
      <span class="status-dot pulsing active" id="sidebar-status-dot"></span>
      <span style="font-size:0.75rem;color:var(--text-muted);" id="sidebar-status-label">Bot activo</span>
      <span class="badge badge-neutral" id="sidebar-mode-badge" style="margin-left:auto;font-size:0.625rem;">IA</span>
    </div>

    <!-- Navigation -->
    <nav style="flex:1;padding:0.75rem 0;overflow-y:auto;">
      <?php foreach ($navItems as $item): ?>
        <?php
          $isActive = $currentPage === $item['page'];
          $itemId   = isset($item['id']) ? ' id="' . htmlspecialchars($item['id'], ENT_QUOTES) . '"' : '';
        ?>
        <a href="<?php echo htmlspecialchars($item['href'], ENT_QUOTES); ?>"
           class="sidebar-nav-item<?php echo $isActive ? ' active' : ''; ?>"
           <?php echo $itemId; ?>>
          <span class="nav-icon"><?php echo $item['icon']; ?></span>
          <span><?php echo htmlspecialchars($item['label'], ENT_QUOTES); ?></span>
        </a>
      <?php endforeach; ?>
    </nav>

    <!-- Onboarding progress (shown only if incomplete) -->
    <div id="sidebar-onboarding" style="display:none;padding:0.875rem 1rem;border-top:1px solid var(--border-color);flex-shrink:0;">
      <a href="<?php echo $bp; ?>/onboarding" style="display:block;text-decoration:none;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.375rem;">
          <span style="font-size:0.75rem;font-weight:600;color:var(--text-secondary);">Configuración inicial</span>
          <span style="font-size:0.6875rem;color:var(--text-muted);" id="sidebar-onboarding-pct">0%</span>
        </div>
        <div class="onboarding-progress-bar">
          <div class="onboarding-progress-fill" id="sidebar-onboarding-bar" style="width:0%"></div>
        </div>
        <div style="margin-top:0.375rem;font-size:0.6875rem;color:var(--text-muted);" id="sidebar-onboarding-steps">0/7 pasos</div>
      </a>
    </div>

    <!-- Dark mode toggle at sidebar bottom -->
    <div style="padding:0.875rem 1rem;border-top:1px solid var(--border-color);flex-shrink:0;">
      <button data-action="toggle-dark"
              style="display:flex;align-items:center;gap:0.625rem;width:100%;padding:0.5rem 0.625rem;border-radius:var(--radius-md);border:1px solid var(--border-color);background:var(--bg-elevated);cursor:pointer;color:var(--text-secondary);font-size:0.8125rem;font-weight:500;transition:all 0.15s ease;"
              title="Cambiar tema">
        <svg data-theme-icon="dark" width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/>
        </svg>
        <svg data-theme-icon="light" width="16" height="16" viewBox="0 0 20 20" fill="currentColor" class="hidden">
          <path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd"/>
        </svg>
        <span id="theme-label">Modo oscuro</span>
      </button>
    </div>

  </aside>
  <!-- end sidebar -->

  <!-- ════════════════════════════
       MAIN AREA
       ════════════════════════════ -->
  <div class="app-main">

    <!-- ── Topbar ── -->
    <header class="app-topbar">
      <!-- Hamburger (mobile only) -->
      <button id="sidebar-toggle"
              style="display:none;padding:0.5rem;border-radius:var(--radius-md);border:1px solid var(--border-color);background:transparent;cursor:pointer;color:var(--text-secondary);flex-shrink:0;"
              aria-label="Abrir menú">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"/>
        </svg>
      </button>

      <!-- Breadcrumb -->
      <nav class="breadcrumb" style="flex:1;min-width:0;">
        <a href="<?php echo $bp; ?>/" style="color:var(--text-muted);text-decoration:none;font-size:0.8125rem;">
          Panel
        </a>
        <?php foreach ($crumbs as $i => $crumb): ?>
          <span class="breadcrumb-sep">/</span>
          <?php if ($i === count($crumbs) - 1): ?>
            <span class="breadcrumb-current"><?php echo htmlspecialchars($crumb, ENT_QUOTES); ?></span>
          <?php else: ?>
            <span style="color:var(--text-muted);"><?php echo htmlspecialchars($crumb, ENT_QUOTES); ?></span>
          <?php endif; ?>
        <?php endforeach; ?>
      </nav>

      <!-- Spacer -->
      <div style="flex:1;"></div>

      <!-- Dark mode toggle (topbar, visible on mobile too via media query) -->
      <button data-action="toggle-dark"
              class="btn btn-ghost btn-icon"
              title="Cambiar tema"
              style="flex-shrink:0;">
        <svg data-theme-icon="dark" width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/>
        </svg>
        <svg data-theme-icon="light" width="18" height="18" viewBox="0 0 20 20" fill="currentColor" class="hidden">
          <path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd"/>
        </svg>
      </button>
    </header>

    <!-- ── Page Content ── -->
    <main class="app-content">
      <?php echo $content ?? ''; ?>
    </main>

  </div><!-- end app-main -->

</div><!-- end app-shell -->

<!-- Toast container (created by app.js if missing, but pre-rendered for instant availability) -->
<div id="toast-container"></div>

<!-- Scripts -->
<script src="<?php echo $bp; ?>/assets/js/app.js"></script>
<script src="<?php echo $bp; ?>/assets/js/layout.js"></script>
<?php if (!empty($extraScripts)) echo $extraScripts; ?>
<?php if (!empty($scripts)): ?>
<script>
<?php echo $scripts; ?>
</script>
<?php endif; ?>
</body>
</html>
