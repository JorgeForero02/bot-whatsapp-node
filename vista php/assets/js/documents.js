function viewDocument(id, name) {
  var bp = typeof BASE_PATH !== 'undefined' ? BASE_PATH : '';
  var body = '<div style="display:flex;align-items:center;justify-content:center;padding:2rem;"><div class="spinner"></div></div>';
  var backdrop = showModal({ title: _esc(name), size: 'lg', body: body });
  fetch(bp + '/api/get-document-content.php?id=' + id, { cache: 'no-store' })
    .then(function(r){ return r.json(); })
    .then(function(data){
      if (!data.success) throw new Error(data.error || 'Error');
      var content = data.content || 'Sin contenido disponible';
      var modalBody = backdrop.querySelector('.modal-body');
      if (modalBody) {
        modalBody.innerHTML = '<pre style="white-space:pre-wrap;word-break:break-word;font-size:0.8125rem;color:var(--text-secondary);line-height:1.6;max-height:60vh;overflow-y:auto;">' + _esc(content) + '</pre>';
      }
    })
    .catch(function(err){
      var modalBody = backdrop.querySelector('.modal-body');
      if (modalBody) modalBody.innerHTML = '<span class="badge badge-error">' + _esc(err.message) + '</span>';
    });
}

function confirmDeleteDocument(id, name) {
  showConfirmModal('¿Eliminar el documento <strong>' + name + '</strong>? Esta acción no se puede deshacer.', {
    title: 'Eliminar documento',
    confirmText: 'Eliminar',
    cancelText: 'Cancelar',
    isDanger: true,
    onConfirm: function(){ _deleteDocument(id); }
  });
}

function uploadDocument() {
  var bp = typeof BASE_PATH !== 'undefined' ? BASE_PATH : '';
  var selectedFile = window._docSelectedFile;
  if (!selectedFile) return;

  var uploadBtn    = document.getElementById('upload-btn');
  var progressWrap = document.getElementById('upload-progress');
  var progressBar  = document.getElementById('upload-progress-bar');
  var progressPct  = document.getElementById('upload-progress-pct');

  if (uploadBtn) uploadBtn.disabled = true;
  if (progressWrap) progressWrap.style.display = '';

  var formData = new FormData();
  formData.append('document', selectedFile);

  var xhr = new XMLHttpRequest();
  xhr.open('POST', bp + '/api/upload.php');

  xhr.upload.addEventListener('progress', function(e) {
    if (e.lengthComputable) {
      var pct = Math.round((e.loaded / e.total) * 100);
      if (progressBar) progressBar.style.width = pct + '%';
      if (progressPct) progressPct.textContent = pct + '%';
    }
  });

  xhr.addEventListener('load', function() {
    try {
      var data = JSON.parse(xhr.responseText);
      if (data.success) {
        showToast('Documento subido correctamente. Iniciando indexación…', 'success');
        _resetUploadUI();
        _loadDocuments();
        _loadStats();
      } else {
        throw new Error(data.error || 'Error al subir');
      }
    } catch(e) {
      showToast('Error: ' + e.message, 'error');
      if (uploadBtn) uploadBtn.disabled = false;
      if (progressWrap) progressWrap.style.display = 'none';
    }
  });

  xhr.addEventListener('error', function() {
    showToast('Error de red al subir el archivo', 'error');
    if (uploadBtn) uploadBtn.disabled = false;
    if (progressWrap) progressWrap.style.display = 'none';
  });

  xhr.send(formData);
}

function _esc(text) {
  var d = document.createElement('div');
  d.textContent = String(text == null ? '' : text);
  return d.innerHTML;
}

function _deleteDocument(id) {
  var bp = typeof BASE_PATH !== 'undefined' ? BASE_PATH : '';
  fetch(bp + '/api/delete-document.php?id=' + id, { method: 'DELETE' })
    .then(function(r){ return r.json(); })
    .then(function(data){
      if (!data.success) throw new Error(data.error || 'Error');
      showToast('Documento eliminado correctamente', 'success');
      _loadDocuments();
      _loadStats();
    })
    .catch(function(err){
      showToast('Error al eliminar: ' + err.message, 'error');
    });
}

function _loadStats() {
  var bp = typeof BASE_PATH !== 'undefined' ? BASE_PATH : '';
  fetch(bp + '/api/get-stats.php', { cache: 'no-store' })
    .then(function(r){ return r.json(); })
    .then(function(data){
      if (!data.success || !data.stats) return;
      var s = data.stats;
      var el;
      el = document.getElementById('stat-total-docs');    if (el) el.textContent = s.documents && s.documents.total != null ? s.documents.total : '—';
      el = document.getElementById('stat-total-vectors'); if (el) el.textContent = s.vectors != null ? s.vectors : '—';
      el = document.getElementById('stat-total-size');    if (el) el.textContent = s.documents && s.documents.total_size != null ? formatBytes(s.documents.total_size) : '—';
    })
    .catch(function(){});
}

function _loadDocuments() {
  var bp = typeof BASE_PATH !== 'undefined' ? BASE_PATH : '';
  var grid = document.getElementById('documents-grid');
  if (!grid) return;

  grid.innerHTML = '<div style="grid-column:1/-1;display:flex;align-items:center;justify-content:center;padding:3rem;"><div class="spinner spinner-lg"></div></div>';

  fetch(bp + '/api/get-documents.php', { cache: 'no-store' })
    .then(function(r){ return r.json(); })
    .then(function(data){
      if (!data.success) throw new Error(data.error || 'Error');
      var docs = data.documents || [];

      if (docs.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:4rem 2rem;color:var(--text-muted);"><p style="font-size:1rem;font-weight:500;">No hay documentos a&uacute;n</p><p style="font-size:0.875rem;margin-top:0.25rem;">Sube tu primer documento para comenzar</p></div>';
        return;
      }

      var FILE_COLORS = { pdf:'#ef4444', doc:'#2563eb', docx:'#2563eb', txt:'#64748b' };
      var FILE_ICONS = {
        pdf:  'M9 2a2 2 0 00-2 2v1H5a2 2 0 00-2 2v11a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2V4a2 2 0 00-2-2H9zm0 2h2v1H9V4zM5 7h10v11H5V7z',
        doc:  'M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z',
        txt:  'M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z'
      };
      var DEFAULT_ICON = 'M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z';

      grid.innerHTML = docs.map(function(doc){
        var ext   = (doc.original_name || doc.filename || '').split('.').pop().toLowerCase();
        var name  = doc.original_name || doc.filename || 'Sin nombre';
        var color = FILE_COLORS[ext] || '#7c3aed';
        var icon  = FILE_ICONS[ext] || DEFAULT_ICON;
        var date  = doc.created_at ? new Date(doc.created_at).toLocaleDateString('es', {day:'2-digit',month:'short',year:'numeric'}) : '—';
        var size  = typeof formatBytes === 'function' ? formatBytes(doc.file_size || 0) : '—';
        var chunks = doc.chunk_count != null ? doc.chunk_count : 0;
        var nameJson = JSON.stringify(name);

        return '<div class="doc-card card" data-doc-id="' + doc.id + '" style="position:relative;">'
          + '<div class="card-body" style="display:flex;flex-direction:column;gap:0.875rem;">'
          + '<div style="display:flex;align-items:center;gap:0.75rem;">'
          + '<div style="width:2.75rem;height:2.75rem;border-radius:var(--radius-lg);background:' + color + '18;display:flex;align-items:center;justify-content:center;flex-shrink:0;">'
          + '<svg width="24" height="24" viewBox="0 0 20 20" fill="' + color + '"><path fill-rule="evenodd" d="' + icon + '" clip-rule="evenodd"/></svg>'
          + '</div>'
          + '<div style="flex:1;min-width:0;">'
          + '<div style="font-size:0.875rem;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + _esc(name) + '">' + _esc(name) + '</div>'
          + '<div style="font-size:0.75rem;color:var(--text-muted);">' + ext.toUpperCase() + ' &middot; ' + size + '</div>'
          + '</div></div>'
          + '<div style="font-size:0.75rem;color:var(--text-muted);">' + chunks + ' chunks &middot; ' + date + '</div>'
          + '<div style="display:flex;gap:0.5rem;">'
          + '<button class="btn btn-secondary btn-sm" style="flex:1;" onclick="viewDocument(' + doc.id + ', ' + nameJson + ')">Ver contenido</button>'
          + '<button class="btn btn-danger btn-sm" onclick="confirmDeleteDocument(' + doc.id + ', ' + nameJson + ')" aria-label="Eliminar">'
          + '<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>'
          + '</button></div>'
          + '</div></div>';
      }).join('');
    })
    .catch(function(err){
      grid.innerHTML = '<div style="grid-column:1/-1;padding:2rem;text-align:center;"><span class="badge badge-error">' + _esc(err.message) + '</span></div>';
    });
}

function _handleFileSelect(file) {
  window._docSelectedFile = file;
  var preview     = document.getElementById('file-preview');
  var previewName = document.getElementById('preview-filename');
  var previewSize = document.getElementById('preview-filesize');
  var uploadBtn   = document.getElementById('upload-btn');
  var hint        = document.getElementById('drop-hint');

  if (preview)     preview.style.display = 'flex';
  if (previewName) previewName.textContent = file.name;
  if (previewSize) previewSize.textContent = typeof formatBytes === 'function' ? formatBytes(file.size) : '';
  if (uploadBtn)   uploadBtn.disabled = false;
  if (hint)        hint.textContent = 'Archivo seleccionado — haz clic en "Subir documento" para continuar';
}

function _resetUploadUI() {
  window._docSelectedFile = null;
  var fileInput    = document.getElementById('file-input');
  var preview      = document.getElementById('file-preview');
  var progressWrap = document.getElementById('upload-progress');
  var progressBar  = document.getElementById('upload-progress-bar');
  var progressPct  = document.getElementById('upload-progress-pct');
  var uploadBtn    = document.getElementById('upload-btn');
  var hint         = document.getElementById('drop-hint');

  if (fileInput)    fileInput.value = '';
  if (preview)      preview.style.display = 'none';
  if (progressWrap) progressWrap.style.display = 'none';
  if (progressBar)  progressBar.style.width = '0%';
  if (progressPct)  progressPct.textContent = '0%';
  if (uploadBtn)    uploadBtn.disabled = true;
  if (hint)         hint.textContent = 'Arrastra un archivo aquí o haz clic para seleccionar';
}

document.addEventListener('DOMContentLoaded', function() {
  var dropZone  = document.getElementById('drop-zone');
  var fileInput = document.getElementById('file-input');

  if (dropZone) {
    dropZone.addEventListener('dragover', function(e){ e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', function(){ dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', function(e){
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) _handleFileSelect(e.dataTransfer.files[0]);
    });
    dropZone.addEventListener('click', function(){ if (fileInput) fileInput.click(); });
  }

  if (fileInput) {
    fileInput.addEventListener('change', function(e){
      if (e.target.files[0]) _handleFileSelect(e.target.files[0]);
    });
  }

  _loadDocuments();
  _loadStats();
});
