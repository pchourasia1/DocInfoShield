import { API_BASE, checkHealth } from './api.js';
import { isTrackingChangesSupported, performRedaction } from './wordOperations.js';
import { SensitiveDataType } from './types.js';

const TYPE_LABELS: Record<SensitiveDataType, string> = {
    name: 'Names',
    email: 'Emails',
    phone: 'Phone numbers',
    ssn: 'SSNs',
    creditCard: 'Credit cards',
    dob: 'Dates of birth',
    address: 'Street addresses',
    location: 'Locations',
    medicalRecord: 'Medical / insurance IDs',
    orderNumber: 'Order numbers',
    id: 'Employee / account IDs',
    other: 'Other identifiers',
};

/**
 * Initialize the Office.js add-in
 */
Office.onReady((info) => {
    if (info.host === Office.HostType.Word) {
        initializeUI();
    }
});

function setStatus(id: string, ok: boolean, text: string): void {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = text;
        element.className = `status-item ${ok ? 'ok' : 'warn'}`;
    }
}

/**
 * Wire up the button and show tracking / API status
 */
async function initializeUI(): Promise<void> {
    document.getElementById('redactButton')?.addEventListener('click', handleRedactClick);

    const tracking = isTrackingChangesSupported();
    setStatus('trackingStatus', tracking, tracking ? 'Track Changes supported' : 'Track Changes not supported');

    setStatus('apiStatus', false, 'Connecting to detection service…');
    const healthy = await checkHealth();
    setStatus('apiStatus', healthy, healthy ? 'Detection service connected' : `Detection service offline (${API_BASE})`);
}

function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Handle the redact button click event
 */
async function handleRedactClick(): Promise<void> {
    const button = document.getElementById('redactButton') as HTMLButtonElement | null;
    const resultsDiv = document.getElementById('result');
    if (!button || !resultsDiv) {
        return;
    }

    button.disabled = true;
    button.textContent = 'Redacting…';
    resultsDiv.innerHTML = '';

    try {
        const result = await performRedaction();

        const rows = (Object.keys(TYPE_LABELS) as SensitiveDataType[])
            .filter(type => result.counts[type])
            .map(type => `<li><span>${TYPE_LABELS[type]}</span><span class="count">${result.counts[type]}</span></li>`)
            .join('');

        resultsDiv.innerHTML = `
            <div class="result-card success">
                <div class="result-total"><span class="count">${result.redactedCount}</span> redactions</div>
                ${rows ? `<ul>${rows}</ul>` : '<p>No sensitive information found.</p>'}
                ${result.skipped ? `<p class="note">${result.skipped} detection(s) could not be located and were skipped.</p>` : ''}
                <p class="note">Review → All Markup shows every change.</p>
            </div>
        `;
        setStatus('apiStatus', true, 'Detection service connected');
    } catch (error) {
        console.error('Error performing redaction:', error);
        const message = error instanceof Error ? error.message : String(error);
        resultsDiv.innerHTML = `
            <div class="result-card error">
                <strong>Redaction failed</strong>
                <p>${escapeHtml(message)}</p>
            </div>
        `;
    } finally {
        button.disabled = false;
        button.textContent = 'Redact Document';
    }
}
