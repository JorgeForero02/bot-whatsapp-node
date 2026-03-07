<?php
$pageTitle = 'Configuración de Calendar - WhatsApp Bot';
$currentPage = 'calendar-settings';

ob_start();
?>

<div class="page-header">
    <h1 class="page-title">Configuración de Google Calendar</h1>
    <p class="page-subtitle">Administra horarios de atención y preferencias de agendamiento</p>
</div>

<div class="settings-grid">
    <div class="settings-main">
        <form id="calendar-settings-form">
        <div class="card">
          <div class="card-header"><span class="card-title">Horarios de Atención</span></div>
          <div class="card-body">
            
            <div class="schedule-table">
                <div class="schedule-header">
                    <div class="form-label">Día</div>
                    <div class="form-label" style="text-align:center;">Activo</div>
                    <div class="form-label">Hora Inicio</div>
                    <div class="form-label">Hora Fin</div>
                </div>

                <?php
                $days = [
                    'monday'    => 'Lunes',
                    'tuesday'   => 'Martes',
                    'wednesday' => 'Miércoles',
                    'thursday'  => 'Jueves',
                    'friday'    => 'Viernes',
                    'saturday'  => 'Sábado',
                    'sunday'    => 'Domingo'
                ];
                foreach ($days as $dayKey => $dayLabel):
                ?>
                <div class="schedule-row">
                    <span class="form-label" style="margin-bottom:0;align-self:center;"><?php echo $dayLabel; ?></span>

                    <div style="display:flex;justify-content:center;align-items:center;">
                        <label class="toggle">
                            <input type="checkbox"
                                   id="<?php echo $dayKey; ?>-enabled"
                                   name="business_hours[<?php echo $dayKey; ?>][enabled]"
                                   onchange="toggleDayInputs('<?php echo $dayKey; ?>')">
                            <span class="toggle-thumb"></span>
                        </label>
                    </div>

                    <input type="time"
                           id="<?php echo $dayKey; ?>-start"
                           name="business_hours[<?php echo $dayKey; ?>][start]"
                           class="form-input day-time-input"
                           disabled>

                    <input type="time"
                           id="<?php echo $dayKey; ?>-end"
                           name="business_hours[<?php echo $dayKey; ?>][end]"
                           class="form-input day-time-input"
                           disabled>
                </div>
                <?php endforeach; ?>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">Configuración de Citas</span></div>
          <div class="card-body">
            <div class="form-row">
                <div class="form-group">
                    <label for="timezone" class="form-label">Zona Horaria</label>
                    <select id="timezone" name="timezone" class="form-select">
                        <option value="America/Bogota">América/Bogotá (GMT-5)</option>
                        <option value="America/Mexico_City">América/Ciudad de México (GMT-6)</option>
                        <option value="America/New_York">América/Nueva York (GMT-5)</option>
                        <option value="America/Los_Angeles">América/Los Ángeles (GMT-8)</option>
                        <option value="America/Chicago">América/Chicago (GMT-6)</option>
                        <option value="America/Lima">América/Lima (GMT-5)</option>
                        <option value="America/Buenos_Aires">América/Buenos Aires (GMT-3)</option>
                        <option value="America/Santiago">América/Santiago (GMT-3)</option>
                        <option value="Europe/Madrid">Europa/Madrid (GMT+1)</option>
                        <option value="Europe/London">Europa/Londres (GMT+0)</option>
                    </select>
                    <p class="form-hint">Zona horaria del negocio para las citas.</p>
                </div>
                <div class="form-group">
                    <label for="default_duration" class="form-label">Duración Predeterminada (min)</label>
                    <input type="number" id="default_duration" name="default_duration_minutes" min="1" step="1" class="form-input">
                    <p class="form-hint">Tiempo por defecto para cada cita.</p>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="max_events" class="form-label">Máx. Citas por Día</label>
                    <input type="number" id="max_events" name="max_events_per_day" min="1" step="1" class="form-input">
                    <p class="form-hint">Límite diario de agendamientos.</p>
                </div>
                <div class="form-group">
                    <label for="min_advance" class="form-label">Anticipación Mínima (horas)</label>
                    <input type="number" id="min_advance" name="min_advance_hours" min="0" step="1" class="form-input">
                    <p class="form-hint">Tiempo mínimo requerido para agendar.</p>
                </div>
            </div>
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:0.75rem;flex-wrap:wrap;">
            <button type="button" onclick="loadSettings()" class="btn btn-secondary btn-md">Cancelar</button>
            <button type="submit" class="btn btn-primary btn-md">
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                Guardar Configuración
            </button>
        </div>
        </form>
    </div>

    <div class="settings-sidebar">
        <div class="card" style="position:sticky;top:calc(var(--topbar-height) + 1rem);">
          <div class="card-header"><span class="card-title">Información</span></div>
          <div class="card-body">
            <div class="form-stack">
                <p class="form-hint">Los cambios se aplican inmediatamente al bot de WhatsApp.</p>
                <p class="form-hint">Al menos un día debe estar activo para permitir agendamientos.</p>
                <p class="form-hint">La hora de fin debe ser posterior a la de inicio.</p>
                <p class="form-hint">La configuración se guarda en la base de datos.</p>
            </div>
          </div>
        </div>
    </div>
</div>

<?php
$content = ob_get_clean();

$scripts = '';
$extraScripts = '<script src="' . (defined('BASE_PATH') ? BASE_PATH : '') . '/assets/js/calendar-settings.js"></script>';

require __DIR__ . '/layout.php';
?>
