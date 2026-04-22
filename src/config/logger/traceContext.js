const { AsyncLocalStorage } = require('async_hooks');

const traceStore = new AsyncLocalStorage();

function runWithContext(context, fn) {
    return traceStore.run(context, fn);
}

function getContext() {
    return traceStore.getStore() || {};
}

function setContextField(key, value) {
    const store = traceStore.getStore();
    if (store) store[key] = value;
}

module.exports = { runWithContext, getContext, setContextField };
