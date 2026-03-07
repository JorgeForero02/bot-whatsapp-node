function toggleDayInputs(day) {
    const enabled = document.getElementById(day + '-enabled').checked;
    document.getElementById(day + '-start').disabled = !enabled;
    document.getElementById(day + '-end').disabled = !enabled;
}


async function loadSettings() {
    try {
        const response = await fetch(BASE_PATH + '/api/get-calendar-settings.php', { cache: 'no-store' });
        const data = await response.json();
        
        if (data.error) {
            showToast(data.error, 'error');
            return;
        }
        
        document.getElementById('timezone').value = data.timezone;
        document.getElementById('default_duration').value = data.default_duration_minutes;
        document.getElementById('max_events').value = data.max_events_per_day;
        document.getElementById('min_advance').value = data.min_advance_hours;
        
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        days.forEach(day => {
            const dayData = data.business_hours[day];
            document.getElementById(day + '-enabled').checked = dayData.enabled;
            document.getElementById(day + '-start').value = dayData.start;
            document.getElementById(day + '-end').value = dayData.end;
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
    
    const data = {
        timezone: formData.get('timezone'),
        default_duration_minutes: parseInt(formData.get('default_duration_minutes')),
        max_events_per_day: parseInt(formData.get('max_events_per_day')),
        min_advance_hours: parseInt(formData.get('min_advance_hours')),
        business_hours: {}
    };
    
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    days.forEach(day => {
        data.business_hours[day] = {
            enabled: document.getElementById(day + '-enabled').checked,
            start: document.getElementById(day + '-start').value,
            end: document.getElementById(day + '-end').value
        };
    });
    
    try {
        console.log('Enviando datos:', data);
        
        const response = await fetch(BASE_PATH + '/api/save-calendar-settings.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        console.log('Response status:', response.status);
        const result = await response.json();
        console.log('Response data:', result);
        
        if (response.ok && result.success) {
            showToast(result.message || 'Configuración guardada correctamente', 'success');
        } else {
            showToast(result.error || 'Error al guardar configuración', 'error');
        }
    } catch (error) {
        console.error('Error completo:', error);
        showToast('Error de conexión: ' + error.message, 'error');
    }
    });
}

loadSettings();
