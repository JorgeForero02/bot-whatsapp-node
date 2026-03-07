<?php
/**
 * Modal component — renders a modal trigger + markup.
 * The JS in app.js handles open/close/animation.
 *
 * Props (array):
 *   id        string  Required — unique modal id
 *   title     string  Modal title
 *   body      string  HTML body content
 *   footer    string  HTML footer content (optional)
 *   size      string  sm|md|lg|xl (default: md)
 *   extra_class string  Extra classes on .modal-box
 *
 * Usage: just include the PHP to render the hidden markup.
 * Open via JS: showModal({ title, body, size }) OR
 * reference a pre-rendered modal by id and toggle its backdrop manually.
 */

$id          = $props['id']          ?? 'modal-' . uniqid();
$title       = $props['title']       ?? '';
$body        = $props['body']        ?? '';
$footer      = $props['footer']      ?? '';
$size        = $props['size']        ?? 'md';
$extra_class = $props['extra_class'] ?? '';

$size_class = [
    'sm' => 'modal-sm',
    'md' => 'modal-md',
    'lg' => 'modal-lg',
    'xl' => 'modal-xl',
][$size] ?? 'modal-md';
?>
<div id="<?php echo htmlspecialchars($id, ENT_QUOTES); ?>"
     class="modal-backdrop"
     role="dialog"
     aria-modal="true"
     aria-hidden="true"
     style="display:none;">
  <div class="modal-box <?php echo $size_class; ?> <?php echo htmlspecialchars($extra_class, ENT_QUOTES); ?>">
    <div class="modal-header">
      <h2 class="modal-title"><?php echo htmlspecialchars($title, ENT_QUOTES); ?></h2>
      <button class="modal-close"
              aria-label="Cerrar"
              onclick="(function(){ const el=document.getElementById('<?php echo htmlspecialchars($id, ENT_QUOTES); ?>'); if(el){ el.classList.remove('visible'); setTimeout(()=>{el.style.display='none'; el.setAttribute('aria-hidden','true');},250); } })()">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
    <div class="modal-body"><?php echo $body; ?></div>
    <?php if ($footer): ?>
    <div class="modal-footer"><?php echo $footer; ?></div>
    <?php endif; ?>
  </div>
</div>
<script>
(function() {
  const modalId = <?php echo json_encode($id); ?>;
  window['openModal_' + modalId] = function() {
    const el = document.getElementById(modalId);
    if (!el) return;
    el.style.display = 'flex';
    el.removeAttribute('aria-hidden');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('visible')));
    el.addEventListener('click', function backdropClick(e) {
      if (e.target === el) {
        el.classList.remove('visible');
        setTimeout(() => { el.style.display = 'none'; el.setAttribute('aria-hidden', 'true'); }, 250);
        el.removeEventListener('click', backdropClick);
      }
    });
  };
})();
</script>
