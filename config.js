/*
  Option 1 configuration.
  Deploy worker/worker.js first, then replace API_BASE with the worker URL.
  Example: https://singer-inventory-api.<your-subdomain>.workers.dev
*/
window.APP_CONFIG = Object.assign({
  API_BASE: "https://REPLACE-WITH-YOUR-WORKER.workers.dev"
}, window.APP_CONFIG || {});
