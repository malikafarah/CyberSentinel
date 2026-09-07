// setupTests.ts
// Global DOM API Mocks for JSDOM / Test Environments (React Flow, Leaflet, Canvas)

// 1. Mock ResizeObserver for React Flow and Responsive Charts
if (typeof globalThis.ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// 2. Mock DOMMatrix for React Flow pan/zoom calculations
if (typeof (globalThis as any).DOMMatrix === 'undefined') {
  (globalThis as any).DOMMatrix = class DOMMatrix {
    m22 = 1; // mock zoom level
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    transformPoint(point: any) {
      return point;
    }
  } as any;
}

// 3. Mock window.HTMLElement scrollIntoView
if (typeof window !== 'undefined' && window.HTMLElement) {
  window.HTMLElement.prototype.scrollIntoView = function () {};
}
