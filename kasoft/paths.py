"""Chemins projet — racine du dépôt."""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
STATIC_DIR = PROJECT_ROOT / "static"
TEMPLATES_DIR = PROJECT_ROOT / "templates"
PHONE_STATIC = STATIC_DIR / "phone"
PC_STATIC = STATIC_DIR / "pc"
PHONE_TEMPLATES = TEMPLATES_DIR / "phone"
PC_TEMPLATES = TEMPLATES_DIR / "pc"
OUTPUT_DIR = PROJECT_ROOT / "output"
