/**
 * 화면 만들기 도구.
 *
 * innerHTML 로 문자열을 붙이지 않는다. 현장명·업체명·근로자 성명이 그대로
 * 들어오는 자리가 많아서, 문자열로 조립하면 이름에 들어간 기호 하나로 화면이
 * 깨지거나 엉뚱한 것이 실행될 수 있다. 값은 항상 textContent 로만 넣는다.
 */

type Attrs = Record<string, string | number | boolean | undefined>;
type Child = Node | string | number | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key === 'class') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node: HTMLElement): HTMLElement {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function on<K extends keyof HTMLElementEventMap>(
  node: HTMLElement,
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
): void {
  node.addEventListener(type, handler as EventListener);
}

/** 라벨 + 입력칸 한 줄 */
export function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  return el(
    'label',
    { class: 'field' },
    el('span', { class: 'field-label', text: label }),
    control,
    hint ? el('span', { class: 'field-hint', text: hint }) : null,
  );
}

export function input(attrs: Attrs = {}): HTMLInputElement {
  return el('input', { type: 'text', ...attrs });
}

export function select(options: { value: string; label: string }[], value?: string): HTMLSelectElement {
  const node = el('select');
  for (const option of options) {
    const item = el('option', { value: option.value, text: option.label });
    if (option.value === value) item.selected = true;
    node.append(item);
  }
  return node;
}

export function button(label: string, attrs: Attrs = {}): HTMLButtonElement {
  return el('button', { type: 'button', text: label, ...attrs });
}

/** 법적 근거 표시. 원문과 대조하지 않은 근거는 반드시 그렇게 밝힌다 */
export function legalBasis(items: string[], verified: boolean): HTMLElement {
  const box = el('span', { class: verified ? 'basis' : 'basis basis-unverified' });
  box.append(el('span', { text: items.length > 0 ? items.join(' · ') : '근거 확인 불가' }));
  if (items.length > 0 && !verified) box.append(el('em', { text: ' (조문 미대조)' }));
  return box;
}

export function todayIso(): string {
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
