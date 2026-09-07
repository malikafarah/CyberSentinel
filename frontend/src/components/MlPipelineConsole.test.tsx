import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MlPipelineConsole from './MlPipelineConsole';

// 1. Create a mock for the EventSource API
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  close: any;
  onmessage: ((event: { data: any }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    this.close = (typeof jest !== 'undefined' ? jest.fn() : (globalThis as any).vi?.fn() || (() => {}));
    MockEventSource.instances.push(this);
  }
}
MockEventSource.instances = [];

describe('MlPipelineConsole', () => {
  beforeEach(() => {
    // Inject the mock into the global window object
    (globalThis as any).EventSource = MockEventSource as any;
    MockEventSource.instances = [];
    // Mock scrollIntoView which isn't implemented in JSDOM
    window.HTMLElement.prototype.scrollIntoView = (typeof jest !== 'undefined' ? jest.fn() : (globalThis as any).vi?.fn() || (() => {}));
  });

  afterEach(() => {
    delete (globalThis as any).EventSource;
    if (typeof jest !== 'undefined') {
      jest.clearAllMocks();
    } else if ((globalThis as any).vi) {
      (globalThis as any).vi.clearAllMocks();
    }
  });

  it('streams logs and closes on completion', async () => {
    const user = userEvent.setup();
    render(<MlPipelineConsole />);

    const startButton = screen.getByRole('button', { name: /Execute Pipeline/i });

    // Start the pipeline
    await user.click(startButton);

    // Verify initial state
    expect(screen.getByText('System: Initializing ML Pipeline connection...')).toBeInTheDocument();
    expect(startButton).toBeDisabled();

    // Get the active EventSource instance
    const eventSource = MockEventSource.instances[0];
    expect(eventSource.url).toBe('/api/v1/engine/stream-pipeline');

    // Simulate incoming SSE messages
    act(() => {
      eventSource.onmessage?.({ data: '[INFO] Building NetworkX graph...' });
      eventSource.onmessage?.({ data: '[INFO] Calculating PageRank...' });
    });

    expect(screen.getByText('[INFO] Building NetworkX graph...')).toBeInTheDocument();
    expect(screen.getByText('[INFO] Calculating PageRank...')).toBeInTheDocument();

    // Simulate completion signal
    act(() => {
      eventSource.onmessage?.({ data: '[SUCCESS] Pipeline execution complete.' });
    });

    // Verify the connection was closed and button re-enabled
    expect(eventSource.close).toHaveBeenCalledTimes(1);
    expect(startButton).not.toBeDisabled();
  });
});
