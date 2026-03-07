<?php
/**
 * Stat Card component
 *
 * Props (array):
 *   value       string  Main metric value (e.g. "142")
 *   label       string  Label below the value
 *   icon        string  Raw SVG HTML for the icon
 *   icon_bg     string  Tailwind bg class for icon container (e.g. "bg-blue-100 dark:bg-blue-900/30")
 *   icon_color  string  Tailwind text class for icon (e.g. "text-blue-600")
 *   change      string  Optional change text (e.g. "+12%")
 *   change_dir  string  up|down|neutral (default: neutral)
 *   id          string  Optional id on root element
 *   extra_class string  Additional classes
 */

$value       = $props['value']       ?? '—';
$label       = $props['label']       ?? '';
$icon        = $props['icon']        ?? '';
$icon_bg     = $props['icon_bg']     ?? 'bg-gray-100 dark:bg-gray-800';
$icon_color  = $props['icon_color']  ?? 'text-gray-500';
$change      = $props['change']      ?? '';
$change_dir  = $props['change_dir']  ?? 'neutral';
$id          = $props['id']          ?? '';
$extra_class = $props['extra_class'] ?? '';

$id_attr = $id ? ' id="' . htmlspecialchars($id, ENT_QUOTES) . '"' : '';
$class   = 'stat-card' . ($extra_class ? ' ' . $extra_class : '');

$change_class = [
    'up'      => 'stat-card-change up',
    'down'    => 'stat-card-change down',
    'neutral' => 'stat-card-change',
][$change_dir] ?? 'stat-card-change';

$change_arrow = '';
if ($change_dir === 'up')   $change_arrow = '<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M5 2l4 6H1l4-6z"/></svg>';
if ($change_dir === 'down') $change_arrow = '<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M5 8L1 2h8L5 8z"/></svg>';
?>
<div class="<?php echo $class; ?>"<?php echo $id_attr; ?>>
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;margin-bottom:0.875rem;">
    <?php if ($icon): ?>
    <div class="stat-card-icon <?php echo htmlspecialchars($icon_bg, ENT_QUOTES); ?>">
      <span class="<?php echo htmlspecialchars($icon_color, ENT_QUOTES); ?>" style="display:flex;width:1.25rem;height:1.25rem;">
        <?php echo $icon; ?>
      </span>
    </div>
    <?php endif; ?>
    <?php if ($change): ?>
    <span class="<?php echo $change_class; ?>"><?php echo $change_arrow; ?><?php echo htmlspecialchars($change, ENT_QUOTES); ?></span>
    <?php endif; ?>
  </div>
  <div class="stat-card-value"><?php echo htmlspecialchars($value, ENT_QUOTES); ?></div>
  <div class="stat-card-label" style="margin-top:0.25rem;"><?php echo htmlspecialchars($label, ENT_QUOTES); ?></div>
</div>
