// Безопасная установка значений в DOM — только через textContent/атрибут.
// Никаких innerHTML с пользовательскими данными.

export function setText(el, value) {
  el.textContent = value == null ? '' : String(value);
}

export function setAttr(el, attr, value) {
  if (value == null || value === '') el.removeAttribute(attr);
  else el.setAttribute(attr, String(value));
}

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}
