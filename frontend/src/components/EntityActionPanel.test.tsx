import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EntityActionPanel from './EntityActionPanel';

describe('EntityActionPanel (Confidence Tiering)', () => {
  it('renders High Confidence tier for riskScore > 90', async () => {
    const handleInitiateLien = typeof jest !== 'undefined' ? jest.fn() : (globalThis as any).vi?.fn() || (() => {});
    const user = userEvent.setup();

    render(
      <EntityActionPanel
        riskScore={95}
        entityStatus="ACTIVE"
        onInitiateLien={handleInitiateLien}
      />
    );

    expect(screen.getByText(/HIGH CONFIDENCE: 95%/i)).toBeInTheDocument();
    expect(screen.getByText(/Eligible for automated CFCFRMS Lien Marking\./i)).toBeInTheDocument();
    
    const lienButton = screen.getByRole('button', { name: /Initiate Lien Request/i });
    expect(lienButton).toBeInTheDocument();

    await user.click(lienButton);
    expect(handleInitiateLien).toHaveBeenCalledTimes(1);
  });

  it('renders Manual Review tier for riskScore between 70 and 90', async () => {
    const handleMarkDeepDive = typeof jest !== 'undefined' ? jest.fn() : (globalThis as any).vi?.fn() || (() => {});
    const user = userEvent.setup();

    render(
      <EntityActionPanel
        riskScore={82}
        entityStatus="ACTIVE"
        onMarkDeepDive={handleMarkDeepDive}
      />
    );

    expect(screen.getByText(/MANUAL REVIEW: 82%/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Suspicious activity detected\. Investigator review required before action\./i)
    ).toBeInTheDocument();

    const deepDiveButton = screen.getByRole('button', { name: /Mark for Deep Dive/i });
    expect(deepDiveButton).toBeInTheDocument();

    await user.click(deepDiveButton);
    expect(handleMarkDeepDive).toHaveBeenCalledTimes(1);
  });

  it('renders insufficient risk message for riskScore <= 70', () => {
    render(<EntityActionPanel riskScore={55} entityStatus="ACTIVE" />);

    expect(screen.getByText(/Insufficient risk score for action\./i)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
