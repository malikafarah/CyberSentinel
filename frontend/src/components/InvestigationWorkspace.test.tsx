import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';
import InvestigationWorkspace from './InvestigationWorkspace';
import '../setupTests';

describe('InvestigationWorkspace Evidence Chain', () => {
  const initialNodes: any[] = [
    {
      id: 'victim_1',
      data: { label: 'Victim (John Doe)', id: 'victim_1', type: 'VICTIM', riskScore: 95, status: 'ACTIVE' },
      position: { x: 0, y: 0 },
      type: 'entity'
    },
    {
      id: 'mule_4',
      data: { label: 'Mule Account', id: 'mule_4', type: 'MULE', riskScore: 88, status: 'ACTIVE' },
      position: { x: 100, y: 100 },
      type: 'entity'
    },
    {
      id: 'atm_9',
      data: {
        label: 'Terminal ATM',
        id: 'atm_9',
        type: 'ATM',
        riskScore: 92,
        status: 'ACTIVE',
        // This is the data the backend provides to trigger the chain logic
        metadata: { evidence_chain: ['victim_1', 'mule_4', 'atm_9'] }
      },
      position: { x: 200, y: 200 },
      type: 'entity'
    },
    {
      id: 'unrelated_node',
      data: { label: 'Unrelated Account', id: 'unrelated_node', type: 'DEVICE', riskScore: 20, status: 'ACTIVE' },
      position: { x: 300, y: 300 },
      type: 'entity'
    }
  ];

  const initialEdges: any[] = [
    { id: 'e1', source: 'victim_1', target: 'mule_4' },
    { id: 'e2', source: 'mule_4', target: 'atm_9' },
    { id: 'e3', source: 'atm_9', target: 'unrelated_node' }
  ];

  it('highlights the correct nodes and dims others when a terminal node is clicked', async () => {
    const user = userEvent.setup();

    // React Flow requires a fixed size container to render in tests
    render(
      <MemoryRouter>
        <div style={{ width: '800px', height: '800px' }}>
          <ReactFlowProvider>
            <InvestigationWorkspace
              initialNodes={initialNodes}
              initialEdges={initialEdges}
            />
          </ReactFlowProvider>
        </div>
      </MemoryRouter>
    );

    // 1. Find the Terminal ATM node by its text and click it
    const terminalNodeText = await screen.findByText('Terminal ATM');
    await act(async () => {
      await user.click(terminalNodeText);
    });

    // 2. Verify nodes inside the evidence chain received the glowing border
    // We look up from the text element to find the React Flow node container
    const victimContainer = screen.getByText('Victim (John Doe)').closest('.react-flow__node');
    const muleContainer = screen.getByText('Mule Account').closest('.react-flow__node');
    const atmContainer = terminalNodeText.closest('.react-flow__node');

    expect(victimContainer).toHaveStyle({ border: '2px solid #ef4444' });
    expect(muleContainer).toHaveStyle({ border: '2px solid #ef4444' });
    expect(atmContainer).toHaveStyle({ border: '2px solid #ef4444' });

    // 3. Verify nodes OUTSIDE the chain were dimmed
    const unrelatedContainer = screen.getByText('Unrelated Account').closest('.react-flow__node');
    expect(unrelatedContainer).toHaveStyle({ opacity: '0.3' });
  });

  it('resets the highlighting if a node without an evidence chain is clicked', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <div style={{ width: '800px', height: '800px' }}>
          <ReactFlowProvider>
            <InvestigationWorkspace
              initialNodes={initialNodes}
              initialEdges={initialEdges}
            />
          </ReactFlowProvider>
        </div>
      </MemoryRouter>
    );

    // Click terminal node first to trigger highlight
    await user.click(await screen.findByText('Terminal ATM'));

    // Now click the unrelated node (which has no metadata.evidence_chain)
    await user.click(screen.getByText('Unrelated Account'));

    // Verify highlighting is removed (the custom border style is stripped)
    const victimContainer = screen.getByText('Victim (John Doe)').closest('.react-flow__node');
    expect(victimContainer).not.toHaveStyle({ border: '2px solid #ef4444' });
  });
});
