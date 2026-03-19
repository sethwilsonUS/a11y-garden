/* global chrome */

const TOKEN_PREFIX = "a11y-garden:view-token:";

function parseAuditIdFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : null;
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(response);
    });
  });
}

async function hydrateViewToken() {
  const auditId = parseAuditIdFromPath();
  if (!auditId) return;

  const response = await sendRuntimeMessage({
    type: "A11Y_GARDEN_FETCH_VIEW_TOKEN",
    auditId,
  });

  if (!response?.viewToken) return;

  window.sessionStorage.setItem(`${TOKEN_PREFIX}${auditId}`, response.viewToken);
  window.postMessage(
    {
      type: "A11Y_GARDEN_VIEW_TOKEN_READY",
      auditId,
    },
    window.location.origin,
  );
}

window.addEventListener("message", async (event) => {
  if (event.source !== window) return;
  const data = event.data;

  if (data?.type === "A11Y_GARDEN_CLAIM_TOKEN_REQUEST") {
    const response = await sendRuntimeMessage({
      type: "A11Y_GARDEN_FETCH_CLAIM_TOKEN",
      auditId: data.auditId,
    });
    window.postMessage(
      {
        type: "A11Y_GARDEN_CLAIM_TOKEN_RESPONSE",
        requestId: data.requestId,
        claimToken: response?.claimToken ?? null,
      },
      window.location.origin,
    );
  }

  if (data?.type === "A11Y_GARDEN_CLAIM_COMPLETE") {
    await sendRuntimeMessage({
      type: "A11Y_GARDEN_MARK_CLAIMED",
      auditId: data.auditId,
    });
  }
});

void hydrateViewToken();
