<?php
$pageTitle = 'Dashboard - WhatsApp Bot';
$currentPage = 'dashboard';

ob_start();
?>

<!-- Onboarding banner -->
<div id="onboarding-banner" style="display:none;margin-bottom:1.25rem;"></div>

<!-- Page header -->
<div class="page-header">
  <h1 class="page-title">Dashboard</h1>
  <p class="page-subtitle">Vista general del sistema y estadísticas en tiempo real</p>
</div>

<!-- ── Stat Cards row ── -->
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem;margin-bottom:1.5rem;">
  <div class="stat-card" id="sc-today">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;margin-bottom:0.875rem;">
      <div class="stat-card-icon" style="background:rgba(37,99,235,0.1);">
        <span style="display:flex;width:1.25rem;height:1.25rem;color:#2563eb;">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clip-rule="evenodd"/></svg>
        </span>
      </div>
    </div>
    <div class="stat-card-value" id="sc-today-val">—</div>
    <div class="stat-card-label">Conversaciones hoy</div>
  </div>

  <div class="stat-card" id="sc-messages">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;margin-bottom:0.875rem;">
      <div class="stat-card-icon" style="background:rgba(22,163,74,0.1);">
        <span style="display:flex;width:1.25rem;height:1.25rem;color:#16a34a;">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H4l-2 2V5z" clip-rule="evenodd"/></svg>
        </span>
      </div>
    </div>
    <div class="stat-card-value" id="sc-messages-val">—</div>
    <div class="stat-card-label">Mensajes totales</div>
  </div>

  <div class="stat-card" id="sc-pending">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;margin-bottom:0.875rem;">
      <div class="stat-card-icon" style="background:rgba(217,119,6,0.1);">
        <span style="display:flex;width:1.25rem;height:1.25rem;color:#d97706;">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
        </span>
      </div>
    </div>
    <div class="stat-card-value" id="sc-pending-val">—</div>
    <div class="stat-card-label">Pendientes humano</div>
  </div>

  <div class="stat-card" id="sc-docs">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;margin-bottom:0.875rem;">
      <div class="stat-card-icon" style="background:rgba(124,58,237,0.1);">
        <span style="display:flex;width:1.25rem;height:1.25rem;color:#7c3aed;">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clip-rule="evenodd"/></svg>
        </span>
      </div>
    </div>
    <div class="stat-card-value" id="sc-docs-val">—</div>
    <div class="stat-card-label">Documentos indexados</div>
  </div>
</div>

<!-- ── Main grid: chart + recent convs ── -->
<div id="dash-main-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;margin-bottom:1.25rem;">

  <!-- Messages chart -->
  <div class="card">
    <div class="card-header">
      <span style="font-size:0.9375rem;font-weight:600;color:var(--text-primary);">Actividad — últimos 7 días</span>
    </div>
    <div class="card-body" style="padding:1rem;">
      <div style="position:relative;height:180px;">
        <canvas id="messages-chart"></canvas>
      </div>
    </div>
  </div>

  <!-- Service status -->
  <div class="card">
    <div class="card-header">
      <span style="font-size:0.9375rem;font-weight:600;color:var(--text-primary);">Estado de servicios</span>
    </div>
    <div class="card-body" style="padding:0;">
      <div id="services-list" style="padding:0.5rem 0;">
        <div style="display:flex;align-items:center;justify-content:center;padding:2rem;">
          <div class="spinner"></div>
        </div>
      </div>
    </div>
  </div>

</div>

<!-- ── Bottom grid: recent conversations + calendar ── -->
<div id="dash-bottom-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;">

  <!-- Recent conversations -->
  <div class="card">
    <div class="card-header">
      <span style="font-size:0.9375rem;font-weight:600;color:var(--text-primary);">Conversaciones recientes</span>
      <a href="<?php echo defined('BASE_PATH') ? BASE_PATH : ''; ?>/conversations"
         style="font-size:0.8125rem;color:var(--color-primary);text-decoration:none;font-weight:500;">Ver todas →</a>
    </div>
    <div id="recent-convs" class="card-body" style="padding:0;">
      <div style="display:flex;align-items:center;justify-content:center;padding:2rem;">
        <div class="spinner"></div>
      </div>
    </div>
  </div>

  <!-- Calendar events -->
  <div class="card" id="calendar-card">
    <div class="card-header">
      <span style="font-size:0.9375rem;font-weight:600;color:var(--text-primary);">Citas de hoy</span>
      <a href="<?php echo defined('BASE_PATH') ? BASE_PATH : ''; ?>/calendar-settings"
         style="font-size:0.8125rem;color:var(--color-primary);text-decoration:none;font-weight:500;">Configurar →</a>
    </div>
    <div id="calendar-events" class="card-body" style="padding:0;">
      <div style="display:flex;align-items:center;justify-content:center;padding:2rem;">
        <div class="spinner"></div>
      </div>
    </div>
  </div>

</div>

<!-- Responsive: stack on mobile -->
<style>
@media (max-width: 767px) {
  #dash-main-grid, #dash-bottom-grid {
    grid-template-columns: 1fr !important;
  }
}
</style>

<?php
$content = ob_get_clean();

$scripts = '';

/* Load Chart.js 4.4.4 before page scripts */
$localChart = __DIR__ . '/../assets/js/vendor/chart.umd.min.js';
$chartSrc   = file_exists($localChart)
    ? (defined('BASE_PATH') ? BASE_PATH : '') . '/assets/js/vendor/chart.umd.min.js'
    : 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js';
$extraHead = '<script src="' . htmlspecialchars($chartSrc, ENT_QUOTES) . '"></script>';

$extraScripts = '<script src="' . (defined('BASE_PATH') ? BASE_PATH : '') . '/assets/js/dashboard.js"></script>';

require __DIR__ . '/layout.php';
?>
