(function() {

const bp = typeof BASE_PATH !== 'undefined' ? BASE_PATH : '';

let chartInstance = null;

function initChart(labels, data) {
  const canvas = document.getElementById('messages-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const isDark = document.documentElement.classList.contains('dark');
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const tickColor = isDark ? '#475569' : '#94a3b8';

  const gradient = ctx.createLinearGradient(0, 0, 0, 180);
  gradient.addColorStop(0, 'rgba(7,94,84,0.25)');
  gradient.addColorStop(1, 'rgba(7,94,84,0)');

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Mensajes',
        data,
        fill: true,
        backgroundColor: gradient,
        borderColor: '#075E54',
        borderWidth: 2,
        pointBackgroundColor: '#075E54',
        pointRadius: 3,
        pointHoverRadius: 5,
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? '#1a1a24' : '#ffffff',
          titleColor: isDark ? '#f1f5f9' : '#0f172a',
          bodyColor: isDark ? '#94a3b8' : '#475569',
          borderColor: isDark ? '#1e1e2e' : '#e2e8f0',
          borderWidth: 1,
          padding: 10,
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: tickColor, font: { size: 11 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: gridColor },
          ticks: { color: tickColor, font: { size: 11 }, maxTicksLimit: 5 }
        }
      }
    }
  });
}

function setStatCard(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function renderServices(waOk, oaiOk, gcOk) {
  const services = [
    { label: 'WhatsApp',       ok: waOk,  href: bp + '/credentials',       icon: '<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7z" clip-rule="evenodd"/></svg>' },
    { label: 'OpenAI',         ok: oaiOk, href: bp + '/credentials',       icon: '<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>' },
    { label: 'Google Calendar', ok: gcOk, href: bp + '/credentials',       icon: '<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"/></svg>' },
  ];

  const html = services.map(s => {
    const statusClass = s.ok === true ? 'badge-success' : s.ok === false ? 'badge-warning' : 'badge-neutral';
    const statusText  = s.ok === true ? 'Conectado' : s.ok === false ? 'Sin configurar' : 'Verificando';
    return `
      <div style="display:flex;align-items:center;padding:0.75rem 1.25rem;border-bottom:1px solid var(--border-subtle);">
        <span style="color:var(--text-muted);margin-right:0.625rem;display:flex;">${s.icon}</span>
        <span style="font-size:0.875rem;font-weight:500;color:var(--text-secondary);flex:1;">${s.label}</span>
        <span class="badge ${statusClass}">${statusText}</span>
        ${s.ok !== true ? `<a href="${s.href}" style="font-size:0.75rem;color:var(--color-primary);text-decoration:none;margin-left:0.75rem;">Configurar</a>` : ''}
      </div>
    `;
  }).join('');

  const container = document.getElementById('services-list');
  if (container) container.innerHTML = html;
}

function renderRecentConvs(conversations) {
  const container = document.getElementById('recent-convs');
  if (!container) return;

  if (!conversations || conversations.length === 0) {
    container.innerHTML = `
      <div style="padding:2rem;text-align:center;color:var(--text-muted);font-size:0.875rem;">
        No hay conversaciones recientes
      </div>`;
    return;
  }

  const statusMap = {
    active:        { cls: 'badge-success', label: 'Activa' },
    pending_human: { cls: 'badge-warning', label: 'Pendiente' },
    closed:        { cls: 'badge-neutral', label: 'Cerrada' },
  };

  const html = conversations.slice(0, 6).map(conv => {
    const initial   = (conv.contactName || conv.phoneNumber || '?').charAt(0).toUpperCase();
    const name      = conv.contactName || conv.phoneNumber || 'Sin nombre';
    const preview   = (conv.lastMessage || 'Sin mensajes').substring(0, 45);
    const timeAgo   = window.formatTimeAgo ? window.formatTimeAgo(conv.lastMessageAt) : '';
    const s         = statusMap[conv.status] || statusMap.closed;
    return `
      <a href="${bp}/conversations" style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem 1.25rem;border-bottom:1px solid var(--border-subtle);text-decoration:none;transition:background 0.15s ease;" 
         onmouseover="this.style.background='var(--bg-elevated)'" onmouseout="this.style.background=''">
        <div class="avatar avatar-sm" style="background:var(--color-primary);flex-shrink:0;">${escapeHtml(initial)}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.125rem;">
            <span style="font-size:0.875rem;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px;">${escapeHtml(name)}</span>
            <span style="font-size:0.6875rem;color:var(--text-muted);flex-shrink:0;margin-left:0.5rem;">${escapeHtml(timeAgo)}</span>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;">
            <span style="font-size:0.8125rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(preview)}${(conv.lastMessage || '').length > 45 ? '…' : ''}</span>
            <span class="badge ${s.cls}" style="flex-shrink:0;">${s.label}</span>
          </div>
        </div>
      </a>
    `;
  }).join('');

  container.innerHTML = html;
}

function renderCalendarEvents(events, calendarEnabled) {
  const container = document.getElementById('calendar-events');
  if (!container) return;

  if (!calendarEnabled) {
    container.innerHTML = `
      <div style="padding:1.5rem 1.25rem;text-align:center;">
        <span class="badge badge-neutral" style="margin-bottom:0.5rem;">Desactivado</span>
        <p style="font-size:0.8125rem;color:var(--text-muted);">Activa Google Calendar en <a href="${bp}/credentials" style="color:var(--color-primary);">Credenciales</a></p>
      </div>`;
    return;
  }

  if (!events || events.length === 0) {
    container.innerHTML = `
      <div style="padding:2rem;text-align:center;color:var(--text-muted);font-size:0.875rem;">
        No hay citas programadas para hoy
      </div>`;
    return;
  }

  const html = events.slice(0, 4).map(ev => {
    const startStr = (ev.start && (ev.start.dateTime || ev.start.date)) || '';
    let time = '';
    if (startStr) {
      try {
        const d = new Date(startStr);
        time = d.toLocaleDateString('es', {day:'2-digit',month:'short'}) + ' ' + d.toLocaleTimeString('es', {hour:'2-digit',minute:'2-digit'});
      } catch(_) { time = startStr; }
    }
    return `
      <div style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem 1.25rem;border-bottom:1px solid var(--border-subtle);">
        <div style="width:2.5rem;height:2.5rem;border-radius:var(--radius-md);background:rgba(7,94,84,0.1);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="var(--color-primary)">
            <path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"/>
          </svg>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:0.875rem;font-weight:500;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(ev.summary || 'Cita')}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(time)}</div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

async function loadDashboard() {
  try {
    const [statsRes, convsRes, connRes, settingsRes, docsRes] = await Promise.allSettled([
      fetch(bp + '/api/dashboard-stats', { cache: 'no-store' }),
      fetch(bp + '/api/conversations?page=1', { cache: 'no-store' }),
      fetch(bp + '/api/test-connection', { cache: 'no-store' }),
      fetch(bp + '/api/settings', { cache: 'no-store' }),
      fetch(bp + '/api/documents', { cache: 'no-store' }),
    ]);

    if (statsRes.status === 'fulfilled') {
      const d = await statsRes.value.json();
      if (d.success && d.data) {
        const s = d.data;
        setStatCard('sc-today-val',    s.totalConversations ?? '—');
        setStatCard('sc-messages-val', s.todayMessages ?? s.totalMessages ?? '—');
        setStatCard('sc-pending-val',  s.pendingHumanConversations ?? '—');
        let docCount = '—';
        if (docsRes.status === 'fulfilled') {
          try {
            const dd = await docsRes.value.json();
            if (dd.success && Array.isArray(dd.data)) docCount = dd.data.length;
          } catch(_) {}
        }
        setStatCard('sc-docs-val', docCount);

        const chartData   = Array(7).fill(0);
        if (s.todayMessages) chartData[6] = s.todayMessages;
        const today       = new Date();
        const chartLabels = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(today);
          d.setDate(today.getDate() - (6 - i));
          return d.toLocaleDateString('es', { weekday: 'short', day: 'numeric' });
        });
        if (typeof Chart !== 'undefined') initChart(chartLabels, chartData);
      }
    }

    if (convsRes.status === 'fulfilled') {
      const d = await convsRes.value.json();
      if (d.success && d.data) renderRecentConvs(d.data.conversations || []);
      else renderRecentConvs([]);
    } else {
      renderRecentConvs([]);
    }

    let calendarEnabled = false;
    if (settingsRes.status === 'fulfilled') {
      const d = await settingsRes.value.json();
      if (d.success && d.data) calendarEnabled = d.data.calendar_enabled === 'true';
    }

    let waOk = null, oaiOk = null, gcOk = null;
    try {
      const credRes = await fetch(bp + '/api/credentials', { cache: 'no-store' });
      const credData = await credRes.json();
      if (credData.success && credData.data) {
        waOk  = credData.data.whatsapp  ? credData.data.whatsapp.configured  : false;
        oaiOk = credData.data.openai    ? credData.data.openai.configured    : false;
        gcOk  = credData.data.google ? credData.data.google.configured : false;
      }
    } catch(_) {}
    renderServices(waOk, oaiOk, gcOk);

    if (calendarEnabled) {
      try {
        const gcEvRes = await fetch(bp + '/api/calendar-events', { cache: 'no-store' });
        const gcEvData = await gcEvRes.json();
        renderCalendarEvents(gcEvData.success ? (gcEvData.data || []) : [], true);
      } catch(_) { renderCalendarEvents([], true); }
    } else {
      renderCalendarEvents([], false);
    }

  } catch (err) {
    console.error('Dashboard load error:', err);
  }
}

async function loadOnboardingBanner() {
  try {
    const res  = await fetch(bp + '/api/onboarding-progress', { cache: 'no-store' });
    const data = await res.json();
    if (!data.success) return;

    const banner = document.getElementById('onboarding-banner');
    if (!banner) return;

    const progress = data.data || {};
    if (progress.completedCount >= progress.totalCount) {
      return;
    } else {
      const steps = progress.steps || [];
      const done  = steps.filter(s => s.isCompleted || s.isSkipped).length;
      const total = steps.length;
      const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
      banner.style.display = '';
      banner.innerHTML = `
        <div class="alert alert-warning" style="justify-content:space-between;flex-wrap:wrap;gap:0.75rem;">
          <span class="alert-icon"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/></svg></span>
          <div style="flex:1;min-width:200px;">
            <p style="font-weight:600;">Configuración en progreso — ${done}/${total} pasos</p>
            <div style="margin-top:0.375rem;height:4px;border-radius:2px;background:rgba(217,119,6,0.2);overflow:hidden;">
              <div style="height:100%;width:${pct}%;background:var(--color-warning);border-radius:2px;transition:width 0.5s ease;"></div>
            </div>
          </div>
          <a href="${bp}/onboarding" class="btn btn-sm" style="background:var(--color-warning);color:#fff;flex-shrink:0;">Continuar configuración</a>
        </div>`;
    }
  } catch(e) { /* silently ignore */ }
}

loadDashboard();
loadOnboardingBanner();

if (window.visibilityInterval) {
  visibilityInterval(loadDashboard, 30000);
} else {
  setInterval(loadDashboard, 30000);
}

})();
