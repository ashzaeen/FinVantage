# Copilot extension

**Tier:** P0 rental and checkout, P1 vehicle. **Code:** `apps/extension`. **Guide:** `apps/extension/AGENTS.md`. **PRD:** section 6.

## Scope

Detect a high-impact decision on a page, extract the price, and show a card in a Shadow DOM overlay. The user can dismiss, snooze per site, or turn it off.

## You have now

A working extension, tested in real Chrome: detection on demo pages, a service worker that calls the API, an expanding overlay, dismiss for the session, snooze, and a popup toggle.

## Start here

1. Run it from the steps in the guide, and open each demo page.
2. Design the overlay with the dashboard owner.
3. Review keyboard use and contrast in the overlay.
4. Handle the edge cases on the demo pages: no price, several prices, non-USD.
5. As a bonus, add live-site rules. The demo must never depend on them.

## Done means

- Each demo page produces a card within 3 seconds.
- No page text beyond the extracted fields leaves the browser.
- Price not found, or a non-USD price, shows nothing.
- Dismiss holds for the session, and snooze holds per site.
- The extension never clicks or changes anything on the host page.
- With no linked data, the card prompts the user to load the demo profile.

## Depends on

`POST /v1/copilot/evaluate`, which works now with stub figures.
