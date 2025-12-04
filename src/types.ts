/**
 * Shared types for the task pane and the detection API
 */

export type SensitiveDataType =
    | 'name' | 'email' | 'phone' | 'ssn' | 'creditCard' | 'dob' | 'address'
    | 'location' | 'medicalRecord' | 'orderNumber' | 'id' | 'other';

/** One sensitive span returned by the Python API. Offsets are relative to its paragraph. */
export interface DetectedEntity {
    text: string;
    start: number;
    end: number;
    entity: string;   // Presidio entity name, e.g. PERSON
    type: SensitiveDataType;
    marker: string;   // replacement text, e.g. [REDACTED NAME]
    score: number;
}

export interface DetectResponse {
    paragraphs: DetectedEntity[][];
}

export interface RedactionResult {
    redactedCount: number;
    counts: Partial<Record<SensitiveDataType, number>>;
    skipped: number;  // detections that could not be located in the document
}
