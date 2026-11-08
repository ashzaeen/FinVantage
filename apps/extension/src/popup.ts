const checkbox = document.querySelector<HTMLInputElement>("#enabled");

if (checkbox) {
  void chrome.storage.local.get("enabled").then((stored) => {
    checkbox.checked = (stored.enabled as boolean | undefined) ?? true;
  });
  checkbox.addEventListener("change", () => {
    void chrome.storage.local.set({ enabled: checkbox.checked });
  });
}

// Brings back every card closed or snoozed, so a demo can run again from the start.
const reset = document.querySelector<HTMLButtonElement>("#reset");
const status = document.querySelector<HTMLParagraphElement>("#reset-status");

if (reset) {
  reset.addEventListener("click", () => {
    void Promise.all([
      chrome.storage.session.remove("dismissedSites"),
      chrome.storage.local.set({ snoozedSites: [] }),
    ]).then(() => {
      if (status) status.textContent = "Done. Refresh the page to see its card again.";
    });
  });
}
