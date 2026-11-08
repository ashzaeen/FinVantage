import type { AccountReply, ExtensionMessage, SignInReply } from "./messages";

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

// Account: signed in, the Copilot uses your own data (and any bank you linked); signed out, the demo.
const who = document.querySelector<HTMLParagraphElement>("#who");
const signInForm = document.querySelector<HTMLFormElement>("#sign-in");
const signOutButton = document.querySelector<HTMLButtonElement>("#sign-out");
const accountStatus = document.querySelector<HTMLParagraphElement>("#account-status");
const emailInput = document.querySelector<HTMLInputElement>("#email");
const passwordInput = document.querySelector<HTMLInputElement>("#password");

function showAccount(name: string | null) {
  if (who) {
    who.textContent = name
      ? `Signed in as ${name}. Cards use your accounts and linked banks.`
      : "Signed out. Cards use the demo profile.";
  }
  if (signInForm) signInForm.hidden = name !== null;
  if (signOutButton) signOutButton.hidden = name === null;
}

void (chrome.runtime.sendMessage({ type: "account" } satisfies ExtensionMessage) as Promise<AccountReply>).then(
  (reply) => showAccount(reply.name),
);

signInForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!emailInput || !passwordInput) return;
  if (accountStatus) accountStatus.textContent = "Signing in…";
  const message: ExtensionMessage = { type: "signIn", email: emailInput.value, password: passwordInput.value };
  passwordInput.value = "";
  void (chrome.runtime.sendMessage(message) as Promise<SignInReply>).then((reply) => {
    if (reply.ok) {
      showAccount(reply.name);
      if (accountStatus) accountStatus.textContent = "Refresh the page to update its card.";
    } else if (accountStatus) {
      accountStatus.textContent = reply.message;
    }
  });
});

signOutButton?.addEventListener("click", () => {
  void chrome.runtime.sendMessage({ type: "signOut" } satisfies ExtensionMessage).then(() => {
    showAccount(null);
    if (accountStatus) accountStatus.textContent = "Signed out. Refresh the page to update its card.";
  });
});
