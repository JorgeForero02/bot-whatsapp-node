<?php
/**
 * Button component
 *
 * Props (array):
 *   variant   string  primary|secondary|danger|ghost  (default: primary)
 *   size      string  sm|md|lg                        (default: md)
 *   type      string  button|submit|reset             (default: button)
 *   label     string  Button text
 *   icon_left  string  Raw SVG HTML for left icon
 *   icon_right string  Raw SVG HTML for right icon
 *   extra_class string  Additional Tailwind/CSS classes
 *   disabled  bool    (default: false)
 *   id        string  Optional id attribute
 *   onclick   string  Optional onclick handler string
 *   href      string  If set, renders an <a> tag instead of <button>
 *   attrs     string  Any extra HTML attributes as string
 */

$variant     = $props['variant']     ?? 'primary';
$size        = $props['size']        ?? 'md';
$type        = $props['type']        ?? 'button';
$label       = $props['label']       ?? '';
$icon_left   = $props['icon_left']   ?? '';
$icon_right  = $props['icon_right']  ?? '';
$extra_class = $props['extra_class'] ?? '';
$disabled    = $props['disabled']    ?? false;
$id          = $props['id']          ?? '';
$onclick     = $props['onclick']     ?? '';
$href        = $props['href']        ?? '';
$attrs       = $props['attrs']       ?? '';

$classes = 'btn btn-' . $variant . ' btn-' . $size;
if ($extra_class) $classes .= ' ' . $extra_class;

$id_attr      = $id      ? ' id="' . htmlspecialchars($id, ENT_QUOTES) . '"'         : '';
$onclick_attr = $onclick ? ' onclick="' . htmlspecialchars($onclick, ENT_QUOTES) . '"' : '';
$disabled_attr = $disabled ? ' disabled' : '';

$inner  = $icon_left  ? '<span class="btn-icon-left">'  . $icon_left  . '</span>' : '';
$inner .= $label      ? '<span>' . htmlspecialchars($label, ENT_QUOTES) . '</span>' : '';
$inner .= $icon_right ? '<span class="btn-icon-right">' . $icon_right . '</span>' : '';

if ($href) {
    echo '<a href="' . htmlspecialchars($href, ENT_QUOTES) . '" class="' . $classes . '"' . $id_attr . $onclick_attr . ' ' . $attrs . '>' . $inner . '</a>';
} else {
    echo '<button type="' . $type . '" class="' . $classes . '"' . $id_attr . $onclick_attr . $disabled_attr . ' ' . $attrs . '>' . $inner . '</button>';
}
?>
