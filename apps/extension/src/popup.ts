const checkbox = document.querySelector<HTMLInputElement>("#enabled");

if (checkbox) {
  void chrome.storage.local.get("enabled").then((stored) => {
    checkbox.checked = (stored.enabled as boolean | undefined) ?? true;
  });
  checkbox.addEventListener("change", () => {
    void chrome.storage.local.set({ enabled: checkbox.checked });
  });
}
