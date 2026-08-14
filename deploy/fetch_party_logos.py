"""Récupère les logos des partis marocains vers static/parties/.

Noms : tableaux des articles Wikipédia arabes (liste des partis, législatives 2021).
Logos : fichier curé (grands partis, vérifié à la main) sinon recherche stricte
de fichier sur Commons / ar.wikipedia — le titre du fichier doit contenir le nom
du parti et ne pas ressembler à une photo (siège, congrès, dirigeants) ni à un
parti d'un autre pays.

Usage :
    python deploy/fetch_party_logos.py

Écrit :
    static/parties/<slug>.png      logo (256 px de large max)
    static/parties/catalog.json    [{id, name, color, logo, source}]

Les partis sans logo trouvé restent dans le catalogue avec "logo": null —
l'interface affiche un badge coloré et le responsable peut téléverser son fichier.
"""
import io
import json
import re
import sys
import unicodedata
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from kasoft.paths import PROJECT_ROOT  # noqa: E402

OUT_DIR = PROJECT_ROOT / "static" / "parties"
CATALOG = OUT_DIR / "catalog.json"
THUMB_WIDTH = 256

SOURCE_PAGES = [
    "قائمة الأحزاب السياسية في المغرب",
    "الانتخابات التشريعية المغربية 2021",
]

# Fichiers vérifiés visuellement pour les partis représentés au parlement.
# clé = core_key(nom), valeur = (fichier, hôte, couleur)
CURATED = {
    "الاصاله المعاصره": ("حزب_الأصالة_والمعاصرة.jpg", "ar.wikipedia.org", "#5b7c99"),
    "الاستقلال": ("Logo - Parti de l'Istiqlal.png", "commons.wikimedia.org", "#c62828"),
    "التجمع الوطني للاحرار": ("التجمع الوطني للأحرار.png", "commons.wikimedia.org", "#1565c0"),
    "العداله التنميه": ("شعار_حزب_العدالة_والتنمية_(المغرب).svg", "ar.wikipedia.org", "#2e7d32"),
    "الاتحاد الاشتراكي للقوات الشعبيه": ("USFP-Logo.png", "commons.wikimedia.org", "#e91e63"),
    "الحركه الشعبيه": ("Logo MP-Maroc.png", "commons.wikimedia.org", "#f9a825"),
    "التقدم الاشتراكيه": ("حزب_التقدم_والاشتراكية.JPG", "ar.wikipedia.org", "#c62828"),
    "الاتحاد الدستوري": ("شعار الاتحاد الدستوري.png", "ar.wikipedia.org", "#1565c0"),
    "الاشتراكي الموحد": ("شعار الحزب الاشتراكي الموحد المغرب.png", "commons.wikimedia.org", "#00838f"),
    "جبهه القوي الديمقراطيه": ("شعار حزب جبهة القوى الديمقراطية.png", "ar.wikipedia.org", "#2e7d32"),
    "الحركه الديمقراطيه الاجتماعيه": ("شعار الحركة الديمقراطية والاجتماعية.png", "ar.wikipedia.org", "#43a047"),
}

# Un nom de parti marocain commence par l'un de ces mots.
PARTY_PREFIX = re.compile(r"^(حزب|الحزب|الاتحاد|التجمع|الحركة|جبهة|فيدرالية|النهج)\b")
# Libellés génériques ou hors-sujet captés par les liens des tableaux.
NAME_BLOCKLIST = {"حزب سياسي", "حزب مغربي", "حزب", "الحزب", "أحزاب سياسية"}
NAME_BLOCKWORDS = ("البوليساريو",)
# Un fichier n'est un logo que si son titre ne décrit pas une photo…
PHOTO_WORDS = re.compile(
    r"مقر|قادة|قيادة|مؤتمر|مبنى|اجتماع|مسيرة|تجمع انتخابي|مهرجان|زعيم|رئيس|أعضاء"
    r"|headquarters|building|congress|meeting|rally|leaders?|photo",
    re.IGNORECASE,
)
# …et ne renvoie pas à un parti d'un autre pays.
FOREIGN_WORDS = re.compile(
    r"الجزائر|مصر|العراق|تونس|اليمن|لبنان|سوري|الأردن|فلسطين|السودان|ليبيا|موريتانيا"
    r"|algeri|egypt|iraq|tunisi|yemen|leban|syria|jordan|palestin|sudan|libya",
    re.IGNORECASE,
)
DECOR_WORDS = re.compile(r"twemoji|flag|atlas|carte|map|^eyes[_ ]|^no[-_ ]?image", re.IGNORECASE)
LOGO_EXT = re.compile(r"\.(png|jpe?g|svg|gif)$", re.IGNORECASE)

PALETTE = [
    "#c62828", "#2e7d32", "#1565c0", "#f9a825", "#5b7c99", "#8e24aa",
    "#00838f", "#ef6c00", "#4527a0", "#43a047", "#6d4c41", "#ad1457",
]

SESSION = requests.Session()
SESSION.headers["User-Agent"] = "kasoft-party-logos/1.0 (ksoft.maroc@gmail.com)"


def api(host, **params):
    params.setdefault("format", "json")
    res = SESSION.get(f"https://{host}/w/api.php", params=params, timeout=45)
    res.raise_for_status()
    return res.json()


# ---------------------------------------------------------------- noms


def normalize_ar(text):
    """Clé de comparaison : alef/ya/ta-marbouta unifiés, « و » de liaison retiré."""
    trans = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ى": "ي", "ة": "ه", "ـ": ""})
    out = text.translate(trans).replace("_", " ")
    out = re.sub(r"\bو\s*", " ", out)  # « الأصالة والمعاصرة » = « الأصالة و المعاصرة »
    return re.sub(r"\s+", " ", out).strip()


def core_key(name):
    """Clé sans le mot « حزب » : « حزب الاستقلال » et « الاستقلال » sont un seul parti."""
    return re.sub(r"^(حزب|الحزب)\s+", "", normalize_ar(name))


def display_name(name):
    return re.sub(r"\s*\([^)]*\)\s*$", "", name).strip()


def label_rank(name):
    """Trie les libellés d'un même parti : « و » attaché d'abord, puis le plus long."""
    return (0 if re.search(r"\bو\s", name) else 1, len(name))


def collect_names():
    """(nom affiché, titre de l'article) par parti, dédupliqué."""
    found = {}
    for page in SOURCE_PAGES:
        data = api("ar.wikipedia.org", action="parse", page=page, prop="wikitext", redirects=1)
        if "error" in data:
            print(f"  ! {page}: {data['error'].get('info')}")
            continue
        for link in re.findall(r"\[\[([^\[\]]+)\]\]", data["parse"]["wikitext"]["*"]):
            if link.startswith(("ملف:", "File:", "تصنيف:", "Category:")):
                continue
            article, _, label = link.partition("|")
            name = display_name(re.sub(r"\s+", " ", (label or article).strip()))
            if not PARTY_PREFIX.match(name) or name in NAME_BLOCKLIST:
                continue
            if any(bad in name for bad in NAME_BLOCKWORDS):
                continue
            key = core_key(name)
            previous = found.get(key)
            # garde le libellé le plus complet, mais « الأصالة والمعاصرة »
            # plutôt que « الأصالة و المعاصرة » (و détaché)
            if not previous or label_rank(name) > label_rank(previous[0]):
                found[key] = (name, article.strip())
    return found


# ---------------------------------------------------------------- logos


# Mots tolérés autour du nom du parti dans un titre de fichier.
FILLER_WORDS = re.compile(
    r"\b(شعار|رمز|حزب|الحزب|المغرب|المغربي|مغربي|logo|party|parti|maroc|morocco)\b",
    re.IGNORECASE,
)


def acceptable_file(filename, core):
    """Le titre du fichier doit nommer ce parti — et rien d'autre.

    « شعار حزب الشعب الأوروبي » contient « الشعب » mais laisse « الأوروبي » :
    un mot de trop signifie un autre parti, donc on refuse.
    """
    if not LOGO_EXT.search(filename):
        return False
    if PHOTO_WORDS.search(filename) or DECOR_WORDS.search(filename):
        return False
    if FOREIGN_WORDS.search(filename) and not FOREIGN_WORDS.search(core):
        return False
    file_key = normalize_ar(LOGO_EXT.sub("", filename))
    if core not in file_key:
        return False
    residual = FILLER_WORDS.sub(" ", file_key.replace(core, " "))
    return not re.search(r"[؀-ۿ]{3,}", residual)


def file_url(host, filename):
    data = api(
        host,
        action="query",
        titles=f"File:{filename}",
        prop="imageinfo",
        iiprop="url",
        iiurlwidth=THUMB_WIDTH,
    )
    for page in data.get("query", {}).get("pages", {}).values():
        if "missing" in page:
            continue
        info = (page.get("imageinfo") or [{}])[0]
        url = info.get("thumburl") or info.get("url")
        if url:
            return url, f"{host}/wiki/File:{filename}"
    return None, None


def search_logo(host, name, name_key):
    """Recherche de fichier, filtrée par acceptable_file."""
    for query in (f'intitle:"{name}"', f"شعار {name}", f"{name} logo"):
        data = api(host, action="query", list="search", srsearch=query, srnamespace=6, srlimit=15)
        for hit in data.get("query", {}).get("search", []):
            filename = hit["title"].split(":", 1)[1]
            if not acceptable_file(filename, name_key):
                continue
            url, source = file_url(host, filename)
            if url:
                return url, source
    return None, None


def find_logo(name, name_key):
    curated = CURATED.get(name_key)
    if curated:
        filename, host, _ = curated
        url, source = file_url(host, filename)
        if url:
            return url, source
        print(f"  ! curé introuvable: {filename}")
    for host in ("commons.wikimedia.org", "ar.wikipedia.org"):
        try:
            url, source = search_logo(host, name, name_key)
        except requests.RequestException as exc:
            print(f"  ! {name}: {exc}")
            continue
        if url:
            return url, source
    return None, None


# ---------------------------------------------------------------- écriture


def slugify(name, index):
    """Slug ASCII stable ; les noms arabes retombent sur parti-<n>."""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")
    return slug or f"parti-{index:02d}"


def save_image(url, dest):
    """Télécharge et normalise en PNG (largeur max THUMB_WIDTH)."""
    res = SESSION.get(url, timeout=60)
    res.raise_for_status()
    from PIL import Image

    img = Image.open(io.BytesIO(res.content))
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    if img.width > THUMB_WIDTH:
        ratio = THUMB_WIDTH / img.width
        img = img.resize((THUMB_WIDTH, max(1, round(img.height * ratio))), Image.LANCZOS)
    img.save(dest, "PNG", optimize=True)
    return dest


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    parties = collect_names()
    # les partis curés (parlement) d'abord, puis ordre alphabétique
    ordered = sorted(
        parties.items(),
        key=lambda kv: (kv[0] not in CURATED, list(CURATED).index(kv[0]) if kv[0] in CURATED else 0, kv[1][0]),
    )
    print(f"{len(ordered)} partis identifiés\n")

    catalog = []
    for index, (key, (name, article)) in enumerate(ordered):
        slug = slugify(name, index)
        curated = CURATED.get(key)
        entry = {
            "id": slug,
            "name": name,
            "color": curated[2] if curated else PALETTE[index % len(PALETTE)],
            "logo": None,
            "source": None,
        }
        url, source = find_logo(name, key)
        if url:
            try:
                dest = save_image(url, OUT_DIR / f"{slug}.png")
                entry["logo"] = f"/static/parties/{dest.name}"
                entry["source"] = source
            except (requests.RequestException, OSError) as exc:
                print(f"  ! {name}: {exc}")
        print(f"  [{'logo' if entry['logo'] else '—':4}] {name}  {entry['source'] or ''}")
        catalog.append(entry)

    CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    with_logo = sum(1 for c in catalog if c["logo"])
    print(f"\n{CATALOG} — {len(catalog)} partis, {with_logo} avec logo")


if __name__ == "__main__":
    main()
