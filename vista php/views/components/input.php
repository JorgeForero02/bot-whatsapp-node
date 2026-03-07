<?php
/**
 * Input component
 *
 * Props (array):
 *   id          string  Input id (also used for label's for= attr)
 *   name        string  Input name
 *   type        string  text|password|email|number|url|tel (default: text)
 *   label       string  Label text (optional)
 *   placeholder string
 *   value       string  Current value
 *   error       string  Error message (optional — also adds error class)
 *   hint        string  Help text below input (optional)
 *   disabled    bool    (default: false)
 *   required    bool    (default: false)
 *   extra_class string  Additional classes on the input element
 *   attrs       string  Extra HTML attributes as raw string
 */

$id          = $props['id']          ?? '';
$name        = $props['name']        ?? '';
$type        = $props['type']        ?? 'text';
$label       = $props['label']       ?? '';
$placeholder = $props['placeholder'] ?? '';
$value       = $props['value']       ?? '';
$error       = $props['error']       ?? '';
$hint        = $props['hint']        ?? '';
$disabled    = $props['disabled']    ?? false;
$required    = $props['required']    ?? false;
$extra_class = $props['extra_class'] ?? '';
$attrs       = $props['attrs']       ?? '';

$input_class = 'form-input';
if ($error)       $input_class .= ' error';
if ($extra_class) $input_class .= ' ' . $extra_class;

$id_attr       = $id       ? ' id="'          . htmlspecialchars($id,    ENT_QUOTES) . '"' : '';
$name_attr     = $name     ? ' name="'        . htmlspecialchars($name,  ENT_QUOTES) . '"' : '';
$ph_attr       = $placeholder ? ' placeholder="' . htmlspecialchars($placeholder, ENT_QUOTES) . '"' : '';
$val_attr      = $value !== '' ? ' value="'   . htmlspecialchars($value, ENT_QUOTES) . '"' : '';
$disabled_attr = $disabled ? ' disabled'       : '';
$required_attr = $required ? ' required'       : '';
?>
<div class="form-group">
  <?php if ($label): ?>
  <label class="form-label"<?php echo $id ? ' for="' . htmlspecialchars($id, ENT_QUOTES) . '"' : ''; ?>>
    <?php echo htmlspecialchars($label, ENT_QUOTES); ?>
    <?php if ($required): ?><span style="color:var(--color-error);margin-left:2px;">*</span><?php endif; ?>
  </label>
  <?php endif; ?>
  <input type="<?php echo htmlspecialchars($type, ENT_QUOTES); ?>"
         class="<?php echo $input_class; ?>"
         <?php echo $id_attr . $name_attr . $ph_attr . $val_attr . $disabled_attr . $required_attr . ' ' . $attrs; ?>>
  <?php if ($error): ?>
  <p class="form-error-msg">
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <path fill-rule="evenodd" d="M6 11A5 5 0 106 1a5 5 0 000 10zm-.75-7.25a.75.75 0 011.5 0v2.5a.75.75 0 01-1.5 0v-2.5zm.75 5a.75.75 0 100-1.5.75.75 0 000 1.5z" clip-rule="evenodd"/>
    </svg>
    <?php echo htmlspecialchars($error, ENT_QUOTES); ?>
  </p>
  <?php elseif ($hint): ?>
  <p class="form-hint"><?php echo htmlspecialchars($hint, ENT_QUOTES); ?></p>
  <?php endif; ?>
</div>
