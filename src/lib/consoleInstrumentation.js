import { addBreadcrumb } from './breadcrumbs';

const originalError = console.error;
const originalWarn = console.warn;

console.error = (...args) => {
  addBreadcrumb({
    category: 'console',
    message: 'console.error',
    data: { args: args.map(a => String(a)).slice(0, 5) },
  });
  originalError(...args);
};

console.warn = (...args) => {
  addBreadcrumb({
    category: 'console',
    message: 'console.warn',
    data: { args: args.map(a => String(a)).slice(0, 5) },
  });
  originalWarn(...args);
};
