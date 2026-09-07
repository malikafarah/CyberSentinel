# backend/app/nlp/intake_parser.py
import re
from typing import Dict, Any, List

# Load a pre-trained model (in production, fine-tune an IndicBERT or multilingual spaCy model)
try:
    import spacy
    try:
        nlp = spacy.load("en_core_web_md")
    except OSError:
        try:
            nlp = spacy.load("en_core_web_sm")
        except OSError:
            nlp = None
except ImportError:
    spacy = None
    nlp = None


def extract_entities_hybrid(complaint_text: str) -> Dict[str, Any]:
    """
    Hybrid NLP entity extraction pipeline for code-mixed Indic NCRP complaints.
    - Stage 1: Fast Regex (High Precision) for UPIs, phones, and accounts
    - Stage 2: Code-mixed word normalization (e.g., '98765-four-3210', 'khata number')
    - Stage 3: NER Contextual Fallback (High Recall) for persons and disguised account numbers
    """
    extracted: Dict[str, Any] = {
        "upi_ids": [],
        "phone_numbers": [],
        "bank_accounts": [],
        "suspect_names": [],
        "confidence_metrics": {}
    }

    if not complaint_text:
        return extracted

    # --- STAGE 1: Fast Regex (High Precision) ---
    # Captures standard UPIs (e.g., victim@sbi, scammer@paytm, 9876543210@ybl)
    upi_pattern = r'[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}'
    extracted["upi_ids"] = list(set(re.findall(upi_pattern, complaint_text)))

    # Captures standard Indian phones (+91-9876543210, +91 9876543210, or 9876543210)
    phone_pattern = r'(?:\+91[\-\s]?)?[6789]\d{9}'
    extracted["phone_numbers"] = list(set(re.findall(phone_pattern, complaint_text)))

    # Normalization for Code-Mixed Indic disguised numbers (e.g., "98765-four-3210")
    word_to_digit = {
        "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4",
        "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
        "shunya": "0", "ek": "1", "do": "2", "teen": "3", "chaar": "4",
        "paanch": "5", "chhah": "6", "saat": "7", "aath": "8", "nau": "9"
    }
    normalized_text = complaint_text
    for word, digit in word_to_digit.items():
        normalized_text = re.sub(rf'\b{word}\b', digit, normalized_text, flags=re.IGNORECASE)
        normalized_text = re.sub(rf'-{word}-', f'-{digit}-', normalized_text, flags=re.IGNORECASE)
        normalized_text = re.sub(rf'-{word}\b', f'-{digit}', normalized_text, flags=re.IGNORECASE)
        normalized_text = re.sub(rf'\b{word}-', f'{digit}-', normalized_text, flags=re.IGNORECASE)

    # Disguised/normalized phone numbers
    norm_phone_pattern = r'(?:\+91[\-\s]?)?[6789][\d\-\s]{9,14}\d'
    for match in re.findall(norm_phone_pattern, normalized_text):
        cleaned_digits = re.sub(r'[^0-9+]', '', match)
        if len(cleaned_digits) == 10 and cleaned_digits[0] in '6789':
            if cleaned_digits not in extracted["phone_numbers"]:
                extracted["phone_numbers"].append(cleaned_digits)
        elif len(cleaned_digits) > 10 and cleaned_digits.endswith(tuple('6789' + d for d in '0123456789')):
            last_10 = cleaned_digits[-10:]
            if last_10[0] in '6789' and last_10 not in extracted["phone_numbers"]:
                extracted["phone_numbers"].append(last_10)

    # Direct bank account regex (9-18 digits)
    direct_accs = re.findall(r'\b\d{9,18}\b', complaint_text)
    for acc in set(direct_accs):
        if not any(acc in p for p in extracted["phone_numbers"]):
            extracted["bank_accounts"].append({
                "entity": acc,
                "reason": "REGEX_NUMERIC_MATCH",
                "confidence": 0.95
            })

    # --- STAGE 2: NER Fallback (High Recall for Context) ---
    if nlp:
        doc = nlp(complaint_text)
        for ent in doc.ents:
            # Extract names of people mentioned in the complaint
            if ent.label_ == "PERSON":
                extracted["suspect_names"].append({
                    "entity": ent.text,
                    "reason": "NER_PERSON_MATCH",
                    "confidence": 0.82
                })

            # Use dependency parsing to find disguised numbers
            # e.g., "account number is 1234 5678 9012"
            if ent.label_ in ["CARDINAL", "MONEY"] and len(ent.text.replace(" ", "").replace("-", "")) >= 9:
                # Check surrounding context words (window of 3 words)
                start, end = max(0, ent.start - 3), min(len(doc), ent.end + 3)
                context = doc[start:end].text.lower()

                if any(word in context for word in ["ac", "a/c", "account", "khata", "paise", "transferred"]):
                    clean_acc = ent.text.replace(" ", "").replace("-", "")
                    if not any(item.get("entity") == clean_acc for item in extracted["bank_accounts"] if isinstance(item, dict)):
                        extracted["bank_accounts"].append({
                            "entity": clean_acc,
                            "reason": f"NER_CONTEXT: '{context}'",
                            "confidence": 0.75  # Lower confidence than strict regex
                        })
    else:
        # Rule-based Indic Named Entity Heuristics
        name_patterns = [
            r'(?:caller|fraudster|person|named|naam|name is|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)',
            r'(?:mr\.|ms\.|shri|smt)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)'
        ]
        for pat in name_patterns:
            matches = re.findall(pat, complaint_text, flags=re.IGNORECASE)
            for m in matches:
                clean_name = m.strip()
                if len(clean_name) > 2 and not any(clean_name.lower() == item.get("entity", "").lower() for item in extracted["suspect_names"]):
                    extracted["suspect_names"].append({
                        "entity": clean_name,
                        "reason": "HEURISTIC_INDIC_PERSON_MATCH",
                        "confidence": 0.78
                    })

    # Confidence scoring
    extracted["confidence_metrics"] = {
        "upi_confidence": 0.98 if extracted["upi_ids"] else 0.0,
        "phone_confidence": 0.95 if extracted["phone_numbers"] else 0.0,
        "account_confidence": max([item["confidence"] for item in extracted["bank_accounts"] if isinstance(item, dict)], default=0.0),
        "suspect_name_confidence": max([item["confidence"] for item in extracted["suspect_names"] if isinstance(item, dict)], default=0.0)
    }

    return extracted
