import { useState } from 'react';
import { Cpu, Database, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { intakeService, type ExtractedEntities } from '../services/intakeService';

const SAMPLE_COMPLAINTS = [
  `Victim was duped of Rs 85,000 via a fake KYC update SMS link. Funds were transferred from victim account 98765432101234 to suspect UPI ID scammer88@paytm and 9876543210@ybl. Caller contacted victim from mobile numbers +919876543210 and 9123456789 impersonating bank manager.`,
  `NCRP Complaint #2026-NCRP-8812: Phishing attack through fake electricity bill payment portal. Victim transferred Rs 45,000 to beneficiary account 11223344556677 (SBI) with phone contact 9845123456 and secondary UPI handle cyberthief@okhdfcbank.`,
];

export default function NcrpIntake() {
  const [rawText, setRawText] = useState('');
  const [extractedData, setExtractedData] = useState<ExtractedEntities | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedSuccessMessage, setSeedSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Calls the NLP extraction endpoint
  const handleExtract = async () => {
    if (!rawText.trim()) return;
    setIsExtracting(true);
    setErrorMessage(null);
    setSeedSuccessMessage(null);

    try {
      const data = await intakeService.extractComplaint(rawText);
      setExtractedData(data);
    } catch (error: any) {
      console.error('Extraction failed', error);
      setErrorMessage(error?.message || 'NLP entity extraction failed. Check server logs.');
    } finally {
      setIsExtracting(false);
    }
  };

  // Sends the parsed entities to be seeded into the graph database
  const handleSeedGraph = async () => {
    if (!extractedData) return;
    setIsSeeding(true);
    setErrorMessage(null);

    try {
      const result = await intakeService.seedVictimNodes(extractedData);
      setSeedSuccessMessage(
        result?.message || 'Victim nodes seeded successfully into Money Trail Graph with Risk Score 100.'
      );
    } catch (error: any) {
      console.error('Seeding failed', error);
      setErrorMessage(error?.message || 'Failed to seed victim nodes into graph.');
    } finally {
      setIsSeeding(false);
    }
  };

  const loadSample = (index: number) => {
    setRawText(SAMPLE_COMPLAINTS[index]);
    setExtractedData(null);
    setSeedSuccessMessage(null);
    setErrorMessage(null);
  };

  const totalExtractedCount = extractedData
    ? (extractedData.upis?.length || 0) +
      (extractedData.phones?.length || 0) +
      (extractedData.accounts?.length || 0)
    : 0;

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Header Info */}
      <div className="panel" style={{ background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.5) 0%, rgba(15, 23, 42, 0.7) 100%)', borderColor: 'var(--border-strong)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <p className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Cpu size={14} style={{ color: 'var(--accent)' }} /> NCRP NLP PARSER & GRAPH SEEDER
            </p>
            <h2 style={{ fontSize: '20px', fontWeight: 800, marginTop: '4px', letterSpacing: '-0.02em' }}>
              Unstructured Complaint Intake
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', maxWidth: '650px' }}>
              Paste raw citizen statements or FIR narratives from the National Cybercrime Reporting Portal.
              The NLP engine extracts UPI IDs, contact numbers, and bank accounts to seed victim roots with Risk Score 100.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className="btn secondary"
              onClick={() => loadSample(0)}
              style={{ fontSize: '11px', padding: '6px 10px' }}
            >
              Sample KYC Scam
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => loadSample(1)}
              style={{ fontSize: '11px', padding: '6px 10px' }}
            >
              Sample Phishing
            </button>
          </div>
        </div>
      </div>

      {/* Input Form Panel */}
      <div className="panel">
        <label
          htmlFor="ncrp-raw-input"
          style={{ display: 'block', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-subtle)', marginBottom: '8px' }}
        >
          Raw Complaint Narrative
        </label>
        
        <textarea
          id="ncrp-raw-input"
          className="w-full"
          style={{
            width: '100%',
            height: '160px',
            background: 'var(--surface-muted)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            fontSize: '13px',
            fontFamily: 'JetBrains Mono, monospace',
            lineHeight: 1.6,
            resize: 'vertical',
            outline: 'none',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
          }}
          placeholder="Paste unstructured NCRP complaint text here (e.g., 'Victim transferred Rs 50,000 to UPI ID suspect@ybl from mobile 9876543210...')..."
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-subtle)' }}>
            {rawText.length > 0 ? `${rawText.length} characters entered` : 'Ready for NLP regex extraction'}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {rawText && (
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setRawText('');
                  setExtractedData(null);
                  setSeedSuccessMessage(null);
                  setErrorMessage(null);
                }}
                disabled={isExtracting || isSeeding}
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={handleExtract}
              disabled={isExtracting || !rawText.trim()}
              className="btn"
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {isExtracting ? (
                <>
                  <RefreshCw size={14} className="spin" /> Running NLP Extraction...
                </>
              ) : (
                <>
                  <Cpu size={14} /> Extract Entities
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Error Feedback */}
      {errorMessage && (
        <div
          style={{
            padding: '12px 16px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-md)',
            color: '#f87171',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13px',
          }}
        >
          <AlertTriangle size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Extracted Entities Viewer */}
      {extractedData && (
        <div
          className="panel"
          style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--border-strong)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <p className="eyebrow" style={{ color: 'var(--accent)' }}>IDENTIFIER RECOGNITION REPORT</p>
              <h3 style={{ fontSize: '16px', fontWeight: 800, marginTop: '2px' }}>
                Extracted Identifiers ({totalExtractedCount} Entities)
              </h3>
            </div>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                background: totalExtractedCount > 0 ? 'rgba(72, 216, 120, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: totalExtractedCount > 0 ? 'var(--accent)' : '#f87171',
                border: `1px solid ${totalExtractedCount > 0 ? 'rgba(72, 216, 120, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              }}
            >
              {totalExtractedCount > 0 ? 'ENTITIES IDENTIFIED' : 'NO IDENTIFIERS FOUND'}
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px',
              marginBottom: '20px',
            }}
          >
            {/* UPI IDs */}
            <div
              style={{
                background: 'var(--surface-muted)',
                padding: '14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
              }}
            >
              <h4
                style={{
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--text-subtle)',
                  fontWeight: 700,
                  marginBottom: '10px',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>UPI Handles</span>
                <span style={{ color: 'var(--accent)' }}>{extractedData.upis?.length || 0}</span>
              </h4>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {extractedData.upis && extractedData.upis.length > 0 ? (
                  extractedData.upis.map((upi: string) => (
                    <li key={upi} style={{ fontFamily: 'JetBrains Mono, monospace', color: '#6ee7b7' }}>
                      {upi}
                    </li>
                  ))
                ) : (
                  <li style={{ color: 'var(--text-muted)', listStyle: 'none', marginLeft: '-18px' }}>
                    No UPI handles detected
                  </li>
                )}
              </ul>
            </div>

            {/* Phone Numbers */}
            <div
              style={{
                background: 'var(--surface-muted)',
                padding: '14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
              }}
            >
              <h4
                style={{
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--text-subtle)',
                  fontWeight: 700,
                  marginBottom: '10px',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>Phone Numbers (+91)</span>
                <span style={{ color: '#34D399' }}>{extractedData.phones?.length || 0}</span>
              </h4>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {extractedData.phones && extractedData.phones.length > 0 ? (
                  extractedData.phones.map((ph: string) => (
                    <li key={ph} style={{ fontFamily: 'JetBrains Mono, monospace', color: '#6EE7B7' }}>
                      {ph}
                    </li>
                  ))
                ) : (
                  <li style={{ color: 'var(--text-muted)', listStyle: 'none', marginLeft: '-18px' }}>
                    No phone numbers detected
                  </li>
                )}
              </ul>
            </div>

            {/* Bank Accounts */}
            <div
              style={{
                background: 'var(--surface-muted)',
                padding: '14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
              }}
            >
              <h4
                style={{
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--text-subtle)',
                  fontWeight: 700,
                  marginBottom: '10px',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>Bank Accounts</span>
                <span style={{ color: '#f59e0b' }}>{extractedData.accounts?.length || 0}</span>
              </h4>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {extractedData.accounts && extractedData.accounts.length > 0 ? (
                  extractedData.accounts.map((acc: string) => (
                    <li key={acc} style={{ fontFamily: 'JetBrains Mono, monospace', color: '#fcd34d' }}>
                      {acc}
                    </li>
                  ))
                ) : (
                  <li style={{ color: 'var(--text-muted)', listStyle: 'none', marginLeft: '-18px' }}>
                    No bank accounts detected
                  </li>
                )}
              </ul>
            </div>
          </div>

          {/* Seeding Success Notification */}
          {seedSuccessMessage && (
            <div
              style={{
                padding: '14px 16px',
                background: 'rgba(72, 216, 120, 0.12)',
                border: '1px solid rgba(72, 216, 120, 0.3)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--accent)',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '13px',
              }}
            >
              <CheckCircle size={18} />
              <div style={{ flex: 1 }}>
                <b>Root Seeding Successful:</b> {seedSuccessMessage}
              </div>
            </div>
          )}

          {/* Seed Graph Action Button */}
          <button
            type="button"
            onClick={handleSeedGraph}
            disabled={isSeeding || totalExtractedCount === 0}
            className="btn"
            style={{
              width: '100%',
              padding: '12px',
              fontWeight: 800,
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              background: totalExtractedCount === 0 ? 'var(--surface-muted)' : 'var(--accent)',
              color: totalExtractedCount === 0 ? 'var(--text-muted)' : '#000',
            }}
          >
            {isSeeding ? (
              <>
                <RefreshCw size={16} className="spin" /> Seeding Graph Database...
              </>
            ) : (
              <>
                <Database size={16} /> Seed Victim Nodes into Graph (Risk Score: 100)
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
