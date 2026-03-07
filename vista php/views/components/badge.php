<?php

$variant     = $props['variant']     ?? 'neutral';
$label       = $props['label']       ?? '';
$dot         = $props['dot']         ?? false;
$extra_class = $props['extra_class'] ?? '';

$class = 'badge badge-' . $variant;
if ($extra_class) $class .= ' ' . $extra_class;

$dot_colors = [
  'success' => '#16a34a',
  'warning' => '#d97706',
  'error'   => '#dc2626',
  'info'    => '#2563eb',
  'neutral' => '#64748b',
];

$dot_html = '';
if ($dot) {
    $color = $dot_colors[$variant] ?? '#64748b';
    $dot_html = '<span class="badge-dot" style="background-color:' . $color . '"></span>';
}

echo '<span class="' . $class . '">' . $dot_html . htmlspecialchars($label, ENT_QUOTES) . '</span>';
?>
