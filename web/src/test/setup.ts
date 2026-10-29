// jsdom does not provide ResizeObserver, while the production UI and react-three
// fiber use it during mount. Keep the fallback minimal; tests that need exact
// observer behavior install their own stub.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverFallback {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverFallback as typeof ResizeObserver;
}
