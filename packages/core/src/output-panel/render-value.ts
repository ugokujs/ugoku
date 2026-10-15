import type { SerializedValue, ObjectEntry, MapEntry } from '../serializer/types';

export function renderValue(value: SerializedValue): HTMLElement {
  switch (value.kind) {
    case 'primitive':
      return renderPrimitive(value);
    case 'bigint':
    case 'symbol':
    case 'function':
    case 'date':
    case 'regexp':
      return renderPlainText(value.preview, 'ugoku-special');
    case 'error':
      return renderError(value);
    case 'promise':
      return renderPlainText('Promise {<pending>}', 'ugoku-special');
    case 'circular':
      return renderPlainText(value.label, 'ugoku-punctuation');
    case 'array':
      return renderArray(value);
    case 'object':
      return renderObject(value);
    case 'map':
      return renderMap(value);
    case 'set':
      return renderSet(value);
  }
}

function renderPlainText(text: string, className: string): HTMLElement {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

function renderPrimitive(value: Extract<SerializedValue, { kind: 'primitive' }>): HTMLElement {
  const span = document.createElement('span');
  if (value.value === null) {
    span.className = 'ugoku-null';
    span.textContent = 'null';
  } else if (value.value === undefined) {
    span.className = 'ugoku-null';
    span.textContent = 'undefined';
  } else if (typeof value.value === 'string') {
    span.className = 'ugoku-string';
    const suffix = value.truncatedChars ? `… (${value.truncatedChars} more characters)` : '';
    span.textContent = JSON.stringify(value.value) + suffix;
  } else if (typeof value.value === 'boolean') {
    span.className = 'ugoku-boolean';
    span.textContent = String(value.value);
  } else {
    span.className = 'ugoku-number';
    span.textContent = String(value.value);
  }
  return span;
}

function renderError(value: Extract<SerializedValue, { kind: 'error' }>): HTMLElement {
  const container = document.createElement('span');
  container.className = 'ugoku-error';

  const header = document.createElement('span');
  header.className = 'ugoku-error-header';
  header.textContent = `${value.name}: ${value.message}`;
  container.appendChild(header);

  if (value.stack) {
    const stack = document.createElement('pre');
    stack.className = 'ugoku-error-stack';
    stack.textContent = value.stack;
    container.appendChild(stack);
  }

  return container;
}

function createExpandable(preview: string, buildExpanded: () => HTMLElement): HTMLElement {
  const container = document.createElement('span');
  container.className = 'ugoku-composite';

  const toggle = document.createElement('span');
  toggle.className = 'ugoku-toggle';
  toggle.textContent = '▸';

  const previewEl = document.createElement('span');
  previewEl.className = 'ugoku-preview';
  previewEl.textContent = preview;

  container.append(toggle, previewEl);

  let expanded = false;
  let expandedEl: HTMLElement | null = null;

  container.addEventListener('click', (event) => {
    event.stopPropagation();
    expanded = !expanded;
    toggle.textContent = expanded ? '▾' : '▸';
    previewEl.hidden = expanded;
    if (expanded) {
      if (!expandedEl) {
        expandedEl = buildExpanded();
        container.appendChild(expandedEl);
      }
      expandedEl.hidden = false;
    } else if (expandedEl) {
      expandedEl.hidden = true;
    }
  });

  return container;
}

function renderArray(value: Extract<SerializedValue, { kind: 'array' }>): HTMLElement {
  if (value.items === null) return renderPlainText(value.preview, 'ugoku-preview');
  const items = value.items;
  const omittedCount = value.omittedCount;
  return createExpandable(value.preview, () => {
    const list = document.createElement('span');
    list.className = 'ugoku-expanded ugoku-array-expanded';
    list.append('[ ');
    items.forEach((item, index) => {
      if (index > 0) list.append(', ');
      list.appendChild(renderValue(item));
    });
    if (omittedCount > 0) list.append(`, … ${omittedCount} more`);
    list.append(' ]');
    return list;
  });
}

function renderSet(value: Extract<SerializedValue, { kind: 'set' }>): HTMLElement {
  if (value.items === null) return renderPlainText(value.preview, 'ugoku-preview');
  const items = value.items;
  const omittedCount = value.omittedCount;
  return createExpandable(value.preview, () => {
    const list = document.createElement('span');
    list.className = 'ugoku-expanded ugoku-set-expanded';
    list.append(`Set(${items.length + omittedCount}) { `);
    items.forEach((item, index) => {
      if (index > 0) list.append(', ');
      list.appendChild(renderValue(item));
    });
    if (omittedCount > 0) list.append(`, … ${omittedCount} more`);
    list.append(' }');
    return list;
  });
}

function renderObject(value: Extract<SerializedValue, { kind: 'object' }>): HTMLElement {
  if (value.entries === null) return renderPlainText(value.preview, 'ugoku-preview');
  const entries: ObjectEntry[] = value.entries;
  const omittedCount = value.omittedCount;
  const className = value.className;
  return createExpandable(value.preview, () => {
    const list = document.createElement('span');
    list.className = 'ugoku-expanded ugoku-object-expanded';
    if (className) {
      const classEl = document.createElement('span');
      classEl.className = 'ugoku-class-name';
      classEl.textContent = `${className} `;
      list.appendChild(classEl);
    }
    list.append('{ ');
    entries.forEach((entry, index) => {
      if (index > 0) list.append(', ');
      const keyEl = document.createElement('span');
      keyEl.className = 'ugoku-key';
      keyEl.textContent = `${entry.key}: `;
      list.appendChild(keyEl);
      list.appendChild(renderValue(entry.value));
    });
    if (omittedCount > 0) list.append(`, … ${omittedCount} more`);
    list.append(' }');
    return list;
  });
}

function renderMap(value: Extract<SerializedValue, { kind: 'map' }>): HTMLElement {
  if (value.entries === null) return renderPlainText(value.preview, 'ugoku-preview');
  const entries: MapEntry[] = value.entries;
  const omittedCount = value.omittedCount;
  return createExpandable(value.preview, () => {
    const list = document.createElement('span');
    list.className = 'ugoku-expanded ugoku-map-expanded';
    list.append(`Map(${entries.length + omittedCount}) { `);
    entries.forEach((entry, index) => {
      if (index > 0) list.append(', ');
      list.appendChild(renderValue(entry.key));
      list.append(' => ');
      list.appendChild(renderValue(entry.value));
    });
    if (omittedCount > 0) list.append(`, … ${omittedCount} more`);
    list.append(' }');
    return list;
  });
}
