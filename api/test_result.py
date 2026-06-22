from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=False,
        slow_mo=500
    )

    page = browser.new_page()

    page.goto(
        "https://emissioncalculator.ecotransit.world/"
    )

    page.get_by_text("Got it!").click()

    page.locator("#input-vaadin-text-field-19").click()

    page.locator("#input-vaadin-text-field-50").fill("shanghai")
    page.wait_for_timeout(2000)

    page.locator("#transport-type-button-ship-0").click()

    page.locator("#input-vaadin-text-field-97").fill("singapore")

    page.locator(
        "vaadin-grid-cell-content"
    ).filter(
        has_text="Singapore Changi Airport"
    ).click()

    page.get_by_role(
        "button",
        name="Calculate"
    ).click()

    page.wait_for_timeout(5000)
    
    print("Current URL:", page.url)

    page.screenshot(path="result.png", full_page=True)

    input("Check result page then press ENTER...")

    print(page.content())

    input("Press ENTER")

    browser.close()