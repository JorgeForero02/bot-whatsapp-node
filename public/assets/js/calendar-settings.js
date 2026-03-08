function toggleDayInputs(day) {
    const enabled = document.getElementById(day + '-enabled').checked;
    document.getElementById(day + '-start').disabled = !enabled;
    document.getElementById(day + '-end').disabled = !enabled;
}


async function loadSettings() {
    try {
        const response = await fetch('/api/calendar-settings', { cache: 'no-store' });
        const result = await response.json();
        if (!result.success) { showToast('Error al cargar', 'error'); return; }
        const data = result.data || {};

        if (data.timezone)               document.getElementById('timezone').value         = data.timezone;
        if (data.default_duration_minutes) document.getElementById('default_duration').value = data.default_duration_minutes;
        if (data.max_events_per_day)      document.getElementById('max_events').value        = data.max_events_per_day;
        if (data.min_advance_hours)       document.getElementById('min_advance').value       = data.min_advance_hours;

        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        days.forEach(day => {
            // Each day is stored as its own key: business_hours_monday = '{"enabled":true,...}'
            const raw = data['business_hours_' + day];
            if (raw) {
                try {
                    const dayData = typeof raw === 'string' ? JSON.parse(raw) : raw;
                    document.getElementById(day + '-enabled').checked = !!dayData.enabled;
                    document.getElementById(day + '-start').value     = dayData.start || '';
                    document.getElementById(day + '-end').value       = dayData.end   || '';
                } catch(e) { /* ignore parse error for this day */ }
            }
            toggleDayInputs(day);
        });
    } catch (error) {
        showToast('Error al cargar configuración: ' + error.message, 'error');
    }
}

const calendarForm = document.getElementById('calendar-settings-form');
if (calendarForm) {
    calendarForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(e.target);
    
    const businessHours = {};
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    days.forEach(day => {
        businessHours[day] = {
            enabled: document.getElementById(day + '-enabled').checked,
            start: document.getElementById(day + '-start').value,
            end: document.getElementById(day + '-end').value
        };
    });

    // Validation: at least one day must be active
    const atLeastOne = Object.values(businessHours).some(d => d.enabled);
    if (!atLeastOne) {
        showToast('Al menos un día debe estar activo para permitir agendamientos.', 'error');
        return;
    }

    // Validation: end time must be after start time for enabled days
    for (const [day, d] of Object.entries(businessHours)) {
        if (d.enabled && d.start && d.end && d.end <= d.start) {
            const labels = {monday:'Lunes',tuesday:'Martes',wednesday:'Miércoles',thursday:'Jueves',friday:'Viernes',saturday:'Sábado',sunday:'Domingo'};
            showToast(`${labels[day]}: la hora de fin debe ser posterior a la de inicio.`, 'error');
            return;
        }
    }

    // Store each day as its own key to match seed/load format
    const data = {
        timezone:                  formData.get('timezone') || 'America/Bogota',
        default_duration_minutes:  String(parseInt(formData.get('default_duration_minutes')) || 60),
        max_events_per_day:        String(parseInt(formData.get('max_events_per_day'))       || 8),
        min_advance_hours:         String(parseInt(formData.get('min_advance_hours'))        || 1),
    };
    Object.entries(businessHours).forEach(([day, val]) => {
        data['business_hours_' + day] = JSON.stringify(val);
    });

    try {
        const response = await fetch('/api/calendar-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (response.ok && result.success) {
            showToast('Configuración guardada correctamente', 'success');
        } else {
            showToast(result.error || 'Error al guardar configuración', 'error');
        }
    } catch (error) {
        showToast('Error de conexión: ' + error.message, 'error');
    }
    });
}

loadSettings();
