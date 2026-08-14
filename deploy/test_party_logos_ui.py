"""Vérifie l'ajout d'un parti avec logo dans /configuration (Playwright).

Usage : l'app doit tourner sur http://127.0.0.1:5000
    python deploy/test_party_logos_ui.py
"""
import os
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("KASOFT_URL", "http://127.0.0.1:5000")
PIN = os.environ.get("KASOFT_ADMIN_PIN", "2026")
SHOTS = "output"


def main():
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        page.goto(f"{BASE}/login")
        page.fill("input[type=password]", PIN)
        page.click("button[type=submit]")
        page.wait_for_url(f"{BASE}/dashboard", timeout=15000)

        page.goto(f"{BASE}/configuration")
        page.wait_for_selector("#btn-pick-parti-logo")

        # Ouvre le sélecteur et choisit le premier parti du catalogue
        page.click("#btn-pick-parti-logo")
        page.wait_for_selector(".logo-picker:not(.hidden) .logo-choice")
        count = page.locator(".logo-choice").count()
        print(f"catalogue : {count} partis dans le sélecteur")
        page.screenshot(path=f"{SHOTS}/ui_picker.png")
        first_name = page.locator(".logo-choice .logo-choice-name").first.inner_text()
        page.locator(".logo-choice").first.click()
        page.wait_for_selector(".logo-picker.hidden", state="attached")

        filled = page.input_value("#parti-name")
        print(f"nom prérempli : {filled!r} (attendu {first_name!r})")
        assert filled == first_name, "le choix du catalogue doit remplir le nom"
        assert page.locator("#parti-logo-preview img").count() == 1, "aperçu du logo manquant"

        # Recherche dans le sélecteur
        page.click("#btn-pick-parti-logo")
        page.fill(".logo-picker-search", "الاستقلال")
        page.wait_for_timeout(200)
        found = page.locator(".logo-choice").count()
        print(f"recherche « الاستقلال » : {found} résultat(s)")
        assert 0 < found < count, "la recherche doit filtrer le catalogue"
        page.click(".logo-picker-cancel")

        # Ajoute le parti puis vérifie le logo dans la liste
        page.click("#btn-add-parti")
        page.wait_for_selector("#parti-list .config-item")
        added = page.locator("#parti-list .config-item").last
        assert added.locator(".parti-logo img").count() == 1, "logo absent de la liste"
        page.screenshot(path=f"{SHOTS}/ui_config_partis.png")

        # Sauvegarde puis vérifie le rendu dans le comptage
        page.click("#btn-save-config")
        page.wait_for_timeout(800)
        page.goto(f"{BASE}/comptage")
        page.wait_for_timeout(1200)
        logos = page.locator(".parti-card-header .parti-logo").count()
        print(f"comptage : {logos} logo(s) dans les en-têtes de cartes")
        page.screenshot(path=f"{SHOTS}/ui_comptage.png", full_page=True)

        page.goto(f"{BASE}/dashboard")
        page.wait_for_timeout(1200)
        page.screenshot(path=f"{SHOTS}/ui_dashboard.png")

        browser.close()

    real = [e for e in errors if "favicon" not in e and "manifest" not in e]
    if real:
        print("\nErreurs console :")
        for e in real[:10]:
            print("  -", e)
        return 1
    print("\nOK — aucune erreur console")
    return 0


if __name__ == "__main__":
    sys.exit(main())
