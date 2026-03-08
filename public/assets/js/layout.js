(function() {
    function checkMobile() {
        var btn = document.getElementById('sidebar-toggle');
        if (btn) btn.style.display = window.innerWidth < 768 ? 'flex' : 'none';
    }
    checkMobile();
    window.addEventListener('resize', checkMobile);

    function syncThemeLabel() {
        var isDark  = document.documentElement.classList.contains('dark');
        var label   = document.getElementById('theme-label');
        if (label) label.textContent = isDark ? 'Modo claro' : 'Modo oscuro';
        document.querySelectorAll('[data-theme-icon]').forEach(function(el) {
            var icon = el.getAttribute('data-theme-icon');
            if (icon === 'light') el.classList.toggle('hidden', !isDark);
            if (icon === 'dark')  el.classList.toggle('hidden', isDark);
        });
    }
    syncThemeLabel();
    var _origToggle = window.DarkMode && DarkMode.toggle;
    document.querySelectorAll('[data-action="toggle-dark"]').forEach(function(btn) {
        btn.addEventListener('click', function() { setTimeout(syncThemeLabel, 10); });
    });

    (async function() {
        try {
            var bp = typeof BASE_PATH !== 'undefined' ? BASE_PATH : '';

            var oRes  = await fetch(bp + '/api/onboarding-progress', { cache: 'no-store' });
            var oData = await oRes.json();
            if (oData.success && oData.data) {
                var progress = oData.data;
                var steps   = progress.steps || [];
                var total   = steps.length;
                var done    = steps.filter(function(s){ return s.isCompleted || s.isSkipped; }).length;
                var pct     = total > 0 ? Math.round((done / total) * 100) : 0;
                var complete = progress.completedCount >= progress.totalCount;

                if (!complete) {
                    var sidebarOB = document.getElementById('sidebar-onboarding');
                    if (sidebarOB) sidebarOB.style.display = '';
                    var bar  = document.getElementById('sidebar-onboarding-bar');
                    var pctEl = document.getElementById('sidebar-onboarding-pct');
                    var stepsEl = document.getElementById('sidebar-onboarding-steps');
                    if (bar)    bar.style.width = pct + '%';
                    if (pctEl)  pctEl.textContent = pct + '%';
                    if (stepsEl) stepsEl.textContent = done + '/' + total + ' pasos';
                }
            }

            var sRes   = await fetch(bp + '/api/settings', { cache: 'no-store' });
            var sData  = await sRes.json();
            var isClassic = sData.success && sData.data && sData.data.bot_mode === 'classic';

            var flowLink = document.getElementById('nav-flow-builder');
            if (flowLink) flowLink.style.display = isClassic ? '' : 'none';

            var modeBadge = document.getElementById('sidebar-mode-badge');
            if (modeBadge) modeBadge.textContent = isClassic ? 'Clásico' : 'IA';

        } catch(e) { /* silently ignore — tables may not exist yet */ }
    })();
})();
