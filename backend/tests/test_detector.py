import pytest

from app.detector import detect


def found(text: str) -> dict[str, str]:
    """Detected span text -> add-in type for a single paragraph"""
    return {e.text: e.type for e in detect([text])[0]}


def test_offsets_match_text():
    text = "Contact Jane Doe at jane.doe@example.com today."
    for e in detect([text])[0]:
        assert text[e.start : e.end] == e.text


@pytest.mark.parametrize(
    "text, span, expected_type",
    [
        ("Please email me at jane.doe@example.com.", "jane.doe@example.com", "email"),
        ("My phone number is (555) 987-6543.", "(555) 987-6543", "phone"),
        ("My SSN is 404-12-3111.", "404-12-3111", "ssn"),
        ("Paid with credit card number 4532-1234-5678-9012.", "4532-1234-5678-9012", "creditCard"),
        ("The transaction was processed under the name Amanda Rodriguez.", "Amanda Rodriguez", "name"),
        ("The patient, Lisa Anderson, DOB 03/15/1985, visited.", "03/15/1985", "dob"),
        ("Her medical record number is MRN-998877.", "MRN-998877", "medicalRecord"),
        ("Her insurance policy number is INS-44556677.", "INS-44556677", "medicalRecord"),
        ("About my recent order #45782.", "#45782", "orderNumber"),
        ("His employee ID is EMP-2024-5567.", "EMP-2024-5567", "id"),
        ("Billing address at 742 Evergreen Terrace, Springfield.", "742 Evergreen Terrace, Springfield", "address"),
        ("The last four digits of the social security number on file are 8234.", "8234", "other"),
    ],
)
def test_detects_sensitive_data(text, span, expected_type):
    assert found(text).get(span) == expected_type


@pytest.mark.parametrize(
    "text, not_sensitive",
    [
        ("I have been a loyal customer since 2018.", "2018"),  # a year, not an identifier
        ("The meeting is on 03/15/2025 at noon.", "03/15/2025"),  # a date, not a DOB
        ("Email", "Email"),  # table header cell
        ("Dear Customer Support Team, I am writing to you.", "Customer Support Team"),
    ],
)
def test_ignores_non_sensitive_text(text, not_sensitive):
    assert not_sensitive not in found(text)


def test_overlaps_keep_longest_span():
    # The address contains the city "Springfield"; only the full address should be returned
    entities = detect(["Send it to 742 Evergreen Terrace, Springfield."])[0]
    assert [e.text for e in entities] == ["742 Evergreen Terrace, Springfield"]


def test_batch_keeps_paragraph_order():
    results = detect(["john@example.com", "", "Call (555) 123-4567"])
    assert [[e.type for e in r] for r in results] == [["email"], [], ["phone"]]
