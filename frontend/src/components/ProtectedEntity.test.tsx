import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProtectedEntity from './ProtectedEntity';

// Mock the global fetch API
if (typeof jest !== 'undefined') {
  (globalThis as any).fetch = jest.fn();
} else if ((globalThis as any).vi) {
  (globalThis as any).fetch = (globalThis as any).vi.fn();
}

describe('ProtectedEntity (DPDP Act PII Unmasking)', () => {
  const mockEntityId = 'ENT-84920';
  const rawValue = '31948571029';

  beforeEach(() => {
    if (typeof jest !== 'undefined') {
      jest.clearAllMocks();
    } else if ((globalThis as any).vi) {
      (globalThis as any).vi.clearAllMocks();
    }
  });

  it('renders masked value initially', () => {
    render(<ProtectedEntity type="account" value={rawValue} entityId={mockEntityId} />);

    // Raw value should not be visible
    expect(screen.queryByText(rawValue)).not.toBeInTheDocument();
    // Masked value should be visible
    expect(screen.getByText('3194****1029')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View/i })).toBeInTheDocument();
  });

  it('unmasks PII after entering justification and logs audit access', async () => {
    const user = userEvent.setup();
    const promptSpy = jest.spyOn(window, 'prompt').mockReturnValue('Authorized for FIR investigation CYB-902');

    ((globalThis as any).fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'success' })
    });

    render(<ProtectedEntity type="account" value={rawValue} entityId={mockEntityId} />);

    // Click View button
    await user.click(screen.getByRole('button', { name: /View/i }));

    // Verify prompt was invoked with DPDP compliance text
    expect(promptSpy).toHaveBeenCalledWith(expect.stringContaining('DPDP Act Compliance'));

    // Verify audit log request payload
    expect((globalThis as any).fetch).toHaveBeenCalledWith('/api/v1/audit/log-access', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        entityId: mockEntityId,
        reason: 'Authorized for FIR investigation CYB-902',
        action: 'UNMASK_PII',
        pii_type: 'account'
      })
    }));

    // Verify raw unmasked value is displayed
    await waitFor(() => {
      expect(screen.getByText(rawValue)).toBeInTheDocument();
    });

    expect(screen.getByText(/Unmasked/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /View/i })).not.toBeInTheDocument();

    promptSpy.mockRestore();
  });

  it('does not unmask or send audit log when prompt is cancelled', async () => {
    const user = userEvent.setup();
    const promptSpy = jest.spyOn(window, 'prompt').mockReturnValue(null);

    render(<ProtectedEntity type="account" value={rawValue} entityId={mockEntityId} />);

    await user.click(screen.getByRole('button', { name: /View/i }));

    expect((globalThis as any).fetch).not.toHaveBeenCalled();
    expect(screen.queryByText(rawValue)).not.toBeInTheDocument();
    expect(screen.getByText('3194****1029')).toBeInTheDocument();

    promptSpy.mockRestore();
  });
});
