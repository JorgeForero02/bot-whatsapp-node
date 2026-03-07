<?php
/**
 * Responsive Table component
 * On mobile (< 768px) collapses to stacked cards via CSS.
 *
 * Props (array):
 *   headers   array   ['Label 1', 'Label 2', ...]
 *   rows      array   Array of row arrays: [['cell1','cell2',...], ...]
 *             Each cell can also be an associative array:
 *             ['html' => '<b>raw html</b>', 'label' => 'Override mobile label']
 *   id        string  Optional table id
 *   extra_class string
 */

$headers     = $props['headers']     ?? [];
$rows        = $props['rows']        ?? [];
$id          = $props['id']          ?? '';
$extra_class = $props['extra_class'] ?? '';

$id_attr = $id ? ' id="' . htmlspecialchars($id, ENT_QUOTES) . '"' : '';
$class   = 'responsive-table' . ($extra_class ? ' ' . $extra_class : '');
?>
<div style="overflow-x:auto;">
  <table class="<?php echo $class; ?>"<?php echo $id_attr; ?>>
    <?php if ($headers): ?>
    <thead>
      <tr>
        <?php foreach ($headers as $h): ?>
        <th><?php echo htmlspecialchars($h, ENT_QUOTES); ?></th>
        <?php endforeach; ?>
      </tr>
    </thead>
    <?php endif; ?>
    <tbody>
      <?php if (empty($rows)): ?>
      <tr>
        <td colspan="<?php echo max(1, count($headers)); ?>"
            style="text-align:center;padding:2rem;color:var(--text-muted);">
          No hay datos disponibles
        </td>
      </tr>
      <?php else: ?>
        <?php foreach ($rows as $row): ?>
        <tr>
          <?php foreach ($row as $idx => $cell): ?>
            <?php
              $label   = $headers[$idx] ?? '';
              $content = '';
              if (is_array($cell)) {
                  $content = $cell['html'] ?? htmlspecialchars($cell['text'] ?? '', ENT_QUOTES);
                  if (isset($cell['label'])) $label = $cell['label'];
              } else {
                  $content = htmlspecialchars($cell, ENT_QUOTES);
              }
            ?>
          <td data-label="<?php echo htmlspecialchars($label, ENT_QUOTES); ?>"><?php echo $content; ?></td>
          <?php endforeach; ?>
        </tr>
        <?php endforeach; ?>
      <?php endif; ?>
    </tbody>
  </table>
</div>
