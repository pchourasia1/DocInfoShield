import { detectSensitiveData } from './api.js';
import { DetectedEntity, RedactionResult } from './types.js';

const HEADER_TEXT = 'CONFIDENTIAL DOCUMENT';

// Word's search() rejects strings longer than 255 characters
const MAX_SEARCH_LENGTH = 255;

/**
 * Does the current Word host support the API features required for tracking changes?
 */
export function isTrackingChangesSupported(): boolean {
    try {
        return Office.context.requirements.isSetSupported('WordApi', '1.5');
    } catch (error) {
        console.log('Error checking if tracking changes are supported:', error);
        return false;
    }
}

/**
 * Enable tracking changes in the document
 */
export async function enableTrackingChanges(): Promise<void> {
    return Word.run(async (context) => {
        context.document.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
        await context.sync();
    });
}

/**
 * Add a confidentiality header to the top of the document, unless it is already there
 */
export async function addConfidentialityHeader(): Promise<void> {
    return Word.run(async (context) => {
        const body: Word.Body = context.document.body;
        const first: Word.Paragraph = body.paragraphs.getFirst();
        first.load('text');
        await context.sync();

        if (first.text.trim() === HEADER_TEXT) {
            return;
        }

        // Insert on the body (not before the first paragraph) so a document that starts with a table
        // gets the header above the table instead of inside its first cell
        const header: Word.Paragraph = body.insertParagraph(HEADER_TEXT, Word.InsertLocation.start);
        header.font.size = 14;
        header.font.bold = true;
        header.font.color = 'red';
        header.alignment = Word.Alignment.centered;
        header.spaceAfter = 12;

        // Empty paragraph between the header and the content, with normal formatting
        const spacer: Word.Paragraph = header.insertParagraph('', Word.InsertLocation.after);
        spacer.font.size = 11;
        spacer.font.bold = false;
        spacer.font.color = 'black';
        spacer.alignment = Word.Alignment.left;

        await context.sync();
    });
}

/**
 * Word search treats ^ as the start of a special code (^p, ^t, ...), so escape it
 */
function escapeSearchText(text: string): string {
    return text.replace(/\^/g, '^^');
}

/**
 * How many times `text` occurs in `paragraphText` before `start`, i.e. which search hit is this entity
 */
function occurrenceIndex(paragraphText: string, text: string, start: number): number {
    let count = 0;
    let index = paragraphText.indexOf(text);
    while (index !== -1 && index < start) {
        count++;
        index = paragraphText.indexOf(text, index + text.length);
    }
    return count;
}

/**
 * Detect sensitive information with the Python API and replace it in the document.
 * Uses three round trips to Word in total: read paragraphs, run all searches, apply all replacements.
 */
export async function redactSensitiveInformation(): Promise<RedactionResult> {
    return Word.run(async (context) => {
        const paragraphs = context.document.body.paragraphs;
        paragraphs.load('items/text');
        await context.sync();

        const texts: string[] = paragraphs.items.map(p => p.text);
        const detections: DetectedEntity[][] = await detectSensitiveData(texts);

        // Queue a search for every detected entity, scoped to its paragraph
        const pending: { entity: DetectedEntity; hits: Word.RangeCollection; occurrence: number }[] = [];
        let skipped = 0;

        detections.forEach((entities, i) => {
            for (const entity of entities) {
                if (entity.text.length > MAX_SEARCH_LENGTH) {
                    console.warn('Skipping detection longer than Word can search for:', entity);
                    skipped++;
                    continue;
                }
                const hits = paragraphs.items[i].search(escapeSearchText(entity.text), { matchCase: true });
                hits.load('items');
                pending.push({ entity, hits, occurrence: occurrenceIndex(texts[i], entity.text, entity.start) });
            }
        });
        await context.sync();

        // Replace the exact occurrence the API found, not every match of the same text
        const result: RedactionResult = { redactedCount: 0, counts: {}, skipped };
        for (const { entity, hits, occurrence } of pending) {
            const range = hits.items[occurrence];
            if (!range) {
                console.warn('Could not locate detection in the document:', entity);
                result.skipped++;
                continue;
            }
            range.insertText(entity.marker, Word.InsertLocation.replace);
            result.redactedCount++;
            result.counts[entity.type] = (result.counts[entity.type] ?? 0) + 1;
        }
        await context.sync();

        return result;
    });
}

/**
 * Main function to perform all redaction operations
 */
export async function performRedaction(): Promise<RedactionResult> {
    // Turn on tracking first so the redactions and the header show up as tracked changes
    if (isTrackingChangesSupported()) {
        await enableTrackingChanges();
    }

    // Redact before adding the header so the header text is never sent for detection
    const result = await redactSensitiveInformation();
    await addConfidentialityHeader();

    return result;
}
