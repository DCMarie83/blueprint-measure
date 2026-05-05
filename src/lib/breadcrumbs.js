const MAX_BREADCRUMBS = 50;
let buffer = [];

export function addBreadcrumb({ category, message, data = null }) {
  const entry = {
    timestamp: new Date().toISOString(),
    category,
    message,
    data: data ? JSON.parse(JSON.stringify(data)) : null,
  };
  buffer.push(entry);
  if (buffer.length > MAX_BREADCRUMBS) {
    buffer = buffer.slice(buffer.length - MAX_BREADCRUMBS);
  }
}

export function getBreadcrumbs() {
  return JSON.parse(JSON.stringify(buffer));
}

export function clearBreadcrumbs() {
  buffer = [];
}
