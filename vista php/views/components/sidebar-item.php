<?php
/**
 * Sidebar nav item component
 *
 * Props (array):
 *   href        string  URL
 *   label       string  Nav item text
 *   icon        string  Raw SVG HTML
 *   active      bool    Is current page (default: false)
 *   badge       string  Badge text (optional)
 *   badge_variant string  success|warning|error|neutral|info (default: neutral)
 *   id          string  Optional id
 *   extra_class string
 */

$href          = $props['href']          ?? '#';
$label         = $props['label']         ?? '';
$icon          = $props['icon']          ?? '';
$active        = $props['active']        ?? false;
$badge         = $props['badge']         ?? '';
$badge_variant = $props['badge_variant'] ?? 'neutral';
$id            = $props['id']            ?? '';
$extra_class   = $props['extra_class']   ?? '';

$id_attr = $id ? ' id="' . htmlspecialchars($id, ENT_QUOTES) . '"' : '';
$class   = 'sidebar-nav-item' . ($active ? ' active' : '') . ($extra_class ? ' ' . $extra_class : '');

$badge_html = '';
if ($badge) {
    $badge_html = '<span class="nav-badge badge badge-' . htmlspecialchars($badge_variant, ENT_QUOTES) . '">'
                . htmlspecialchars($badge, ENT_QUOTES)
                . '</span>';
}
?>
<a href="<?php echo htmlspecialchars($href, ENT_QUOTES); ?>"
   class="<?php echo $class; ?>"
   <?php echo $id_attr; ?>>
  <?php if ($icon): ?>
  <span class="nav-icon"><?php echo $icon; ?></span>
  <?php endif; ?>
  <span style="flex:1;"><?php echo htmlspecialchars($label, ENT_QUOTES); ?></span>
  <?php echo $badge_html; ?>
</a>
