"""
Sensitive data detection built on Microsoft Presidio.

Presidio's built-in recognizers (spaCy NER for names and locations, plus validated
patterns for emails, phones, SSNs and credit cards) are extended with custom
recognizers for the identifiers this add-in cares about: dates of birth, street
addresses, medical record numbers, order numbers, employee IDs and partial IDs.
"""

import os
import re
from dataclasses import asdict, dataclass
from functools import lru_cache

from presidio_analyzer import (
    AnalyzerEngine,
    BatchAnalyzerEngine,
    Pattern,
    PatternRecognizer,
    RecognizerResult,
)
from presidio_analyzer.nlp_engine import NlpEngineProvider

SPACY_MODEL = os.getenv("SPACY_MODEL", "en_core_web_lg")
SCORE_THRESHOLD = float(os.getenv("SCORE_THRESHOLD", "0.4"))

# Presidio entity -> (add-in type, redaction marker)
ENTITY_TYPES: dict[str, tuple[str, str]] = {
    "PERSON": ("name", "[REDACTED NAME]"),
    "EMAIL_ADDRESS": ("email", "[REDACTED EMAIL]"),
    "PHONE_NUMBER": ("phone", "[REDACTED PHONE]"),
    "US_PHONE_FORMAT": ("phone", "[REDACTED PHONE]"),
    "US_SSN": ("ssn", "[REDACTED SSN]"),
    "CREDIT_CARD": ("creditCard", "[REDACTED CREDIT CARD]"),
    "CARD_NUMBER": ("creditCard", "[REDACTED CREDIT CARD]"),
    "DATE_OF_BIRTH": ("dob", "[REDACTED DOB]"),
    "STREET_ADDRESS": ("address", "[REDACTED ADDRESS]"),
    "LOCATION": ("location", "[REDACTED LOCATION]"),
    "MEDICAL_RECORD": ("medicalRecord", "[REDACTED MEDICAL RECORD]"),
    "ORDER_NUMBER": ("orderNumber", "[REDACTED ORDER NUMBER]"),
    "EMPLOYEE_ID": ("id", "[REDACTED ID]"),
    "PARTIAL_ID": ("other", "[REDACTED]"),
    "US_BANK_NUMBER": ("other", "[REDACTED]"),
    "US_PASSPORT": ("other", "[REDACTED]"),
    "US_ITIN": ("other", "[REDACTED]"),
    "IBAN_CODE": ("other", "[REDACTED]"),
    "IP_ADDRESS": ("other", "[REDACTED]"),
}

# Field labels that are never sensitive on their own. Without surrounding context (e.g. a table
# header cell), spaCy can tag a lone word like "Email" as a PERSON.
ALLOW_LIST = [
    "Name", "First Name", "Last Name", "Full Name", "Email", "E-mail", "Phone", "Mobile", "Address",
    "City", "State", "Zip", "Country", "Age", "Gender", "Sex", "DOB", "Date of Birth", "SSN",
    "Account", "Card", "Notes", "Comments", "Status", "Title", "Department", "Company",
]

# Case-sensitive flags for patterns that rely on capitalization (Presidio defaults to IGNORECASE)
CASE_SENSITIVE = re.DOTALL | re.MULTILINE

STREET_SUFFIX = (
    r"(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Place|Pl"
    r"|Way|Circle|Cir|Terrace|Ter|Parkway|Pkwy|Highway|Hwy)"
)


def _custom_recognizers() -> list[PatternRecognizer]:
    return [
        # Dates only count as a DOB when wording like "DOB" or "born" is nearby
        PatternRecognizer(
            supported_entity="DATE_OF_BIRTH",
            patterns=[
                Pattern("mm/dd/yyyy", r"\b(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])[/-](?:19|20)\d{2}\b", 0.3),
                Pattern("yyyy-mm-dd", r"\b(?:19|20)\d{2}[/-](?:0[1-9]|1[0-2])[/-](?:0[1-9]|[12]\d|3[01])\b", 0.3),
            ],
            context=["dob", "birth", "born", "birthday", "birthdate"],
        ),
        # Number, capitalized street name, suffix, then optional ", City", ", ST" and ZIP
        PatternRecognizer(
            supported_entity="STREET_ADDRESS",
            patterns=[
                Pattern(
                    "us street address",
                    r"\b\d{1,6}(?: [A-Z][a-z]+){1,4} " + STREET_SUFFIX + r"\b\.?"
                    r"(?:,? (?:Apt|Suite|Unit) \w+)?"
                    r"(?:, [A-Z][a-z]+(?: [A-Z][a-z]+)?)?"
                    r"(?:, [A-Z]{2})?(?: \d{5}(?:-\d{4})?)?",
                    0.7,
                )
            ],
            global_regex_flags=CASE_SENSITIVE,
        ),
        PatternRecognizer(
            supported_entity="MEDICAL_RECORD",
            patterns=[Pattern("mrn / insurance id", r"\b(?:MRN|INS)-?\d{4,}\b", 0.85)],
            context=["medical", "record", "insurance", "policy", "patient"],
            global_regex_flags=CASE_SENSITIVE,
        ),
        PatternRecognizer(
            supported_entity="ORDER_NUMBER",
            patterns=[Pattern("hash number", r"(?<!\w)#\d{3,}\b", 0.6)],
            context=["order", "invoice", "ticket", "case", "reference"],
        ),
        PatternRecognizer(
            supported_entity="EMPLOYEE_ID",
            patterns=[
                Pattern("emp id", r"\bEMP-?\d+(?:-\d+)*\b", 0.85),
                Pattern("prefixed id", r"\b[A-Z]{2,5}-\d{3,}(?:-\d+)*\b", 0.2),
            ],
            context=["id", "employee", "member", "badge", "account", "customer"],
            global_regex_flags=CASE_SENSITIVE,
        ),
        # US phone numbers by format. Presidio's PhoneRecognizer only accepts numbers that are
        # really assigned, so fictional ones like (555) 123-4567 would otherwise be missed.
        PatternRecognizer(
            supported_entity="US_PHONE_FORMAT",
            patterns=[
                Pattern(
                    "us phone",
                    r"(?<!\w)(?:\+?1[-. ]?)?(?:\(\d{3}\)|\d{3})[-. ]?\d{3}[-. ]\d{4}\b",
                    0.5,
                )
            ],
            context=["phone", "call", "cell", "mobile", "tel", "line", "fax", "contact"],
        ),
        # 16-digit card numbers that fail the Luhn check (Presidio's CreditCardRecognizer drops those);
        # only kept when card wording is nearby
        PatternRecognizer(
            supported_entity="CARD_NUMBER",
            patterns=[Pattern("16 digits", r"\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b", 0.1)],
            context=["card", "credit", "debit", "visa", "mastercard", "amex", "payment"],
        ),
        # A bare 4-digit number is only an identifier with wording like "last four digits" nearby,
        # so years such as "since 2018" are left alone
        PatternRecognizer(
            supported_entity="PARTIAL_ID",
            patterns=[Pattern("four digits", r"\b\d{4}\b", 0.1)],
            context=["ssn", "social", "security", "digits", "last", "card", "account", "ending", "pin"],
        ),
    ]


@lru_cache(maxsize=1)
def get_analyzer() -> BatchAnalyzerEngine:
    """Build the analyzer once; loading the spaCy model takes a few seconds."""
    nlp_engine = NlpEngineProvider(
        nlp_configuration={
            "nlp_engine_name": "spacy",
            "models": [{"lang_code": "en", "model_name": SPACY_MODEL}],
        }
    ).create_engine()

    analyzer = AnalyzerEngine(nlp_engine=nlp_engine, supported_languages=["en"])
    for recognizer in _custom_recognizers():
        analyzer.registry.add_recognizer(recognizer)

    return BatchAnalyzerEngine(analyzer_engine=analyzer)


@dataclass
class DetectedEntity:
    text: str
    start: int
    end: int
    entity: str
    type: str
    marker: str
    score: float


def _resolve_overlaps(results: list[RecognizerResult]) -> list[RecognizerResult]:
    """
    Keep one result per span of text. Longer spans win (a full address beats the city inside it,
    an employee ID beats the 4-digit chunks inside it), then higher scores.
    """
    kept: list[RecognizerResult] = []
    for result in sorted(results, key=lambda r: (-(r.end - r.start), -r.score)):
        if all(result.end <= k.start or result.start >= k.end for k in kept):
            kept.append(result)
    return sorted(kept, key=lambda r: r.start)


def detect(paragraphs: list[str]) -> list[list[DetectedEntity]]:
    """Detect sensitive data in each paragraph. Offsets are relative to that paragraph."""
    batch_results = get_analyzer().analyze_iterator(
        paragraphs,
        language="en",
        entities=list(ENTITY_TYPES),
        score_threshold=SCORE_THRESHOLD,
        allow_list=ALLOW_LIST,
    )

    detections: list[list[DetectedEntity]] = []
    for text, results in zip(paragraphs, batch_results):
        entities = []
        for r in _resolve_overlaps(results):
            entity_type, marker = ENTITY_TYPES[r.entity_type]
            entities.append(
                DetectedEntity(
                    text=text[r.start : r.end],
                    start=r.start,
                    end=r.end,
                    entity=r.entity_type,
                    type=entity_type,
                    marker=marker,
                    score=round(r.score, 2),
                )
            )
        detections.append(entities)

    return detections


def detect_as_dicts(paragraphs: list[str]) -> list[list[dict]]:
    return [[asdict(e) for e in entities] for entities in detect(paragraphs)]
