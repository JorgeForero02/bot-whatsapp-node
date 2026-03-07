<?php
/**
 * Card component
 *
 * Props (array):
 *   header      string  HTML for card header (optional)
 *   body        string  HTML for card body
 *   footer      string  HTML for card footer (optional)
 *   extra_class string  Additional classes on .card
 *   id          string  Optional id
 */

$header      = $props['header']      ?? '';
$body        = $props['body']        ?? '';
$footer      = $props['footer']      ?? '';
$extra_class = $props['extra_class'] ?? '';
$id          = $props['id']          ?? '';

$id_attr = $id ? ' id="' . htmlspecialchars($id, ENT_QUOTES) . '"' : '';
$class   = 'card' . ($extra_class ? ' ' . $extra_class : '');
?>
<div class="<?php echo $class; ?>"<?php echo $id_attr; ?>>
  <?php if ($header): ?>
    <div class="card-header"><?php echo $header; ?></div>
  <?php endif; ?>
  <div class="card-body"><?php echo $body; ?></div>
  <?php if ($footer): ?>
    <div class="card-footer"><?php echo $footer; ?></div>
  <?php endif; ?>
</div>
