import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SecureActionModal from './SecureActionModal';

// Mock the global fetch API
if (typeof jest !== 'undefined') {
  (globalThis as any).fetch = jest.fn();
} else if ((globalThis as any).vi) {
  (globalThis as any).fetch = (globalThis as any).vi.fn();
}

describe('SecureActionModal', () => {
  const mockAccountId = 'ACC-9921';
  const mockOnClose = typeof jest !== 'undefined' ? jest.fn() : (globalThis as any).vi?.fn() || (() => {});

  beforeEach(() => {
    if (typeof jest !== 'undefined') {
      jest.clearAllMocks();
    } else if ((globalThis as any).vi) {
      (globalThis as any).vi.clearAllMocks();
    }
  });

  it('handles authorization failure gracefully', async () => {
    const user = userEvent.setup();
    // Simulate a 403 Forbidden response
    ((globalThis as any).fetch as any).mockResolvedValueOnce({
      ok: false,
    });

    render(<SecureActionModal accountId={mockAccountId} onClose={mockOnClose} />);

    await user.type(screen.getByPlaceholderText(/e\.g\., Account identified/i), 'Suspicious activity');
    await user.type(screen.getByPlaceholderText('****'), '1234');
    
    await user.click(screen.getByRole('button', { name: /Sign & Execute Freeze/i }));

    // Verify error is displayed and we stay on the form
    expect(await screen.findByText(/Authorization failed/i)).toBeInTheDocument();
    expect(screen.queryByText(/Action Logged & Verified/i)).not.toBeInTheDocument();
  });

  it('transitions to the receipt view on successful authorization', async () => {
    const user = userEvent.setup();
    
    // Mock the crypto receipt response
    const mockReceipt = {
      receipt: {
        transaction_id: 'TXN-ABC-123',
        block_hash: '0xabc123...',
        canonical_json: '{"target":"ACC-9921"}',
        timestamp: '2026-09-08T00:00:00Z'
      }
    };

    ((globalThis as any).fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockReceipt,
    });

    render(<SecureActionModal accountId={mockAccountId} onClose={mockOnClose} />);

    // Fill out the form
    await user.type(screen.getByPlaceholderText(/e\.g\., Account identified/i), 'Evidence chain terminal node');
    await user.type(screen.getByPlaceholderText('****'), '9999');
    
    // Submit
    await user.click(screen.getByRole('button', { name: /Sign & Execute Freeze/i }));

    // Verify the payload sent to the backend
    expect((globalThis as any).fetch).toHaveBeenCalledWith('/api/v1/action/freeze', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        target_account: mockAccountId,
        officer_pin: '9999',
        justification: 'Evidence chain terminal node'
      })
    }));

    // Verify UI transitions to the receipt screen
    expect(await screen.findByText(/Action Logged & Verified/i)).toBeInTheDocument();
    expect(screen.getByText('TXN-ABC-123')).toBeInTheDocument();
    expect(screen.getByText('0xabc123...')).toBeInTheDocument();
    
    // Verify original form is gone
    expect(screen.queryByPlaceholderText('****')).not.toBeInTheDocument();
  });
});
