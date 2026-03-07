<?php
$pageTitle = 'Documentos - WhatsApp Bot';
$currentPage = 'documents';

ob_start();
?>

<!-- Page header -->
<div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;">
  <div>
    <h1 class="page-title">Documentos</h1>
    <p class="page-subtitle">Base de conocimiento del bot &mdash; sube y gestiona documentos</p>
  </div>
  <button onclick="loadDocuments()" class="btn btn-secondary btn-md">
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/></svg>
    Actualizar
  </button>
</div>

<style>
.drop-zone {
  border: 2px dashed var(--border-color);
  border-radius: var(--radius-xl);
  padding: 2rem;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
  background: var(--bg-elevated);
}
.drop-zone:hover, .drop-zone.drag-over {
  border-color: var(--color-primary);
  background: rgba(7,94,84,0.04);
}
.docs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1rem;
}
.doc-card { transition: box-shadow 0.2s, transform 0.2s; }
.doc-card:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }
</style>

<!-- Stats row -->
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:1rem;margin-bottom:1.5rem;">
  <div class="stat-card">
    <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem;">
      <div class="stat-card-icon" style="background:rgba(124,58,237,0.1);">
        <span style="color:#7c3aed;display:flex;width:1.25rem;height:1.25rem;">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clip-rule="evenodd"/></svg>
        </span>
      </div>
    </div>
    <div class="stat-card-value" id="stat-total-docs">&mdash;</div>
    <div class="stat-card-label">Documentos totales</div>
  </div>
  <div class="stat-card">
    <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem;">
      <div class="stat-card-icon" style="background:rgba(37,99,235,0.1);">
        <span style="color:#2563eb;display:flex;width:1.25rem;height:1.25rem;">
          <svg viewBox="0 0 20 20" fill="currentColor"><path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z"/><path d="M3 7v3c0 1.657 3.134 3 7 3s7-1.343 7-3V7c0 1.657-3.134 3-7 3S3 8.657 3 7z"/><path d="M17 5c0 1.657-3.134 3-7 3S3 6.657 3 5s3.134-3 7-3 7 1.343 7 3z"/></svg>
        </span>
      </div>
    </div>
    <div class="stat-card-value" id="stat-total-vectors">&mdash;</div>
    <div class="stat-card-label">Vectores indexados</div>
  </div>
  <div class="stat-card">
    <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem;">
      <div class="stat-card-icon" style="background:rgba(22,163,74,0.1);">
        <span style="color:#16a34a;display:flex;width:1.25rem;height:1.25rem;">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
        </span>
      </div>
    </div>
    <div class="stat-card-value" id="stat-total-size">&mdash;</div>
    <div class="stat-card-label">Espacio usado</div>
  </div>
</div>

<!-- Upload + Info row -->
<div style="display:grid;grid-template-columns:1fr 300px;gap:1.25rem;margin-bottom:1.5rem;">

  <!-- Upload zone -->
  <div class="card">
    <div class="card-header">
      <span style="font-size:0.9375rem;font-weight:600;color:var(--text-primary);">Subir nuevo documento</span>
    </div>
    <div class="card-body">
      <div id="drop-zone" class="drop-zone">
        <svg width="40" height="40" viewBox="0 0 20 20" fill="currentColor" style="margin:0 auto 0.875rem;display:block;color:var(--text-muted);">
          <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
        </svg>
        <p style="font-size:0.9375rem;font-weight:600;color:var(--text-secondary);margin-bottom:0.375rem;" id="drop-hint">Arrastra un archivo aqu&iacute; o haz clic para seleccionar</p>
        <p style="font-size:0.8125rem;color:var(--text-muted);">PDF, DOCX, TXT &mdash; m&aacute;x. 10 MB</p>
        <input type="file" id="file-input" name="document" accept=".pdf,.docx,.txt" style="display:none;">
      </div>

      <div id="file-preview" style="display:none;margin-top:0.875rem;padding:0.875rem;border-radius:var(--radius-lg);border:1px solid var(--border-color);align-items:center;gap:0.75rem;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:0.875rem;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" id="preview-filename"></div>
          <div style="font-size:0.75rem;color:var(--text-muted);" id="preview-filesize"></div>
        </div>
      </div>

      <div id="upload-progress" style="display:none;margin-top:0.875rem;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.375rem;">
          <span style="font-size:0.8125rem;color:var(--text-secondary);">Subiendo&hellip;</span>
          <span style="font-size:0.8125rem;font-weight:600;color:var(--text-primary);" id="upload-progress-pct">0%</span>
        </div>
        <div style="height:6px;border-radius:3px;background:var(--border-color);overflow:hidden;">
          <div id="upload-progress-bar" style="height:100%;width:0%;background:var(--color-primary);border-radius:3px;transition:width 0.2s ease;"></div>
        </div>
      </div>

      <button id="upload-btn" onclick="doUploadDocument()" class="btn btn-primary btn-md" style="width:100%;margin-top:1rem;" disabled>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>
        Subir documento
      </button>
    </div>
  </div>

  <!-- Info card -->
  <div class="card">
    <div class="card-header">
      <span style="font-size:0.9375rem;font-weight:600;color:var(--text-primary);">Informaci&oacute;n</span>
    </div>
    <div class="card-body" style="display:flex;flex-direction:column;gap:1rem;">
      <div style="display:flex;align-items:flex-start;gap:0.625rem;">
        <span class="badge badge-info" style="flex-shrink:0;margin-top:1px;">PDF</span>
        <p style="font-size:0.8125rem;color:var(--text-secondary);">Manuales, gu&iacute;as, documentaci&oacute;n t&eacute;cnica</p>
      </div>
      <div style="display:flex;align-items:flex-start;gap:0.625rem;">
        <span class="badge badge-info" style="flex-shrink:0;margin-top:1px;">DOCX</span>
        <p style="font-size:0.8125rem;color:var(--text-secondary);">Pol&iacute;ticas, procedimientos, contratos</p>
      </div>
      <div style="display:flex;align-items:flex-start;gap:0.625rem;">
        <span class="badge badge-neutral" style="flex-shrink:0;margin-top:1px;">TXT</span>
        <p style="font-size:0.8125rem;color:var(--text-secondary);">FAQs, notas, texto plano</p>
      </div>
      <div class="divider"></div>
      <p style="font-size:0.8125rem;color:var(--text-muted);line-height:1.6;">Los documentos se dividen en chunks y se indexan como vectores para b&uacute;squeda sem&aacute;ntica.</p>
    </div>
  </div>

</div>

<!-- Documents grid -->
<div class="card">
  <div class="card-header">
    <span style="font-size:0.9375rem;font-weight:600;color:var(--text-primary);">Documentos indexados</span>
  </div>
  <div class="card-body">
    <div id="documents-container" style="text-align:center;padding:2rem;color:var(--text-muted);">
      <div class="spinner spinner-lg" style="margin:0 auto 1rem;"></div>
      <p>Cargando documentos&hellip;</p>
    </div>
  </div>
</div>

<!-- Modal para ver contenido del documento -->
<div id="document-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;align-items:center;justify-content:center;padding:1rem;">
  <div style="background:var(--bg-surface);border-radius:var(--radius-xl);box-shadow:var(--shadow-xl);max-width:56rem;width:100%;max-height:90vh;display:flex;flex-direction:column;border:1px solid var(--border-color);">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:1.25rem 1.5rem;border-bottom:1px solid var(--border-color);">
      <h3 style="font-size:1rem;font-weight:600;color:var(--text-primary);margin:0;" id="modal-document-name">Documento</h3>
      <button onclick="closeDocumentModal()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:0.25rem;" title="Cerrar">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
      </button>
    </div>
    <div id="modal-document-content" style="flex:1;overflow-y:auto;padding:1.5rem;background:var(--bg-elevated);">
      <div style="text-align:center;padding:3rem;"><div class="spinner spinner-lg" style="margin:0 auto 1rem;"></div><p style="color:var(--text-muted);">Cargando contenido&hellip;</p></div>
    </div>
    <div style="padding:1rem 1.5rem;border-top:1px solid var(--border-color);">
      <button onclick="closeDocumentModal()" class="btn btn-primary btn-md" style="width:100%;">Cerrar</button>
    </div>
  </div>
</div>

<?php
$content = ob_get_clean();

ob_start();
?>

var _selectedFile = null;

/* ── Drop zone ── */
(function() {
  var dropZone  = document.getElementById('drop-zone');
  var fileInput = document.getElementById('file-input');

  if (dropZone) {
    dropZone.addEventListener('click', function() { fileInput && fileInput.click(); });
    dropZone.addEventListener('dragover', function(e) { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', function() { dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', function(e) {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
    });
  }
  if (fileInput) {
    fileInput.addEventListener('change', function(e) { if (e.target.files[0]) handleFileSelect(e.target.files[0]); });
  }
})();

function handleFileSelect(file) {
  _selectedFile = file;
  var preview  = document.getElementById('file-preview');
  var fname    = document.getElementById('preview-filename');
  var fsize    = document.getElementById('preview-filesize');
  var btn      = document.getElementById('upload-btn');
  var hint     = document.getElementById('drop-hint');
  if (preview) preview.style.display = 'flex';
  if (fname)   fname.textContent = file.name;
  if (fsize)   fsize.textContent = formatBytes(file.size);
  if (btn)     btn.disabled = false;
  if (hint)    hint.textContent = 'Archivo seleccionado \u2014 clic en \u201cSubir documento\u201d para continuar';
}

function doUploadDocument() {
  if (!_selectedFile) return;
  var btn         = document.getElementById('upload-btn');
  var progressDiv = document.getElementById('upload-progress');
  var progressBar = document.getElementById('upload-progress-bar');
  var progressPct = document.getElementById('upload-progress-pct');

  if (btn) btn.disabled = true;
  if (progressDiv) progressDiv.style.display = '';

  var formData = new FormData();
  formData.append('document', _selectedFile);

  var xhr = new XMLHttpRequest();
  xhr.open('POST', BASE_PATH + '/api/upload.php');

  xhr.upload.addEventListener('progress', function(e) {
    if (e.lengthComputable) {
      var pct = Math.round(e.loaded / e.total * 100);
      if (progressBar) progressBar.style.width = pct + '%';
      if (progressPct) progressPct.textContent = pct + '%';
    }
  });

  xhr.addEventListener('load', function() {
    try {
      var data = JSON.parse(xhr.responseText);
      if (data.success) {
        showToast('Documento subido y procesado correctamente', 'success');
        resetUploadUI();
        loadDocuments();
        loadStats();
      } else {
        throw new Error(data.error || 'Error al subir');
      }
    } catch(e) {
      showToast('Error: ' + e.message, 'error');
      if (btn) btn.disabled = false;
      if (progressDiv) progressDiv.style.display = 'none';
    }
  });

  xhr.addEventListener('error', function() {
    showToast('Error de red al subir el archivo', 'error');
    if (btn) btn.disabled = false;
    if (progressDiv) progressDiv.style.display = 'none';
  });

  xhr.send(formData);
}

function resetUploadUI() {
  _selectedFile = null;
  var fileInput   = document.getElementById('file-input');
  var preview     = document.getElementById('file-preview');
  var progressDiv = document.getElementById('upload-progress');
  var progressBar = document.getElementById('upload-progress-bar');
  var progressPct = document.getElementById('upload-progress-pct');
  var btn         = document.getElementById('upload-btn');
  var hint        = document.getElementById('drop-hint');
  if (fileInput)   fileInput.value = '';
  if (preview)     preview.style.display = 'none';
  if (progressDiv) progressDiv.style.display = 'none';
  if (progressBar) progressBar.style.width = '0%';
  if (progressPct) progressPct.textContent = '0%';
  if (btn)         btn.disabled = true;
  if (hint)        hint.textContent = 'Arrastra un archivo aqu\u00ed o haz clic para seleccionar';
}

function loadStats() {
  fetch(BASE_PATH + '/api/get-stats.php')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.success || !data.stats) return;
      var s = data.stats;
      var el;
      el = document.getElementById('stat-total-docs');    if (el) el.textContent = (s.documents && s.documents.total != null) ? s.documents.total : '\u2014';
      el = document.getElementById('stat-total-vectors'); if (el) el.textContent = s.vectors != null ? s.vectors : '\u2014';
      el = document.getElementById('stat-total-size');    if (el) el.textContent = (s.documents && s.documents.total_size != null) ? formatBytes(s.documents.total_size) : '\u2014';
    })
    .catch(function() {});
}

function loadDocuments() {
  var container = document.getElementById('documents-container');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);"><div class="spinner spinner-lg" style="margin:0 auto 1rem;"></div><p>Cargando documentos\u2026</p></div>';

  fetch(BASE_PATH + '/api/get-documents.php')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.success) throw new Error(data.error || 'Error');
      var docs = data.documents || [];

      if (docs.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:4rem 2rem;color:var(--text-muted);"><p style="font-size:1rem;font-weight:500;">No hay documentos a\u00fan</p><p style="font-size:0.875rem;margin-top:0.25rem;">Sube tu primer documento para comenzar</p></div>';
        return;
      }

      var FILE_COLORS = { pdf:'#ef4444', doc:'#2563eb', docx:'#2563eb', txt:'#64748b' };
      var FILE_ICONS = {
        pdf:  'M9 2a2 2 0 00-2 2v1H5a2 2 0 00-2 2v11a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2V4a2 2 0 00-2-2H9zm0 2h2v1H9V4zM5 7h10v11H5V7z',
        doc:  'M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z',
        txt:  'M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z'
      };
      var DEFAULT_ICON = 'M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z';

      var html = '<div class="docs-grid">';
      docs.forEach(function(doc) {
        var ext   = (doc.original_name || doc.filename || '').split('.').pop().toLowerCase();
        var name  = doc.original_name || doc.filename || 'Sin nombre';
        var color = FILE_COLORS[ext] || '#7c3aed';
        var icon  = FILE_ICONS[ext]  || DEFAULT_ICON;
        var date  = doc.created_at ? new Date(doc.created_at).toLocaleDateString('es', {day:'2-digit',month:'short',year:'numeric'}) : '\u2014';
        var size  = formatBytes(doc.file_size || 0);
        var chunks = doc.chunk_count != null ? doc.chunk_count : 0;
        var nameEsc = escapeHtml(name);

        html += '<div class="doc-card card" style="position:relative;">';
        html += '<div class="card-body" style="display:flex;flex-direction:column;gap:0.875rem;">';
        html += '<div style="display:flex;align-items:center;gap:0.75rem;">';
        html += '<div style="width:2.75rem;height:2.75rem;border-radius:var(--radius-lg);background:' + color + '18;display:flex;align-items:center;justify-content:center;flex-shrink:0;">';
        html += '<svg width="24" height="24" viewBox="0 0 20 20" fill="' + color + '"><path fill-rule="evenodd" d="' + icon + '" clip-rule="evenodd"/></svg>';
        html += '</div>';
        html += '<div style="flex:1;min-width:0;">';
        html += '<div style="font-size:0.875rem;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + nameEsc + '">' + nameEsc + '</div>';
        html += '<div style="font-size:0.75rem;color:var(--text-muted);">' + ext.toUpperCase() + ' &middot; ' + size + '</div>';
        html += '</div></div>';
        html += '<div style="font-size:0.75rem;color:var(--text-muted);">' + chunks + ' chunks &middot; ' + date + '</div>';
        html += '<div style="display:flex;gap:0.5rem;">';
        html += '<button class="btn btn-secondary btn-sm doc-view-btn" style="flex:1;" data-id="' + doc.id + '" data-name="' + nameEsc + '">Ver contenido</button>';
        html += '<button class="btn btn-danger btn-sm doc-del-btn" data-id="' + doc.id + '" data-name="' + nameEsc + '" title="Eliminar">';
        html += '<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>';
        html += '</button></div>';
        html += '</div></div>';
      });
      html += '</div>';
      container.innerHTML = html;

      container.querySelectorAll('.doc-view-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          viewDocument(parseInt(this.dataset.id), this.dataset.name);
        });
      });
      container.querySelectorAll('.doc-del-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          deleteDocument(parseInt(this.dataset.id), this.dataset.name);
        });
      });
    })
    .catch(function(err) {
      container.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--color-error);">' + escapeHtml(err.message) + '</div>';
    });
}

function viewDocument(id, name) {
  var modal   = document.getElementById('document-modal');
  var mName   = document.getElementById('modal-document-name');
  var mBody   = document.getElementById('modal-document-content');
  mName.textContent = name;
  modal.style.display = 'flex';
  mBody.innerHTML = '<div style="text-align:center;padding:3rem;"><div class="spinner spinner-lg" style="margin:0 auto 1rem;"></div><p style="color:var(--text-muted);">Cargando contenido\u2026</p></div>';

  fetch(BASE_PATH + '/api/get-document-content.php?id=' + id)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.success) throw new Error(data.error || 'Error');
      var chunks = data.chunks || [];
      if (chunks.length === 0) {
        mBody.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem;">Sin contenido disponible</p>';
        return;
      }
      var html = '<div style="display:flex;flex-direction:column;gap:1rem;">';
      chunks.forEach(function(chunk, i) {
        html += '<div class="card"><div class="card-body">';
        html += '<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.5rem;">Fragmento ' + (i+1) + ' de ' + chunks.length + ' &middot; ' + chunk.chunk_text.length + ' caracteres</div>';
        html += '<p style="font-size:0.8125rem;color:var(--text-secondary);white-space:pre-wrap;line-height:1.6;">' + escapeHtml(chunk.chunk_text) + '</p>';
        html += '</div></div>';
      });
      html += '</div>';
      mBody.innerHTML = html;
    })
    .catch(function(err) {
      mBody.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--color-error);">' + escapeHtml(err.message) + '</div>';
    });
}

function closeDocumentModal() {
  var modal = document.getElementById('document-modal');
  if (modal) modal.style.display = 'none';
}

function deleteDocument(id, name) {
  if (!confirm('\u00bfEliminar el documento "' + name + '"?\n\nEsta acci\u00f3n no se puede deshacer.')) return;
  var container = document.getElementById('documents-container');
  var backup = container.innerHTML;
  container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);"><div class="spinner spinner-lg" style="margin:0 auto 1rem;"></div><p>Eliminando\u2026</p></div>';

  fetch(BASE_PATH + '/api/delete-document.php?id=' + id, { method: 'DELETE' })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.success) throw new Error(data.error || 'Error');
      showToast('Documento eliminado correctamente', 'success');
      loadDocuments();
      loadStats();
    })
    .catch(function(err) {
      container.innerHTML = backup;
      showToast('Error al eliminar: ' + err.message, 'error');
    });
}

function escapeHtml(text) {
  var d = document.createElement('div');
  d.textContent = String(text == null ? '' : text);
  return d.innerHTML;
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  var k = 1024, sizes = ['B','KB','MB','GB'];
  var i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1).replace(/\.0$/, '') + ' ' + sizes[i];
}

/* ── Init ── */
loadDocuments();
loadStats();

<?php
$scripts = ob_get_clean();

$extraScripts = '';

require __DIR__ . '/layout.php';
?>
