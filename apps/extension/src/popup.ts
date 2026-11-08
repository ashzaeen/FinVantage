import type { AccountReply, ExtensionMessage } from "./messages";

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
const resetStatus = document.querySelector<HTMLParagraphElement>("#reset-status");

if (reset) {
  reset.addEventListener("click", () => {
    void Promise.all([
      chrome.storage.session.remove("dismissedSites"),
      chrome.storage.local.set({ snoozedSites: [] }),
    ]).then(() => {
      if (resetStatus) resetStatus.textContent = "Done. Refresh the page to see its card again.";
    });
  });
}

// Account: the Copilot follows whoever is signed in to the FinVantage dashboard.
const who = document.querySelector<HTMLParagraphElement>("#who");
const signInButton = document.querySelector<HTMLButtonElement>("#sign-in");
const signOutButton = document.querySelector<HTMLButtonElement>("#sign-out");
const accountStatus = document.querySelector<HTMLParagraphElement>("#account-status");
let webUrl = "";

function showAccount(name: string | null) {
  if (who) {
    who.textContent = name
      ? `Signed in as ${name}. Cards use your accounts and linked banks.`
      : "Signed out. Cards use the demo profile. Sign in on FinVantage and the Copilot follows.";
  }
  if (signInButton) signInButton.hidden = name !== null;
  if (signOutButton) signOutButton.hidden = name === null;
}

void (chrome.runtime.sendMessage({ type: "account" } satisfies ExtensionMessage) as Promise<AccountReply>).then((reply) => {
  webUrl = reply.webUrl;
  showAccount(reply.name);
});

signInButton?.addEventListener("click", () => {
  void chrome.tabs.create({ url: `${webUrl}/login` });
});

signOutButton?.addEventListener("click", () => {
  void chrome.runtime.sendMessage({ type: "signOut" } satisfies ExtensionMessage).then(() => {
    showAccount(null);
    if (accountStatus) accountStatus.textContent = "Signed out of FinVantage. Refresh the page to update its card.";
  });
});
